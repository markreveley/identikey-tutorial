/* challenge — a challenge-response sign-in between a verifier (the site) and you (holding the private key).
   One idea: a signed challenge proves possession of the key, and the nonce, audience and expiry keep the
   response fresh, so a captured response cannot be replayed, moved to another site, or used late. */
(function () {
  window.IK = window.IK || {}; IK.widgets = IK.widgets || {};

  var SITE = 'app.example';
  var OTHER_SITE = 'shop.example';
  var TTL_S = 60;
  var LATE_S = 75;
  var STEP_MS = 650;
  var STYLE_ID = 'ik-challenge-style';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.ik-ch .ik-ch-cols { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }',
      '.ik-ch .ik-panel > h3 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.6rem; }',
      '.ik-ch .ik-ch-kv { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.2rem 0.6rem; font-size: 0.8125rem; margin: 0 0 0.6rem; }',
      '.ik-ch .ik-ch-kv dt { color: var(--ink-3); margin: 0; }',
      '.ik-ch .ik-ch-kv dd { margin: 0; color: var(--ink); }',
      '.ik-ch .ik-ch-kv dd.ik-changed { padding: 0 0.25rem; }',
      '.ik-ch .ik-ch-code { background: var(--code-bg); border-radius: 4px; padding: 0.45rem 0.55rem; margin: 0 0 0.5rem; white-space: pre-wrap; color: var(--ink); }',
      '.ik-ch .ik-ch-code.is-empty { color: var(--ink-3); font-family: var(--font-display); white-space: normal; }',
      '.ik-ch .ik-btn.is-tiny { padding: 0.15rem 0.5rem; font-size: 0.75rem; font-weight: 500; }',
      '.ik-ch .ik-steps li { transition: background-color 0.3s ease; }',
      '.ik-ch .ik-steps li .ik-ch-note { display: block; font-size: 0.78rem; color: var(--ink-2); margin-top: 0.15rem; }',
      '.ik-ch .ik-ch-checks { list-style: none; padding: 0; margin: 0.35rem 0 0; display: grid; gap: 0.25rem; }',
      '.ik-ch .ik-ch-checks li { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: baseline; padding: 0.15rem 0.3rem; border-radius: 4px; font-size: 0.8125rem; background: transparent; }',
      '.ik-ch .ik-ch-checks li::before { content: none; counter-increment: none; }',
      '.ik-ch .ik-ch-checks li.is-failed { background: var(--bad-soft); }',
      '.ik-ch .ik-ch-checks li .ik-chip { min-width: 4.5rem; text-align: center; }',
      '.ik-ch .ik-ch-checks li .ik-ch-why { flex-basis: 100%; }',
      '.ik-ch .ik-ch-result { margin: 0; padding: 0.5rem 0.6rem; border-radius: 4px; background: var(--paper-2); font-size: 0.9rem; }',
      '.ik-ch .ik-ch-result.is-accepted { background: var(--good-soft); }',
      '.ik-ch .ik-ch-result.is-refused { background: var(--bad-soft); }',
      '.ik-ch .ik-ch-log { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.2rem; font-size: 0.8125rem; max-height: 11rem; overflow-y: auto; }',
      '.ik-ch .ik-ch-log li { display: grid; grid-template-columns: 7.5rem minmax(0, 1fr); gap: 0.5rem; padding: 0.2rem 0.3rem; border-radius: 3px; }',
      '.ik-ch .ik-ch-log li.is-refused { background: var(--bad-soft); }',
      '.ik-ch .ik-ch-log li.is-accepted { background: var(--good-soft); }',
      '.ik-ch .ik-ch-log li b { font-weight: 600; color: var(--ink-2); word-break: break-word; }',
      '@media (max-width: 420px) { .ik-ch .ik-ch-log li { grid-template-columns: minmax(0, 1fr); gap: 0; } }',
      '@media (prefers-reduced-motion: reduce) { .ik-ch .ik-steps li { transition: none; } }'
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
  function kv(dl, key, id) {
    dl.appendChild(el('dt', null, key));
    var dd = el('dd', 'ik-mono'); dd.id = id;
    dl.appendChild(dd);
    return dd;
  }
  function hex(b) { return IKCrypto.bytesToHex(b); }
  function clockText(ms) { return new Date(ms).toISOString().slice(11, 19) + ' UTC'; }
  function short(h) { return h.slice(0, 8) + '…'; }

  IK.widgets['challenge'] = function (root, opts) {
    ensureStyle();
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var stepMs = reduced ? 0 : STEP_MS;

    var w = el('div', 'ik-widget ik-ch');
    var stack = el('div', 'ik-stack');
    w.appendChild(stack);

    /* ---------- Controls ---------- */
    var controls = el('div', 'ik-row');
    var runBtn = btn('challenge-run', 'Run sign-in');
    var replayBtn = btn('challenge-replay', 'Replay the captured response', 'is-secondary');
    var otherBtn = btn('challenge-other-site', 'Present it at another site', 'is-secondary');
    var lateBtn = btn('challenge-late', 'Present it after expiry', 'is-secondary');
    var newBtn = btn('challenge-new', 'New challenge', 'is-secondary');
    controls.appendChild(runBtn); controls.appendChild(replayBtn); controls.appendChild(otherBtn);
    controls.appendChild(lateBtn); controls.appendChild(newBtn);
    stack.appendChild(controls);
    var hint = el('p', 'ik-help', 'Run the sign-in once to capture a response; the three attack buttons then present that same response again.');
    hint.id = 'challenge-hint'; hint.style.margin = '0';
    stack.appendChild(hint);

    /* ---------- Panels ---------- */
    var cols = el('div', 'ik-ch-cols');

    var vPanel = el('section', 'ik-panel');
    vPanel.setAttribute('aria-labelledby', 'challenge-verifier-title');
    vPanel.appendChild(el('h3', null, 'Verifier (the site)')).id = 'challenge-verifier-title';
    var vdl = el('dl', 'ik-ch-kv');
    var vSite = kv(vdl, 'This site', 'challenge-site');
    var vClock = kv(vdl, 'Clock', 'challenge-clock');
    var vNonce = kv(vdl, 'Nonce issued', 'challenge-nonce-state');
    vPanel.appendChild(vdl);
    vPanel.appendChild(el('span', 'ik-label', 'Challenge sent to you (JSON, signed as these bytes)'));
    var chCode = el('pre', 'ik-mono ik-ch-code'); chCode.id = 'challenge-json';
    vPanel.appendChild(chCode);

    var yPanel = el('section', 'ik-panel');
    yPanel.setAttribute('aria-labelledby', 'challenge-you-title');
    yPanel.appendChild(el('h3', null, 'You (holding the private key)')).id = 'challenge-you-title';
    var ydl = el('dl', 'ik-ch-kv');
    var yPub = kv(ydl, 'Public key', 'challenge-pub');
    var yPriv = kv(ydl, 'Private key', 'challenge-priv');
    yPriv.textContent = 'stays here; never sent';
    yPriv.className = '';
    yPanel.appendChild(ydl);
    var respHead = el('div', 'ik-row');
    respHead.appendChild(el('span', 'ik-label', 'Response sent back (your signature over the challenge bytes)'));
    var expandBtn = btn('challenge-sig-toggle', 'Show full signature', 'is-secondary is-tiny');
    expandBtn.setAttribute('aria-expanded', 'false');
    expandBtn.setAttribute('aria-controls', 'challenge-response');
    expandBtn.hidden = true;
    respHead.appendChild(expandBtn);
    yPanel.appendChild(respHead);
    var respCode = el('pre', 'ik-mono ik-ch-code'); respCode.id = 'challenge-response';
    yPanel.appendChild(respCode);

    cols.appendChild(vPanel); cols.appendChild(yPanel);
    stack.appendChild(cols);

    /* ---------- Steps ---------- */
    var steps = el('ol', 'ik-steps'); steps.id = 'challenge-steps';
    function step(id, text) {
      var li = el('li'); li.id = id;
      var body = el('div');
      body.appendChild(el('span', null, text));
      var note = el('span', 'ik-ch-note'); note.id = id + '-note';
      body.appendChild(note);
      li.appendChild(body);
      steps.appendChild(li);
      return { li: li, body: body, note: note };
    }
    var s1 = step('challenge-step-1', 'The verifier issues a challenge: a nonce (16 random bytes), the audience ' + SITE + ', and an expiry ' + TTL_S + ' s away.');
    var s2 = step('challenge-step-2', 'You sign the challenge bytes with your Ed25519 private key. The signature is the response.');
    var s3 = step('challenge-step-3', 'The verifier checks the response, then marks the nonce used.');
    var checks = el('ul', 'ik-ch-checks'); checks.id = 'challenge-checks';
    var CHECKS = [
      { key: 'sig', text: 'Signature verifies against your public key' },
      { key: 'aud', text: 'Audience is this site' },
      { key: 'exp', text: 'Expiry has not passed' },
      { key: 'nonce', text: 'Nonce was issued here and is unused' }
    ];
    var checkEls = {};
    CHECKS.forEach(function (c) {
      var li = el('li'); li.id = 'challenge-check-' + c.key;
      var chip = el('span', 'ik-chip', 'pending');
      var txt = el('span', null, c.text);
      var why = el('span', 'ik-ch-why ik-fail'); why.hidden = true;
      li.appendChild(chip); li.appendChild(txt); li.appendChild(why);
      checks.appendChild(li);
      checkEls[c.key] = { li: li, chip: chip, why: why };
    });
    s3.body.appendChild(checks);
    stack.appendChild(steps);

    var result = el('p', 'ik-ch-result'); result.id = 'challenge-result';
    result.setAttribute('role', 'status'); result.setAttribute('aria-live', 'polite');
    stack.appendChild(result);

    /* ---------- Message log ---------- */
    var logWrap = el('div', 'ik-panel');
    logWrap.appendChild(el('span', 'ik-label', 'Message log'));
    var log = el('ul', 'ik-ch-log'); log.id = 'challenge-log';
    log.setAttribute('aria-live', 'polite');
    logWrap.appendChild(log);
    stack.appendChild(logWrap);

    root.appendChild(w);

    /* ---------- State ---------- */
    var priv = IKCrypto.ed.utils.randomPrivateKey();
    var pub = IKCrypto.ed.getPublicKey(priv);
    yPub.textContent = hex(pub);

    var challenge = null;     // { nonce, audience, expires_at }  issued by the verifier
    var issuedAt = 0;         // ms, the verifier's clock when the challenge was issued
    var clockOffset = 0;      // s, how far the simulated clock has advanced since issue
    var issued = {};          // nonce hex -> 'issued' | 'used'
    var captured = null;      // { challenge, pubHex, sigHex } the response as sent across the network
    var sigShown = false;
    var runToken = 0;

    function challengeBytes(c) { return IKCrypto.utf8ToBytes(JSON.stringify(c)); }
    function nowMs() { return issuedAt + clockOffset * 1000; }

    function renderVerifier(site) {
      vSite.textContent = site;
      vSite.classList.toggle('ik-changed', site !== SITE);
      vClock.textContent = clockText(nowMs()) + ' (+' + clockOffset + ' s since issue)';
      vClock.classList.toggle('ik-changed', clockOffset !== 0);
      var st = issued[challenge.nonce];
      vNonce.textContent = short(challenge.nonce) + ' — ' + (st === 'used' ? 'used' : 'unused');
      chCode.textContent = JSON.stringify(challenge, null, 2);
    }

    function renderResponse() {
      if (!captured) {
        respCode.textContent = 'Nothing yet. Run the sign-in to sign the challenge.';
        respCode.classList.add('is-empty');
        expandBtn.hidden = true;
        return;
      }
      var sig = sigShown ? captured.sigHex : captured.sigHex.slice(0, 32) + '… (' + captured.sigHex.length + ' hex digits)';
      respCode.textContent = '{\n  "challenge": ' + JSON.stringify(captured.challenge) + ',\n  "public_key": "' + captured.pubHex + '",\n  "signature": "' + sig + '"\n}';
      respCode.classList.remove('is-empty');
      expandBtn.hidden = false;
      expandBtn.textContent = sigShown ? 'Show less' : 'Show full signature';
      expandBtn.setAttribute('aria-expanded', sigShown ? 'true' : 'false');
    }

    function addLog(from, text, cls) {
      var li = el('li', cls || '');
      li.appendChild(el('b', null, from));
      li.appendChild(el('span', null, text));
      log.appendChild(li);
      while (log.children.length > 12) log.removeChild(log.firstChild);
      log.scrollTop = log.scrollHeight;
    }

    function resetSteps() {
      [s1, s2, s3].forEach(function (s) { s.li.className = ''; s.note.textContent = ''; });
      CHECKS.forEach(function (c) {
        var ce = checkEls[c.key];
        ce.li.className = ''; ce.chip.className = 'ik-chip'; ce.chip.textContent = 'pending';
        ce.why.hidden = true; ce.why.textContent = '';
      });
      result.className = 'ik-ch-result'; result.textContent = 'Not run yet.';
    }

    function setButtons(busy) {
      runBtn.disabled = busy;
      newBtn.disabled = busy;
      replayBtn.disabled = busy || !captured;
      otherBtn.disabled = busy || !captured;
      lateBtn.disabled = busy || !captured;
    }

    function issueChallenge() {
      runToken++;
      challenge = {
        nonce: hex(IKCrypto.randomBytes(16)),
        audience: SITE,
        expires_at: ''
      };
      issuedAt = Math.floor(Date.now() / 1000) * 1000;
      challenge.expires_at = new Date(issuedAt + TTL_S * 1000).toISOString();
      clockOffset = 0;
      issued[challenge.nonce] = 'issued';
      captured = null; sigShown = false;
      renderVerifier(SITE); renderResponse(); resetSteps(); setButtons(false);
      addLog(SITE + ' → you', 'challenge {nonce ' + short(challenge.nonce) + ', audience ' + SITE + ', expires in ' + TTL_S + ' s}');
    }

    // The verifier's checks, in order; returns { ok, failedKey, reason }.
    function verify(resp, site) {
      var c = resp.challenge;
      var sigOk = false;
      try { sigOk = IKCrypto.ed.verify(IKCrypto.hexToBytes(resp.sigHex), challengeBytes(c), IKCrypto.hexToBytes(resp.pubHex)); } catch (e) { sigOk = false; }
      if (!sigOk) return { ok: false, failedKey: 'sig', reason: 'the signature does not verify under this public key' };
      if (c.audience !== site) return { ok: false, failedKey: 'aud', reason: 'audience mismatch: the challenge names ' + c.audience + ', but this site is ' + site };
      if (nowMs() > Date.parse(c.expires_at)) return { ok: false, failedKey: 'exp', reason: 'expired: the clock reads ' + clockText(nowMs()) + ', past the expiry at ' + clockText(Date.parse(c.expires_at)) };
      if (issued[c.nonce] !== 'issued') return { ok: false, failedKey: 'nonce', reason: issued[c.nonce] === 'used' ? 'nonce already used: this response was accepted once; a second copy is a replay attack' : 'nonce unknown: this site never issued it' };
      issued[c.nonce] = 'used';
      return { ok: true };
    }

    // Walk the steps with a pause between them; instant under reduced motion.
    function animate(parts, done) {
      var token = ++runToken, i = 0;
      function next() {
        if (token !== runToken) return;
        if (i >= parts.length) { if (done) done(); return; }
        var p = parts[i++];
        p();
        if (stepMs === 0) next(); else setTimeout(next, stepMs);
      }
      next();
    }

    function showCheck(key, state, why) {
      var ce = checkEls[key];
      ce.chip.className = 'ik-chip' + (state === 'ok' ? ' is-good' : state === 'fail' ? ' is-bad' : '');
      ce.chip.textContent = state === 'ok' ? 'passed' : state === 'fail' ? 'FAILED' : state;
      ce.li.classList.toggle('is-failed', state === 'fail');
      ce.why.hidden = !why; ce.why.textContent = why || '';
    }

    // Run a presentation of `resp` to `site`: steps 1 and 2 are either live (fresh sign-in) or reused (attack).
    function present(mode) {
      resetSteps(); setButtons(true);
      var site = mode === 'other' ? OTHER_SITE : SITE;
      if (mode === 'late') clockOffset = LATE_S; else clockOffset = 0;
      renderVerifier(site);
      var resp;
      var parts = [];

      parts.push(function () {
        s1.li.className = 'is-active';
        if (mode === 'fresh') s1.note.textContent = 'Issued at ' + clockText(issuedAt) + '; expires at ' + clockText(issuedAt + TTL_S * 1000) + '.';
        else s1.note.textContent = 'No new challenge: the attacker reuses the one captured earlier.';
      });
      parts.push(function () {
        s1.li.className = 'is-done'; s2.li.className = 'is-active';
        if (mode === 'fresh') {
          var sig = IKCrypto.ed.sign(challengeBytes(challenge), priv);
          captured = { challenge: JSON.parse(JSON.stringify(challenge)), pubHex: hex(pub), sigHex: hex(sig) };
          s2.note.textContent = 'Signed ' + challengeBytes(challenge).length + ' bytes; signature ' + short(captured.sigHex);
          addLog('you → ' + SITE, 'response {signature ' + short(captured.sigHex) + ', public key ' + short(captured.pubHex) + '}');
        } else {
          s2.note.textContent = 'Nothing new is signed: the attacker sends the captured response as it is.';
          addLog('attacker → ' + site, 'the captured response again {signature ' + short(captured.sigHex) + '}' + (mode === 'late' ? ', ' + LATE_S + ' s after issue' : ''));
        }
        resp = captured;
        renderResponse();
      });
      parts.push(function () { s2.li.className = 'is-done'; s3.li.className = 'is-active'; });

      var outcome = null;
      var order = ['sig', 'aud', 'exp', 'nonce'];
      order.forEach(function (key, idx) {
        parts.push(function () {
          if (outcome === null && idx === 0) outcome = verify(resp, site);
          if (outcome.ok || order.indexOf(outcome.failedKey) > idx) showCheck(key, 'ok');
          else if (outcome.failedKey === key) showCheck(key, 'fail', 'Refused here: ' + outcome.reason + '.');
          else showCheck(key, 'skipped');
        });
      });

      animate(parts, function () {
        if (outcome.ok) {
          s3.li.className = 'is-done';
          s3.note.textContent = 'Nonce ' + short(challenge.nonce) + ' is now marked used.';
          result.className = 'ik-ch-result is-accepted';
          result.textContent = 'Accepted';
          result.appendChild(el('span', 'ik-help', ' — you proved possession of the private key, and the response was fresh: right nonce, right site, in time.'));
          addLog(site, 'accepted; nonce ' + short(challenge.nonce) + ' marked used', 'is-accepted');
        } else {
          s3.li.className = '';
          result.className = 'ik-ch-result is-refused';
          result.textContent = 'Refused: ' + outcome.reason + '.';
          addLog(site, 'refused: ' + outcome.reason, 'is-refused');
        }
        renderVerifier(site);
        setButtons(false);
      });
    }

    /* ---------- Wiring ---------- */
    runBtn.addEventListener('click', function () {
      // A second genuine sign-in needs a fresh challenge; the old nonce is spent.
      if (captured) issueChallenge();
      present('fresh');
    });
    replayBtn.addEventListener('click', function () { present('replay'); });
    otherBtn.addEventListener('click', function () { present('other'); });
    lateBtn.addEventListener('click', function () { present('late'); });
    newBtn.addEventListener('click', function () { issueChallenge(); runBtn.focus(); });
    expandBtn.addEventListener('click', function () { sigShown = !sigShown; renderResponse(); });

    issueChallenge();
  };
})();
