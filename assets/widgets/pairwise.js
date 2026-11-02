/* pairwise — how the provider derives the subject (sub) each app sees from one XID.
   One idea: HKDF over (operator salt, sector, XID) gives every app an unrelated identifier for the same person;
   a public client sees the XID itself. */
(function () {
  window.IK = window.IK || {}; IK.widgets = IK.widgets || {};

  var STYLE_ID = 'ik-pairwise-style';
  var SECTORS = ['taskmaster.dev', 'worldtree.network', '127.0.0.1'];
  var INFO_PREFIX = 'identikey-oidc-sub-v1';
  var ROTATE_LINE = 'Rotating the salt would change every app\'s identifier for every user, which is why it is never rotated.';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.ik-pw .ik-pw-inputs { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }',
      '.ik-pw .ik-pw-field .ik-row { justify-content: space-between; }',
      '.ik-pw .ik-pw-field .ik-label { margin: 0; }',
      '.ik-pw .ik-pw-val { background: var(--code-bg); border-radius: 4px; padding: 0.35rem 0.5rem; margin-top: 0.25rem; }',
      '.ik-pw .ik-pw-val.is-masked { color: var(--ink-3); letter-spacing: 0.05em; }',
      '.ik-pw .ik-pw-val.ik-changed { background: var(--warm-soft); }',
      '.ik-pw .ik-btn.is-tiny { padding: 0.15rem 0.5rem; font-size: 0.75rem; font-weight: 500; }',
      '.ik-pw .ik-pw-chip { font: inherit; font-family: var(--font-mono); font-size: 0.8125rem; cursor: pointer; padding: 0.3rem 0.7rem; border-radius: 999px; border: 1px solid var(--rule); background: var(--paper); color: var(--ink); }',
      '.ik-pw .ik-pw-chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }',
      '.ik-pw .ik-pw-custom { width: auto; min-width: 11rem; flex: 1 1 11rem; }',
      '.ik-pw .ik-pw-grid { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }',
      '.ik-pw .ik-panel > h3 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.5rem; font-family: var(--font-mono); word-break: break-all; }',
      '.ik-pw .ik-pw-sub { font-size: 0.9rem; background: var(--code-bg); border-radius: 4px; padding: 0.4rem 0.5rem; transition: background-color 0.9s ease; }',
      '.ik-pw .ik-pw-sub.ik-changed { transition: none; }',
      '.ik-pw .ik-pw-how { list-style: none; margin: 0.5rem 0 0; padding: 0; display: grid; gap: 0.3rem; font-size: 0.78rem; color: var(--ink-2); }',
      '.ik-pw .ik-pw-how strong { color: var(--ink); font-weight: 600; font-family: var(--font-display); }',
      '.ik-pw .ik-pw-how .is-dim { color: var(--ink-3); }',
      '.ik-pw .ik-pw-check { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; }',
      '.ik-pw .ik-pw-check input { width: auto; margin: 0; }',
      '.ik-pw .ik-pw-note { margin: 0; font-size: 0.85rem; color: var(--ink-2); }',
      '.ik-pw .ik-pw-note.is-warm { color: var(--warm); font-weight: 600; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(id, text, cls) {
    var b = el('button', 'ik-btn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button'; b.id = id;
    return b;
  }
  function hex(b) { return IKCrypto.bytesToHex(b); }
  function mask(h) { return h.replace(/./g, '•'); }
  function concat(a, b) { var out = new Uint8Array(a.length + b.length); out.set(a, 0); out.set(b, a.length); return out; }

  // subject = base58( HKDF-SHA-256( ikm = pairwise salt, salt = sector bytes, info = prefix || 0x00 || XID, 32 ) )
  function deriveSub(pairwiseSalt, sector, xid) {
    var info = concat(IKCrypto.utf8ToBytes(INFO_PREFIX + '\u0000'), xid);
    return IKCrypto.base58(IKCrypto.hkdf(IKCrypto.sha256, pairwiseSalt, IKCrypto.utf8ToBytes(sector), info, 32));
  }

  IK.widgets['pairwise'] = function (root, opts) {
    ensureStyle();
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var w = el('div', 'ik-widget ik-pw');
    var stack = el('div', 'ik-stack');
    w.appendChild(stack);

    /* ---------- Fixed inputs ---------- */
    var inputs = el('div', 'ik-pw-inputs');
    var xidField = el('div', 'ik-panel ik-pw-field');
    var xidHead = el('div', 'ik-row');
    var xidLab = el('span', 'ik-label', 'Your XID, the same everywhere'); xidLab.id = 'pairwise-xid-label';
    xidHead.appendChild(xidLab);
    var xidVal = el('div', 'ik-mono ik-pw-val'); xidVal.id = 'pairwise-xid'; xidVal.setAttribute('aria-labelledby', xidLab.id);
    xidField.appendChild(xidHead); xidField.appendChild(xidVal);

    var saltField = el('div', 'ik-panel ik-pw-field');
    var saltHead = el('div', 'ik-row');
    var saltLab = el('span', 'ik-label', 'Pairwise salt: operator secret, never leaves the provider'); saltLab.id = 'pairwise-salt-label';
    var showBtn = btn('pairwise-salt-toggle', 'Show', 'is-secondary is-tiny');
    showBtn.setAttribute('aria-pressed', 'false'); showBtn.setAttribute('aria-controls', 'pairwise-salt');
    saltHead.appendChild(saltLab); saltHead.appendChild(showBtn);
    var saltVal = el('div', 'ik-mono ik-pw-val'); saltVal.id = 'pairwise-salt'; saltVal.setAttribute('aria-labelledby', saltLab.id);
    saltField.appendChild(saltHead); saltField.appendChild(saltVal);
    inputs.appendChild(xidField); inputs.appendChild(saltField);
    stack.appendChild(inputs);

    /* ---------- Sector chooser ---------- */
    var chooser = el('div');
    var chooserLab = el('span', 'ik-label', 'Sector: the host of the app\'s redirect URI, pinned in its registration'); chooserLab.id = 'pairwise-sectors-label';
    chooser.appendChild(chooserLab);
    var chipRow = el('div', 'ik-row'); chipRow.setAttribute('role', 'group'); chipRow.setAttribute('aria-labelledby', chooserLab.id);
    var chips = SECTORS.map(function (sec, i) {
      var c = el('button', 'ik-pw-chip', sec);
      c.type = 'button'; c.id = 'pairwise-sector-' + i; c.setAttribute('aria-pressed', 'false');
      chipRow.appendChild(c);
      return c;
    });
    var custom = el('input', 'ik-input ik-pw-custom');
    custom.id = 'pairwise-custom'; custom.type = 'text'; custom.placeholder = 'any sector, e.g. example.org';
    custom.setAttribute('aria-label', 'Any other sector'); custom.spellcheck = false; custom.setAttribute('autocapitalize', 'off');
    chipRow.appendChild(custom);
    chooser.appendChild(chipRow);
    stack.appendChild(chooser);

    var ctrlRow = el('div', 'ik-row');
    var pubCheck = el('label', 'ik-pw-check'); pubCheck.htmlFor = 'pairwise-public';
    var cb = el('input'); cb.type = 'checkbox'; cb.id = 'pairwise-public';
    pubCheck.appendChild(cb); pubCheck.appendChild(document.createTextNode('Public subject instead'));
    var newSalt = btn('pairwise-newsalt', 'New salt', 'is-secondary');
    ctrlRow.appendChild(pubCheck); ctrlRow.appendChild(newSalt);
    stack.appendChild(ctrlRow);
    var note = el('p', 'ik-pw-note'); note.id = 'pairwise-note'; note.setAttribute('aria-live', 'polite');
    stack.appendChild(note);

    /* ---------- Per-sector panels ---------- */
    var grid = el('div', 'ik-pw-grid');
    function makePanel(idx) {
      var p = el('section', 'ik-panel'); p.id = 'pairwise-panel-' + idx;
      var h = el('h3'); h.id = p.id + '-title'; p.setAttribute('aria-labelledby', h.id);
      p.appendChild(h);
      p.appendChild(el('span', 'ik-label', 'sub this app sees'));
      var sub = el('div', 'ik-mono ik-pw-sub'); sub.id = 'pairwise-sub-' + idx;
      p.appendChild(sub);
      var how = el('ul', 'ik-pw-how');
      var ikm = el('li', 'ik-mono'), salt = el('li', 'ik-mono'), info = el('li', 'ik-mono');
      how.appendChild(ikm); how.appendChild(salt); how.appendChild(info);
      p.appendChild(how);
      grid.appendChild(p);
      return { root: p, title: h, sub: sub, ikm: ikm, salt: salt, info: info, how: how, last: null };
    }
    var panels = SECTORS.map(function (_, i) { return makePanel(i); });
    var customPanel = makePanel(SECTORS.length);
    customPanel.root.hidden = true;
    stack.appendChild(grid);
    root.appendChild(w);

    /* ---------- State ---------- */
    var xid = IKCrypto.randomBytes(32);
    var xidB58 = IKCrypto.base58(xid);
    var pairwiseSalt = IKCrypto.randomBytes(32);
    var saltShown = false;
    var selected = 0;          // index into SECTORS, or SECTORS.length for the custom sector
    var clearTimer = null;

    function renderSalt() {
      var h = hex(pairwiseSalt);
      saltVal.textContent = saltShown ? h : mask(h);
      saltVal.classList.toggle('is-masked', !saltShown);
      showBtn.textContent = saltShown ? 'Hide' : 'Show';
      showBtn.setAttribute('aria-pressed', saltShown ? 'true' : 'false');
    }

    function howLine(li, name, value, dim) {
      li.textContent = '';
      li.appendChild(el('strong', null, name + ' = '));
      var v = el('span', dim ? 'is-dim' : null, value);
      li.appendChild(v);
    }

    function renderPanel(pn, sector, flash) {
      var isPublic = cb.checked;
      pn.title.textContent = sector;
      var sub = isPublic ? xidB58 : deriveSub(pairwiseSalt, sector, xid);
      var moved = flash && pn.last !== null && pn.last !== sub;
      pn.sub.textContent = sub;
      pn.sub.classList.toggle('ik-changed', !!moved);
      pn.last = sub;
      pn.how.hidden = isPublic;
      if (!isPublic) {
        howLine(pn.ikm, 'ikm', saltShown ? hex(pairwiseSalt) : mask(hex(pairwiseSalt)) + ' (the operator secret)', !saltShown);
        howLine(pn.salt, 'salt', '"' + sector + '" as UTF-8 bytes (' + IKCrypto.utf8ToBytes(sector).length + ' bytes)');
        howLine(pn.info, 'info', '"' + INFO_PREFIX + '" || 0x00 || ' + hex(xid));
      }
    }

    function renderAll(flash) {
      renderSalt();
      xidVal.textContent = xidB58;
      var customSector = custom.value.trim();
      for (var i = 0; i < SECTORS.length; i++) {
        renderPanel(panels[i], SECTORS[i], flash);
        panels[i].root.classList.toggle('is-accent', selected === i);
        chips[i].setAttribute('aria-pressed', selected === i ? 'true' : 'false');
      }
      customPanel.root.hidden = !customSector;
      if (customSector) renderPanel(customPanel, customSector, flash);
      customPanel.root.classList.toggle('is-accent', selected === SECTORS.length && !!customSector);
      if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
      if (flash) {
        clearTimer = setTimeout(function () {
          panels.concat([customPanel]).forEach(function (pn) { pn.sub.classList.remove('ik-changed'); });
        }, reduced ? 0 : 1600);
      }
    }

    function describe() {
      if (cb.checked) {
        note.className = 'ik-pw-note';
        note.textContent = 'Public subject: the client is registered with subject type public, so sub is the base58 XID itself, the same string at every app. IdentiKey uses this only where the user wants the identifier they publish and the one the system checks to be the same, such as the Mjolnir command line.';
      } else {
        note.className = 'ik-pw-note';
        note.textContent = 'Pairwise subject (the default): the same XID and the same salt give each sector an unrelated 32-byte value, so two apps comparing their sub values cannot tell they share a user, and no one can work back to the XID without the salt.';
      }
    }

    /* ---------- Wiring ---------- */
    chips.forEach(function (c, i) {
      c.addEventListener('click', function () { selected = i; renderAll(false); });
    });
    custom.addEventListener('input', function () {
      selected = custom.value.trim() ? SECTORS.length : selected === SECTORS.length ? 0 : selected;
      renderAll(false);
    });
    custom.addEventListener('focus', function () { if (custom.value.trim()) { selected = SECTORS.length; renderAll(false); } });
    showBtn.addEventListener('click', function () { saltShown = !saltShown; renderAll(false); });
    cb.addEventListener('change', function () { renderAll(true); describe(); });
    newSalt.addEventListener('click', function () {
      pairwiseSalt = IKCrypto.randomBytes(32);
      saltVal.classList.add('ik-changed');
      setTimeout(function () { saltVal.classList.remove('ik-changed'); }, reduced ? 0 : 1600);
      renderAll(true);
      note.className = 'ik-pw-note is-warm';
      note.textContent = cb.checked
        ? 'The salt changed, but a public subject does not use it: every sub is still the XID. ' + ROTATE_LINE
        : 'Every pairwise sub changed at once. ' + ROTATE_LINE;
    });

    renderAll(false);
    describe();
  };
})();
