/* hash — SHA-256 (or BLAKE3) digest of editable text, shown as hex and as a 16x16 fingerprint grid.
   opts.algorithms: ["sha256"] (default) or ["sha256", "blake3"] to offer a choice; both digests are 32 bytes.
   One idea: the same input always gives the same digest; one changed character scrambles it. */
(function () {
  window.IK = window.IK || {}; IK.widgets = IK.widgets || {};

  var ORIGINAL = 'Release 2.4.1 fixes the login timeout.\nNo database changes are required.';
  var STYLE_ID = 'ik-hash-style';
  var ALGOS = {
    sha256: { name: 'SHA-256', fn: function (b) { return IKCrypto.sha256(b); } },
    blake3: { name: 'BLAKE3', fn: function (b) { return IKCrypto.blake3(b); } }
  };

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.ik-hash .ik-hash-out { display: grid; gap: 0.75rem; grid-template-columns: minmax(0, 1fr) auto; align-items: start; }',
      '@media (max-width: 480px) { .ik-hash .ik-hash-out { grid-template-columns: minmax(0, 1fr); } }',
      '.ik-hash .ik-hash-hex { font-family: var(--font-mono); font-size: 0.8125rem; line-height: 1.6; word-break: break-all; letter-spacing: 0.04em; max-width: 34.5ch; }',
      '.ik-hash .ik-hash-hex span { display: inline-block; border-radius: 2px; transition: background-color 0.9s ease, color 0.9s ease; }',
      '.ik-hash .ik-hash-hex span.ik-changed { transition: none; }',
      '.ik-hash .ik-hash-grid { display: grid; grid-template-columns: repeat(16, 9px); grid-auto-rows: 9px; gap: 1px; padding: 3px; background: var(--rule); border: 1px solid var(--rule); border-radius: 4px; width: max-content; }',
      '.ik-hash .ik-hash-grid i { display: block; background: var(--ink); }',
      '.ik-hash .ik-hash-facts { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.25rem; font-size: 0.8125rem; color: var(--ink-2); }',
      '.ik-hash .ik-hash-facts li::before { content: ""; display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 999px; background: var(--accent); margin-right: 0.5rem; vertical-align: middle; }',
      '.ik-hash .ik-hash-facts li.is-warm::before { background: var(--warm); }',
      '.ik-hash .ik-hash-facts strong { color: var(--ink); font-weight: 600; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  IK.widgets['hash'] = function (root, opts) {
    ensureStyle();
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var w = el('div', 'ik-widget ik-hash');
    var stack = el('div', 'ik-stack');
    w.appendChild(stack);

    // Input
    var inLabel = el('label', 'ik-label', 'Text (edit it)');
    inLabel.htmlFor = 'hash-text';
    var ta = el('textarea', 'ik-textarea');
    ta.id = 'hash-text';
    ta.rows = 3;
    ta.spellcheck = false;
    ta.value = ORIGINAL;
    var inWrap = el('div');
    inWrap.appendChild(inLabel); inWrap.appendChild(ta);
    stack.appendChild(inWrap);

    var algos = (opts && opts.algorithms && opts.algorithms.length ? opts.algorithms : ['sha256']).filter(function (a) { return ALGOS[a]; });
    if (!algos.length) algos = ['sha256'];
    var algo = algos[0];

    var row = el('div', 'ik-row');
    var select = null;
    if (algos.length > 1) {
      var selLabel = el('label', 'ik-label', 'Hash function');
      selLabel.htmlFor = 'hash-algo';
      selLabel.style.margin = '0';
      select = el('select', 'ik-select');
      select.id = 'hash-algo';
      algos.forEach(function (a) { var o = el('option', null, ALGOS[a].name); o.value = a; select.appendChild(o); });
      row.appendChild(selLabel); row.appendChild(select);
    }
    var restore = el('button', 'ik-btn is-secondary', 'Restore original');
    restore.id = 'hash-restore';
    restore.type = 'button';
    var status = el('span', 'ik-help');
    status.id = 'hash-status';
    status.style.margin = '0';
    status.setAttribute('aria-live', 'polite');
    row.appendChild(restore); row.appendChild(status);
    stack.appendChild(row);

    // Output: hex + fingerprint grid
    var outLabel = el('span', 'ik-label', ALGOS[algo].name + ' digest (32 bytes, 64 hex digits)');
    var out = el('div', 'ik-hash-out');
    var hex = el('div', 'ik-hash-hex');
    hex.id = 'hash-hex';
    hex.setAttribute('aria-live', 'polite');
    var grid = el('div', 'ik-hash-grid');
    grid.id = 'hash-grid';
    grid.setAttribute('role', 'img');
    grid.setAttribute('aria-label', 'Fingerprint grid: 16 by 16 cells, one per bit of the digest, shaded by the value of the byte each bit belongs to');
    out.appendChild(hex); out.appendChild(grid);
    var outWrap = el('div', 'ik-panel');
    outWrap.appendChild(outLabel); outWrap.appendChild(out);
    stack.appendChild(outWrap);

    // Live facts
    var facts = el('ul', 'ik-hash-facts');
    facts.id = 'hash-facts';
    var fSame = el('li'); fSame.id = 'hash-fact-same';
    var fOneWay = el('li'); fOneWay.id = 'hash-fact-oneway';
    var fDiff = el('li'); fDiff.id = 'hash-fact-diff';
    facts.appendChild(fSame); facts.appendChild(fOneWay); facts.appendChild(fDiff);
    stack.appendChild(facts);

    root.appendChild(w);

    // Build 64 hex spans and 256 grid cells once
    var hexSpans = [];
    for (var i = 0; i < 64; i++) { var sp = el('span'); hexSpans.push(sp); hex.appendChild(sp); }
    var cells = [];
    for (var c = 0; c < 256; c++) { var cell = el('i'); cells.push(cell); grid.appendChild(cell); }

    function digest(text) { return ALGOS[algo].fn(IKCrypto.utf8ToBytes(text)); }
    var originalHex = IKCrypto.bytesToHex(digest(ORIGINAL));
    var prevHex = null;
    var clearTimer = null;

    function charDiff(a, b) {
      var n = 0;
      for (var k = 0; k < a.length; k++) if (a[k] !== b[k]) n++;
      return n;
    }

    // Levenshtein distance between two short strings (how many characters were edited).
    function editDistance(a, b) {
      if (a.length * b.length > 250000) return Math.abs(a.length - b.length) || 1;
      var prev = [], cur = [], i, j;
      for (j = 0; j <= b.length; j++) prev[j] = j;
      for (i = 1; i <= a.length; i++) {
        cur[0] = i;
        for (j = 1; j <= b.length; j++) {
          cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        var t = prev; prev = cur; cur = t;
      }
      return prev[b.length];
    }

    function setFact(li, strong, rest, warm) {
      li.textContent = '';
      li.className = warm ? 'is-warm' : '';
      li.appendChild(el('strong', null, strong));
      if (rest) li.appendChild(document.createTextNode(' ' + rest));
    }

    function render(flash) {
      var text = ta.value;
      var bytes = digest(text);
      var h = IKCrypto.bytesToHex(bytes);

      var changed = 0;
      for (var k = 0; k < 64; k++) {
        var sp = hexSpans[k];
        sp.textContent = h[k];
        var moved = prevHex !== null && prevHex[k] !== h[k];
        if (moved) changed++;
        if (flash && moved) sp.classList.add('ik-changed'); else sp.classList.remove('ik-changed');
      }
      if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
      if (flash && changed) {
        clearTimer = setTimeout(function () {
          for (var j = 0; j < 64; j++) hexSpans[j].classList.remove('ik-changed');
        }, reduced ? 0 : 1400);
      }

      // 256 cells: one per bit, in byte order; set bits are shaded darker the larger their byte's value.
      for (var b = 0; b < 32; b++) {
        var v = bytes[b];
        var shade = (0.45 + 0.55 * (v / 255)).toFixed(2);
        for (var bit = 0; bit < 8; bit++) {
          var on = (v >> (7 - bit)) & 1;
          var cl = cells[b * 8 + bit];
          cl.style.background = on ? 'var(--ink)' : 'var(--paper)';
          cl.style.opacity = on ? shade : '1';
        }
      }

      var isOriginal = text === ORIGINAL;
      var textDiff = isOriginal ? 0 : editDistance(text, ORIGINAL);

      if (isOriginal) {
        status.textContent = prevHex === null ? '' : 'Back to the original text: the digest is identical again.';
        setFact(fSame, 'Same input, same digest.', 'This text has been hashed before and produced exactly this value.');
      } else {
        status.textContent = '';
        setFact(fSame, 'Same input, same digest.', 'Restore the original text and the original digest comes back exactly.');
      }
      setFact(fOneWay, 'No way back from digest to text.', 'Nothing in these 64 hex digits lets anyone recover the text.');

      if (isOriginal) {
        setFact(fDiff, 'Original digest.', 'Change one character above and watch how many hex digits move.', false);
      } else {
        var fromOrig = charDiff(h, originalHex);
        var edits = textDiff === 1 ? 'One character changed' : (textDiff + ' characters changed');
        setFact(fDiff, edits + ' ' + fromOrig + ' of 64 hex digits', '(compared with the original digest; about 60 is typical, and which digits move is unpredictable).', true);
      }
      prevHex = h;
    }

    ta.addEventListener('input', function () { render(true); });
    if (select) select.addEventListener('change', function () {
      algo = select.value;
      outLabel.textContent = ALGOS[algo].name + ' digest (32 bytes, 64 hex digits)';
      originalHex = IKCrypto.bytesToHex(digest(ORIGINAL));
      render(true);
      status.textContent = 'Now hashing with ' + ALGOS[algo].name + ': same text, a different function, an unrelated digest.';
    });
    restore.addEventListener('click', function () {
      ta.value = ORIGINAL;
      render(true);
      status.textContent = 'Back to the original text: the digest is identical again.';
      ta.focus();
    });

    render(false);
  };
})();
