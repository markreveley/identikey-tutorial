/* oidcflow — the authorization-code flow with PKCE of section 10, animated as a sequence diagram.
   One idea: the app invents a secret (code_verifier) at the start, sends only its hash (code_challenge),
   and reveals the secret at the end; whoever captures the code in the middle cannot redeem it. */
(function () {
  window.IK = window.IK || {}; IK.widgets = IK.widgets || {};

  var STEP_MS = 900;
  var STYLE_ID = 'ik-oidcflow-style';
  var NS = 'http://www.w3.org/2000/svg';
  var W = 720, ROW = 42, TOP = 72;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.ik-oidc .ik-oidc-diagram { background: var(--paper); border: 1px solid var(--rule); border-radius: 6px; padding: 0.25rem; }',
      '.ik-oidc .ik-oidc-diagram { overflow-x: auto; }',
      '.ik-oidc .ik-oidc-diagram svg { width: 100%; min-width: 600px; }',
      '.ik-oidc .ik-oidc-cols { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); align-items: start; }',
      '.ik-oidc .ik-panel > h3 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.6rem; }',
      '.ik-oidc .ik-oidc-kv { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.25rem 0.6rem; font-size: 0.8125rem; margin: 0; }',
      '.ik-oidc .ik-oidc-kv dt { color: var(--ink-3); margin: 0; }',
      '.ik-oidc .ik-oidc-kv dd { margin: 0; color: var(--ink); }',
      '.ik-oidc .ik-oidc-kv dd.is-pending { color: var(--ink-3); font-family: var(--font-display); }',
      '.ik-oidc .ik-oidc-kv dd.ik-changed { padding: 0 0.25rem; }',
      '.ik-oidc .ik-oidc-checks { list-style: none; padding: 0; margin: 0.35rem 0 0; display: grid; gap: 0.25rem; }',
      '.ik-oidc .ik-oidc-checks li { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: baseline; padding: 0.15rem 0.3rem; border-radius: 4px; font-size: 0.8125rem; }',
      '.ik-oidc .ik-oidc-checks li.is-failed { background: var(--bad-soft); }',
      '.ik-oidc .ik-oidc-checks li .ik-chip { min-width: 4.5rem; text-align: center; }',
      '.ik-oidc .ik-oidc-checks li.is-attacker { border-left: 3px solid var(--bad); }',
      '.ik-oidc .ik-steps li { transition: background-color 0.3s ease; }',
      '.ik-oidc .ik-steps li.is-done { color: var(--ink-2); }',
      '.ik-oidc .ik-oidc-toggle { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; cursor: pointer; }',
      '.ik-oidc .ik-oidc-toggle input { width: 1rem; height: 1rem; margin: 0; accent-color: var(--bad); }',
      '.ik-oidc .ik-oidc-status { margin: 0; padding: 0.5rem 0.6rem; border-radius: 4px; background: var(--paper-2); font-size: 0.875rem; }',
      '.ik-oidc .ik-oidc-status.is-ok { background: var(--good-soft); }',
      '.ik-oidc .ik-oidc-status.is-bad { background: var(--bad-soft); }',
      '.ik-oidc svg .ik-oidc-row { transition: opacity 0.3s ease; }',
      '@media (prefers-reduced-motion: reduce) { .ik-oidc .ik-steps li, .ik-oidc svg .ik-oidc-row { transition: none; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svgEl(tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(id, text, cls) {
    var b = el('button', 'ik-btn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button'; b.id = id;
    return b;
  }
  function kv(dl, key, id) {
    dl.appendChild(el('dt', null, key));
    var dd = el('dd', 'ik-mono is-pending', 'not yet'); dd.id = id;
    dl.appendChild(dd);
    return dd;
  }
  function short(s) { return s.slice(0, 10) + '…'; }

  /* The nine steps of section 10, one line each. */
  var STEPS = [
    'The app prepares: a random code_verifier kept to itself, its SHA-256 digest base64url-encoded as code_challenge, a random state and a random nonce.',
    'The browser is sent to the provider: a redirect to /authorize with response_type=code, client_id, redirect_uri, scope=openid, state, nonce, code_challenge and code_challenge_method=S256.',
    'The provider checks the request: the client id is registered, the redirect URI matches a registered one exactly, and the challenge method is S256.',
    'The user authenticates with a passkey: the hosted passkey page asks the browser for an assertion bound to the provider\'s domain, and the provider verifies the signature, counter and origin.',
    'If the passkey is unknown, the provider shows a recovery page offering another passkey or, as a separate choice, a new account; an unrecognised credential never creates one by itself.',
    'The provider issues a code: a single-use code that lives ten minutes, recording the account, the client, the nonce and the code challenge, and redirects the browser back with code and state.',
    'The app redeems the code: after confirming state matches, it POSTs to /token with grant_type=authorization_code, the code, the same redirect URI, its client_id and the original code_verifier.',
    'The provider checks the proof: it hashes the verifier against the stored challenge and confirms the code was issued to this client; the code is consumed and the three tokens are minted.',
    'The app verifies the ID token and creates its own session: from here on the app\'s cookie, not the provider\'s, keeps the user signed in.'
  ];

  /* Diagram rows: each step is one or more arrows between lifelines (B browser, A app, P provider, X attacker),
     or a self-note on one lifeline. */
  function rows(attacker) {
    var r = [
      { step: 1, note: 'A', label: '1 prepare: code_verifier, state, nonce' },
      { step: 2, from: 'A', to: 'B', label: '2 redirect to /authorize?…' },
      { step: 2, from: 'B', to: 'P', label: 'GET /authorize?code_challenge=…&state=…' },
      { step: 3, note: 'P', label: '3 check client_id, redirect_uri, S256' },
      { step: 4, from: 'B', to: 'P', label: '4 passkey assertion' },
      { step: 5, note: 'P', label: '5 unknown passkey? recovery page, no auto-create' },
      { step: 6, from: 'P', to: 'B', label: '6 302 back with code+state' },
      { step: 6, from: 'B', to: 'A', label: 'GET redirect_uri?code=…&state=…' },
      { step: 7, from: 'A', to: 'P', label: '7 POST /token with code, code_verifier' }
    ];
    if (attacker) r.push({ step: 7, from: 'X', to: 'P', label: 'POST /token with code, no verifier', bad: true });
    r.push({ step: 8, note: 'P', label: '8 checks' });
    if (attacker) r.push({ step: 8, from: 'P', to: 'X', label: 'refused: code_verifier does not match', bad: true });
    r.push({ step: 9, from: 'P', to: 'A', label: '9 tokens' });
    r.push({ step: 9, from: 'A', to: 'B', label: 'session cookie' });
    return r;
  }

  IK.widgets['oidcflow'] = function (root, opts) {
    ensureStyle();
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var stepMs = reduced ? 0 : STEP_MS;

    var w = el('div', 'ik-widget ik-oidc');
    var stack = el('div', 'ik-stack');
    w.appendChild(stack);

    /* ---------- Controls ---------- */
    var controls = el('div', 'ik-row');
    var playBtn = btn('oidcflow-play', 'Play');
    var stepBtn = btn('oidcflow-step', 'Step', 'is-secondary');
    var resetBtn = btn('oidcflow-reset', 'Reset', 'is-secondary');
    var toggleLabel = el('label', 'ik-oidc-toggle');
    var toggle = el('input'); toggle.type = 'checkbox'; toggle.id = 'oidcflow-attacker';
    toggleLabel.appendChild(toggle);
    toggleLabel.appendChild(el('span', null, 'Attacker captures the code'));
    toggleLabel.htmlFor = toggle.id;
    controls.appendChild(playBtn); controls.appendChild(stepBtn); controls.appendChild(resetBtn); controls.appendChild(toggleLabel);
    stack.appendChild(controls);

    /* ---------- Diagram ---------- */
    var diagram = el('div', 'ik-oidc-diagram'); diagram.id = 'oidcflow-diagram';
    stack.appendChild(diagram);

    var status = el('p', 'ik-oidc-status'); status.id = 'oidcflow-status';
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    stack.appendChild(status);

    /* ---------- Steps and values ---------- */
    var cols = el('div', 'ik-oidc-cols');
    var stepsPanel = el('section', 'ik-panel');
    stepsPanel.setAttribute('aria-labelledby', 'oidcflow-steps-title');
    stepsPanel.appendChild(el('h3', null, 'The nine steps')).id = 'oidcflow-steps-title';
    var steps = el('ol', 'ik-steps'); steps.id = 'oidcflow-steps';
    var stepEls = STEPS.map(function (text, i) {
      var li = el('li'); li.id = 'oidcflow-step-' + (i + 1);
      li.appendChild(el('div', null, text));
      steps.appendChild(li);
      return li;
    });
    stepsPanel.appendChild(steps);

    var valPanel = el('section', 'ik-panel');
    valPanel.setAttribute('aria-labelledby', 'oidcflow-values-title');
    valPanel.appendChild(el('h3', null, 'Values')).id = 'oidcflow-values-title';
    var dl = el('dl', 'ik-oidc-kv');
    var vVerifier = kv(dl, 'code_verifier', 'oidcflow-verifier');
    var vChallenge = kv(dl, 'code_challenge', 'oidcflow-challenge');
    var vState = kv(dl, 'state', 'oidcflow-state');
    var vNonce = kv(dl, 'nonce', 'oidcflow-nonce');
    var vCode = kv(dl, 'code', 'oidcflow-code');
    valPanel.appendChild(dl);
    valPanel.appendChild(el('span', 'ik-label', 'Checks at step 8')).style.marginTop = '0.6rem';
    var checks = el('ul', 'ik-oidc-checks'); checks.id = 'oidcflow-checks';
    var CHECKS = [
      { key: 'hash', text: 'hash(verifier) == stored challenge' },
      { key: 'client', text: 'code issued to this client' },
      { key: 'redirect', text: 'redirect_uri matches' },
      { key: 'fresh', text: 'code unused and not expired' }
    ];
    var checkEls = {};
    function addCheck(key, text, attackerRow) {
      var li = el('li' , attackerRow ? 'is-attacker' : ''); li.id = 'oidcflow-check-' + key;
      var chip = el('span', 'ik-chip', 'pending');
      li.appendChild(chip); li.appendChild(el('span', null, text));
      checks.appendChild(li);
      checkEls[key] = { li: li, chip: chip };
    }
    CHECKS.forEach(function (c) { addCheck(c.key, c.text, false); });
    addCheck('attacker', 'Attacker\'s attempt: hash(verifier) == stored challenge', true);
    valPanel.appendChild(checks);
    var attackerNote = el('p', 'ik-help'); attackerNote.id = 'oidcflow-attacker-note';
    attackerNote.textContent = 'The attacker holds the code but not the code_verifier, so the hash check fails and nothing is minted. The code is single-use: if the attacker had somehow redeemed it first, the app\'s own redemption would fail at "code unused", the provider would treat the second presentation as a sign of capture and revoke what the first one minted (section 10).';
    attackerNote.hidden = true;
    valPanel.appendChild(attackerNote);

    cols.appendChild(stepsPanel); cols.appendChild(valPanel);
    stack.appendChild(cols);
    root.appendChild(w);

    /* ---------- State ---------- */
    var vals = null;      // { verifier, challenge, state, nonce, code }
    var cur = 0;          // 0 = nothing yet, 1..9 = that step is active
    var attacker = false;
    var runToken = 0;
    var rowEls = [];      // [{ g, row }] in diagram order

    function freshValues() {
      var verifier = IKCrypto.b64url(IKCrypto.randomBytes(32)); // 43 chars
      vals = {
        verifier: verifier,
        challenge: IKCrypto.b64url(IKCrypto.sha256(IKCrypto.utf8ToBytes(verifier))),
        state: IKCrypto.b64url(IKCrypto.randomBytes(12)),
        nonce: IKCrypto.b64url(IKCrypto.randomBytes(12)),
        code: IKCrypto.b64url(IKCrypto.randomBytes(16))
      };
    }

    /* Build the SVG once per attacker setting; rows are later restyled by render(). */
    function buildSvg() {
      var lanes = attacker
        ? { B: 85, A: 285, P: 485, X: 650 }
        : { B: 110, A: 360, P: 610 };
      var names = { B: 'Browser', A: 'App (relying party)', P: 'Provider (IdentiKey)', X: 'Attacker' };
      var gap = attacker ? 200 : 250;
      var rs = rows(attacker);
      var H = TOP + rs.length * ROW + 16;
      var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-labelledby': 'oidcflow-svg-title' });
      svg.appendChild(svgEl('title', { id: 'oidcflow-svg-title' }, 'Sequence diagram of the authorization-code flow with PKCE between the browser, the app and the provider' + (attacker ? ', with an attacker presenting the captured code' : '')));
      var defs = svgEl('defs');
      [['ink', 'var(--ink-2)'], ['accent', 'var(--accent)'], ['bad', 'var(--bad)']].forEach(function (m) {
        var mk = svgEl('marker', { id: 'oidcflow-arrow-' + m[0], viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
        mk.appendChild(svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: m[1] }));
        defs.appendChild(mk);
      });
      svg.appendChild(defs);

      Object.keys(lanes).forEach(function (k) {
        var x = lanes[k], bad = k === 'X', bw = k === 'X' ? 100 : (attacker ? 150 : 170);
        svg.appendChild(svgEl('line', { x1: x, y1: 46, x2: x, y2: H - 8, stroke: bad ? 'var(--bad)' : 'var(--rule)', 'stroke-width': '1.5', 'stroke-dasharray': bad ? '4 4' : 'none', fill: 'none' }));
        svg.appendChild(svgEl('rect', { x: x - bw / 2, y: 12, width: bw, height: 32, rx: 4, fill: bad ? 'var(--bad-soft)' : 'var(--paper-2)', stroke: bad ? 'var(--bad)' : 'var(--rule)', 'stroke-width': '1.5' }));
        svg.appendChild(svgEl('text', { x: x, y: 33, 'text-anchor': 'middle', 'font-size': '13', 'font-weight': '600', fill: bad ? 'var(--bad)' : 'var(--ink)', 'font-family': 'var(--font-display)' }, names[k]));
      });

      rowEls = [];
      rs.forEach(function (r, i) {
        var y = TOP + i * ROW + 20;
        var g = svgEl('g', { 'class': 'ik-oidc-row', 'data-step': r.step });
        if (r.note) {
          var x = lanes[r.note], nw = Math.max(gap - 16, Math.round(r.label.length * 6.4) + 20);
          g.appendChild(svgEl('rect', { x: x - nw / 2, y: y - 14, width: nw, height: 26, rx: 4, fill: 'var(--paper-2)', stroke: 'var(--ink-3)', 'stroke-width': '1.5', 'class': 'ik-oidc-shape' }));
          g.appendChild(svgEl('text', { x: x, y: y + 4, 'text-anchor': 'middle', 'font-size': '12', fill: 'var(--ink)', 'font-family': 'var(--font-display)' }, r.label));
        } else {
          var x1 = lanes[r.from], x2 = lanes[r.to], mid = (x1 + x2) / 2;
          g.appendChild(svgEl('line', { x1: x1, y1: y, x2: x2, y2: y, 'stroke-width': '1.5', fill: 'none', 'class': 'ik-oidc-shape', 'marker-end': 'url(#oidcflow-arrow-ink)' }));
          g.appendChild(svgEl('text', { x: mid, y: y - 6, 'text-anchor': 'middle', 'font-size': '12', fill: r.bad ? 'var(--bad)' : 'var(--ink)', stroke: 'var(--paper)', 'stroke-width': '3', 'paint-order': 'stroke', 'font-family': 'var(--font-display)' }, r.label));
        }
        svg.appendChild(g);
        rowEls.push({ g: g, row: r });
      });
      diagram.textContent = '';
      diagram.appendChild(svg);
    }

    function showValue(dd, text, visible) {
      if (visible) { dd.textContent = text; dd.className = 'ik-mono'; }
      else { dd.textContent = 'not yet'; dd.className = 'ik-mono is-pending'; }
    }
    function setCheck(key, state) {
      var ce = checkEls[key];
      ce.chip.className = 'ik-chip' + (state === 'passed' ? ' is-good' : state === 'FAILED' ? ' is-bad' : '');
      ce.chip.textContent = state;
      ce.li.classList.toggle('is-failed', state === 'FAILED');
    }

    /* Idempotent: paint the diagram, the step list, the values and the status for the current step. */
    function render() {
      rowEls.forEach(function (re) {
        var s = re.row.step, bad = re.row.bad;
        var state = s < cur ? 'done' : s === cur ? 'active' : 'pending';
        var shape = re.g.querySelector('.ik-oidc-shape');
        var color = bad ? 'var(--bad)' : state === 'active' ? 'var(--accent)' : state === 'done' ? 'var(--ink-2)' : 'var(--ink-3)';
        shape.setAttribute('stroke', color);
        shape.setAttribute('stroke-width', state === 'active' ? '3' : '1.5');
        if (shape.tagName === 'line') shape.setAttribute('marker-end', 'url(#oidcflow-arrow-' + (bad ? 'bad' : state === 'active' ? 'accent' : 'ink') + ')');
        if (shape.tagName === 'rect') shape.setAttribute('fill', state === 'active' ? 'var(--accent-soft)' : 'var(--paper-2)');
        re.g.style.opacity = state === 'pending' ? '0.4' : '1';
        re.g.setAttribute('data-state', state);
      });
      stepEls.forEach(function (li, i) {
        var s = i + 1;
        li.className = s < cur ? 'is-done' : s === cur ? 'is-active' : '';
        if (s === cur) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      });
      showValue(vVerifier, vals.verifier, cur >= 1);
      showValue(vChallenge, vals.challenge, cur >= 1);
      showValue(vState, vals.state, cur >= 1);
      showValue(vNonce, vals.nonce, cur >= 1);
      showValue(vCode, vals.code, cur >= 6);
      CHECKS.forEach(function (c) { setCheck(c.key, cur >= 8 ? 'passed' : 'pending'); });
      checkEls.attacker.li.hidden = !attacker;
      setCheck('attacker', cur >= 8 && attacker ? 'FAILED' : 'pending');
      attackerNote.hidden = !(attacker && cur >= 8);

      status.className = 'ik-oidc-status';
      if (cur === 0) status.textContent = 'Not started. Play runs all nine steps; Step advances one at a time.';
      else if (cur < 8) status.textContent = 'Step ' + cur + ' of 9. ' + (cur >= 6 ? 'The code ' + short(vals.code) + ' is in flight; the code_verifier has never left the app.' : cur >= 2 ? 'Only the hash ' + short(vals.challenge) + ' has been sent; the verifier stays with the app.' : 'The app keeps code_verifier ' + short(vals.verifier) + ' and has sent nothing yet.');
      else if (cur === 8) { status.className += attacker ? ' is-bad' : ' is-ok'; status.textContent = attacker ? 'Step 8 of 9. The app\'s proof passes all four checks; the attacker\'s attempt is refused: code_verifier does not match.' : 'Step 8 of 9. All four checks pass: SHA-256 of the verifier equals the stored challenge, so this is the party that started the flow.'; }
      else { status.className += ' is-ok'; status.textContent = 'Done. The app verified the ID token (nonce ' + short(vals.nonce) + ' matches) and set its own session cookie.' + (attacker ? ' The attacker got nothing: a code without its verifier is worthless.' : ''); }
      playBtn.disabled = false;
      stepBtn.disabled = cur >= 9;
    }

    function goTo(n) { cur = n; render(); }

    function play() {
      var token = ++runToken;
      freshValues(); cur = 0;
      playBtn.disabled = true; stepBtn.disabled = true;
      function next() {
        if (token !== runToken) return;
        goTo(cur + 1);
        if (cur >= 9) { playBtn.disabled = false; return; }
        playBtn.disabled = true; stepBtn.disabled = true;
        if (stepMs === 0) next(); else setTimeout(next, stepMs);
      }
      next();
    }

    function reset() {
      runToken++;
      freshValues();
      goTo(1);
    }

    /* ---------- Wiring ---------- */
    playBtn.addEventListener('click', play);
    stepBtn.addEventListener('click', function () { runToken++; if (cur < 9) goTo(cur + 1); });
    resetBtn.addEventListener('click', function () { reset(); playBtn.focus(); });
    toggle.addEventListener('change', function () {
      runToken++;
      attacker = toggle.checked;
      buildSvg();
      render();
    });

    freshValues();
    buildSvg();
    goTo(1);
  };
})();
