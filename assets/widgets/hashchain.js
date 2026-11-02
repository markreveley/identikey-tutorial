/* hashchain — a five-row consent log whose rows are hash-chained.
   One idea: each row's hash covers its fields and the previous row's hash, so editing any row changes its
   hash and breaks every row after it against what was recorded. */
(function () {
  window.IK = window.IK || {}; IK.widgets = IK.widgets || {};

  var STYLE_ID = 'ik-hashchain-style';
  var ACTIONS = ['signing_instruction_authorized', 'signing_completed', 'signing_failed', 'encapsulation_export'];
  var LEVELS = ['a3', 'a4'];
  var RESULTS = ['signed', 'refused', 'error'];
  var FIELDS = ['seq', 'action', 'audience', 'purpose', 'access_level', 'result', 'prev_hash'];
  var ORIGINAL = [
    { seq: 1, action: 'signing_instruction_authorized', audience: 'payroll.example', purpose: 'Approve payroll run', access_level: 'a3', result: 'signed' },
    { seq: 2, action: 'signing_completed', audience: 'payroll.example', purpose: 'Approve payroll run', access_level: 'a3', result: 'signed' },
    { seq: 3, action: 'signing_instruction_authorized', audience: 'deeds.example', purpose: 'Sign lease renewal', access_level: 'a4', result: 'signed' },
    { seq: 4, action: 'signing_failed', audience: 'deeds.example', purpose: 'Sign lease renewal', access_level: 'a4', result: 'error' },
    { seq: 5, action: 'encapsulation_export', audience: 'backup.example', purpose: 'Export key share', access_level: 'a4', result: 'refused' }
  ];
  var ZERO32 = new Uint8Array(32);

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.ik-hc .ik-hc-scroll { overflow-x: auto; max-width: 100%; border: 1px solid var(--rule); border-radius: 6px; }',
      '.ik-hc table { border-collapse: collapse; font-size: 0.8125rem; min-width: max-content; }',
      '.ik-hc th, .ik-hc td { padding: 0.3rem 0.4rem; text-align: left; white-space: nowrap; border-bottom: 1px solid var(--rule); vertical-align: middle; }',
      '.ik-hc th { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-3); font-weight: 600; background: var(--paper-2); }',
      '.ik-hc tr:last-child td { border-bottom: 0; }',
      '.ik-hc td.ik-hc-seq { color: var(--ink-2); font-family: var(--font-mono); }',
      '.ik-hc td .ik-input { width: 7rem; padding: 0.25rem 0.4rem; font-size: 0.75rem; }',
      '.ik-hc td .ik-select { padding: 0.25rem 0.2rem; font-size: 0.75rem; max-width: 9rem; }',
      '.ik-hc td.ik-changed { background: var(--warm-soft); color: var(--warm); border-radius: 0; }',
      '.ik-hc td.ik-changed .ik-input, .ik-hc td.ik-changed .ik-select { border-color: var(--warm); color: var(--warm); }',
      '.ik-hc td.ik-hc-hash { font-family: var(--font-mono); cursor: help; }',
      '.ik-hc td.ik-hc-hash.ik-changed { font-weight: 600; }',
      '.ik-hc .ik-hc-lead { margin: 0; font-size: 0.9rem; }',
      '.ik-hc .ik-hc-summary { margin: 0; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function select(id, options, value) {
    var s = el('select', 'ik-select'); s.id = id;
    options.forEach(function (o) { var op = el('option', null, o); op.value = o; s.appendChild(op); });
    s.value = value;
    return s;
  }
  function input(id, value) {
    var i = el('input', 'ik-input'); i.id = id; i.type = 'text'; i.value = value; i.spellcheck = false; i.autocomplete = 'off';
    return i;
  }

  // Length-prefixed encoding: for each field in FIELDS order, 4 bytes big-endian length, then the bytes.
  // seq is its decimal text; prev_hash is the raw 32 bytes.
  function encodeRow(row, prevHash) {
    var parts = [], total = 0;
    FIELDS.forEach(function (f) {
      var bytes = f === 'prev_hash' ? prevHash : IKCrypto.utf8ToBytes(String(row[f]));
      parts.push(bytes); total += 4 + bytes.length;
    });
    var out = new Uint8Array(total), p = 0;
    parts.forEach(function (b) {
      var n = b.length;
      out[p++] = (n >>> 24) & 255; out[p++] = (n >>> 16) & 255; out[p++] = (n >>> 8) & 255; out[p++] = n & 255;
      out.set(b, p); p += n;
    });
    return out;
  }

  // Hash the whole chain in order; returns [{ prevHash, hash }] as Uint8Arrays.
  function chain(rows) {
    var out = [], prev = ZERO32;
    rows.forEach(function (r) {
      var h = IKCrypto.sha256(encodeRow(r, prev));
      out.push({ prevHash: prev, hash: h });
      prev = h;
    });
    return out;
  }
  function hex(b) { return IKCrypto.bytesToHex(b); }
  function same(a, b) { return hex(a) === hex(b); }

  IK.widgets['hashchain'] = function (root, opts) {
    ensureStyle();

    var w = el('div', 'ik-widget ik-hc');
    var stack = el('div', 'ik-stack');
    w.appendChild(stack);

    stack.appendChild(el('p', 'ik-hc-lead', 'Edit any cell. The hash of that row changes, and because each row includes the previous hash, every row after it breaks too.'));

    var scroll = el('div', 'ik-hc-scroll');
    var table = el('table');
    table.id = 'hashchain-table';
    var cap = el('caption', null, 'Consent log, five rows, hash-chained');
    cap.style.position = 'absolute'; cap.style.width = '1px'; cap.style.height = '1px'; cap.style.overflow = 'hidden'; cap.style.clip = 'rect(0 0 0 0)';
    table.appendChild(cap);
    var thead = el('thead'); var hr = el('tr');
    ['seq', 'action', 'audience', 'purpose', 'access', 'result', 'prev_hash', 'hash', 'check'].forEach(function (h) {
      var th = el('th', null, h); th.scope = 'col'; hr.appendChild(th);
    });
    thead.appendChild(hr); table.appendChild(thead);
    var tbody = el('tbody'); table.appendChild(tbody);
    scroll.appendChild(table);
    stack.appendChild(scroll);

    var row = el('div', 'ik-row');
    var restore = el('button', 'ik-btn is-secondary', 'Restore the log');
    restore.type = 'button'; restore.id = 'hashchain-restore';
    var summary = el('p', 'ik-help ik-hc-summary'); summary.id = 'hashchain-summary';
    summary.setAttribute('role', 'status'); summary.setAttribute('aria-live', 'polite');
    row.appendChild(restore); row.appendChild(summary);
    stack.appendChild(row);

    stack.appendChild(el('p', 'ik-help', 'hash = SHA-256 over the fields seq, action, audience, purpose, access_level, result, prev_hash in that order, each written as its byte length in 4 bytes big-endian followed by the bytes. Row 1\'s prev_hash is 32 zero bytes. Hover a hash for the full 64 hex digits; "recorded" means the value stored when the row was written.'));

    root.appendChild(w);

    /* ---------- State ---------- */
    var rows = ORIGINAL.map(function (r) { return { seq: r.seq, action: r.action, audience: r.audience, purpose: r.purpose, access_level: r.access_level, result: r.result }; });
    var recorded = chain(ORIGINAL);   // frozen: what the log recorded when each row was written
    var cells = [];                    // per row: { tds: {field: td}, controls: {field: el}, prevTd, hashTd, checkTd, chip }

    function buildRows() {
      tbody.textContent = '';
      cells = [];
      rows.forEach(function (r, i) {
        var tr = el('tr'); tr.id = 'hashchain-row-' + r.seq;
        var c = { tds: {}, controls: {} };
        var tdSeq = el('td', 'ik-hc-seq', String(r.seq)); tr.appendChild(tdSeq);

        function ctrlCell(field, ctrl) {
          var td = el('td');
          ctrl.setAttribute('aria-label', field + ', row ' + r.seq);
          td.appendChild(ctrl); tr.appendChild(td);
          c.tds[field] = td; c.controls[field] = ctrl;
          ctrl.addEventListener('input', function () { rows[i][field] = ctrl.value; render(); });
          ctrl.addEventListener('change', function () { rows[i][field] = ctrl.value; render(); });
        }
        ctrlCell('action', select('hashchain-action-' + r.seq, ACTIONS, r.action));
        ctrlCell('audience', input('hashchain-audience-' + r.seq, r.audience));
        ctrlCell('purpose', input('hashchain-purpose-' + r.seq, r.purpose));
        ctrlCell('access_level', select('hashchain-access-' + r.seq, LEVELS, r.access_level));
        ctrlCell('result', select('hashchain-result-' + r.seq, RESULTS, r.result));

        c.prevTd = el('td', 'ik-hc-hash'); c.prevTd.id = 'hashchain-prev-' + r.seq; tr.appendChild(c.prevTd);
        c.hashTd = el('td', 'ik-hc-hash'); c.hashTd.id = 'hashchain-hash-' + r.seq; tr.appendChild(c.hashTd);
        c.checkTd = el('td'); c.checkTd.id = 'hashchain-check-' + r.seq;
        c.chip = el('span', 'ik-chip'); c.checkTd.appendChild(c.chip); tr.appendChild(c.checkTd);

        tbody.appendChild(tr);
        cells.push(c);
      });
    }

    function render() {
      var live = chain(rows);
      var firstBroken = -1, firstLinkBreak = -1, editedRows = [];
      rows.forEach(function (r, i) {
        var c = cells[i];
        var edited = false;
        ['action', 'audience', 'purpose', 'access_level', 'result'].forEach(function (f) {
          var ch = String(r[f]) !== String(ORIGINAL[i][f]);
          if (ch) edited = true;
          c.tds[f].classList.toggle('ik-changed', ch);
        });
        if (edited) editedRows.push(r.seq);

        var ph = hex(live[i].prevHash), h = hex(live[i].hash);
        c.prevTd.textContent = ph.slice(0, 8);
        c.prevTd.title = 'prev_hash (recomputed): ' + ph + '\nprev_hash (recorded): ' + hex(recorded[i].prevHash);
        c.prevTd.classList.toggle('ik-changed', !same(live[i].prevHash, recorded[i].prevHash));
        c.hashTd.textContent = h.slice(0, 8);
        c.hashTd.title = 'hash (recomputed): ' + h + '\nhash (recorded): ' + hex(recorded[i].hash);
        c.hashTd.classList.toggle('ik-changed', !same(live[i].hash, recorded[i].hash));

        // The chain check: the row's recorded prev_hash must equal the previous row's recomputed hash,
        // and the row's recomputed hash must equal what was recorded for it.
        var prevExpected = i === 0 ? ZERO32 : live[i - 1].hash;
        var linkOk = same(recorded[i].prevHash, prevExpected);
        var hashOk = same(live[i].hash, recorded[i].hash);
        var ok = linkOk && hashOk;
        if (!ok && firstBroken < 0) firstBroken = i;
        if (!linkOk && firstLinkBreak < 0) firstLinkBreak = i;
        c.chip.className = 'ik-chip ' + (ok ? 'is-good' : 'is-bad');
        c.chip.textContent = ok ? 'matches' : 'broken';
        c.chip.title = ok ? 'Recomputed hash equals the recorded hash, and prev_hash links to the previous row.'
          : (!linkOk ? 'Recorded prev_hash no longer equals the previous row\'s recomputed hash.' : 'Recomputed hash no longer equals the recorded hash.');
      });

      if (firstBroken < 0) {
        summary.className = 'ik-help ik-hc-summary ik-ok';
        summary.textContent = 'All five rows match what was recorded.';
      } else {
        summary.className = 'ik-help ik-hc-summary ik-fail';
        var broken = rows.length - firstBroken;
        var text = 'Row ' + (editedRows.length ? editedRows.join(' and ') : rows[firstBroken].seq) + ' was edited, so its hash changed';
        if (firstLinkBreak >= 0) text += ' and row ' + rows[firstLinkBreak].seq + '\'s recorded prev_hash no longer links to it';
        text += ': ' + broken + ' of 5 rows broken (' + (firstBroken + 1 === rows.length ? 'row 5' : 'rows ' + rows[firstBroken].seq + ' to 5') + ').';
        summary.textContent = text;
      }
    }

    restore.addEventListener('click', function () {
      rows.forEach(function (r, i) {
        ['action', 'audience', 'purpose', 'access_level', 'result'].forEach(function (f) {
          r[f] = ORIGINAL[i][f];
          cells[i].controls[f].value = ORIGINAL[i][f];
        });
      });
      render();
      summary.textContent = 'Restored: every row matches what was recorded again.';
      cells[0].controls.action.focus();
    });

    buildRows();
    render();
  };
})();
