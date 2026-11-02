/* jwt — an ID token (a JWT) taken apart: header, claims, signature.
   One idea: the claims are readable by anyone; the provider's signature over the exact bytes of header and
   claims is what stops anyone changing them, and the app's own checks (aud, exp, nonce) are separate from it. */
(function () {
  window.IK = window.IK || {}; IK.widgets = IK.widgets || {};

  var STYLE_ID = 'ik-jwt-style';
  var ISS = 'https://auth.identikey.me';
  var AUD = 'taskmaster-web';
  var OTHER_AUD = 'calendar-web';
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.ik-jwt .ik-jwt-mirror { background: var(--code-bg); border: 1px solid var(--rule); border-radius: 4px; padding: 0.45rem 0.55rem; }',
      '.ik-jwt .ik-jwt-h { color: var(--accent); }',
      '.ik-jwt .ik-jwt-p { color: var(--ink); }',
      '.ik-jwt .ik-jwt-s { color: var(--ink-3); }',
      '.ik-jwt .ik-jwt-dot { color: var(--warm); font-weight: 700; }',
      '.ik-jwt .ik-jwt-legend { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; font-size: 0.75rem; color: var(--ink-2); margin: 0.3rem 0 0; }',
      '.ik-jwt .ik-jwt-legend i { display: inline-block; width: 0.6rem; height: 0.6rem; border-radius: 2px; margin-right: 0.35rem; vertical-align: -1px; }',
      '.ik-jwt .ik-jwt-cols { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }',
      '.ik-jwt .ik-panel > h3 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.5rem; }',
      '.ik-jwt .ik-jwt-json { margin: 0; white-space: pre-wrap; background: var(--code-bg); border-radius: 4px; padding: 0.4rem 0.5rem; }',
      '.ik-jwt .ik-jwt-claims { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }',
      '.ik-jwt .ik-jwt-claims li { display: grid; gap: 0.1rem; padding: 0.3rem 0.45rem; border-radius: 4px; background: var(--code-bg); }',
      '.ik-jwt .ik-jwt-claims li.is-bad { background: var(--bad-soft); }',
      '.ik-jwt .ik-jwt-claims .ik-jwt-meaning { font-family: var(--font-display); font-size: 0.8125rem; color: var(--ink-2); word-break: normal; }',
      '.ik-jwt .ik-jwt-err { color: var(--bad); font-size: 0.85rem; margin: 0; }',
      '.ik-jwt .ik-jwt-result { margin: 0.5rem 0; padding: 0.5rem 0.6rem; border-radius: 4px; background: var(--paper-2); font-size: 0.85rem; }',
      '.ik-jwt .ik-jwt-result.is-valid { background: var(--good-soft); }',
      '.ik-jwt .ik-jwt-result.is-invalid { background: var(--bad-soft); }',
      '.ik-jwt .ik-jwt-result p { margin: 0.2rem 0 0; color: var(--ink-2); }',
      '.ik-jwt .ik-jwt-aud { font-size: 0.85rem; margin: 0.4rem 0 0; }',
      '.ik-jwt .ik-jwt-check { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; margin: 0.5rem 0 0; }',
      '.ik-jwt .ik-jwt-check input { width: auto; margin: 0; }'
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
  function panel(id, title) {
    var p = el('section', 'ik-panel');
    p.id = id;
    var h = el('h3', null, title); h.id = id + '-title';
    p.setAttribute('aria-labelledby', h.id);
    p.appendChild(h);
    return p;
  }
  function encodeJson(obj) { return IKCrypto.b64url(IKCrypto.utf8ToBytes(JSON.stringify(obj))); }
  // Decode one base64url string into a JSON object; returns {ok, value} or {ok:false, error}
  function decodePart(str, what) {
    if (!/^[A-Za-z0-9_-]*$/.test(str) || str.length % 4 === 1 || str.length === 0) {
      return { ok: false, error: 'The ' + what + ' string is not valid base64url (letters, digits, "-" and "_" only, and a length that fits whole bytes).' };
    }
    var text;
    try { text = IKCrypto.bytesToUtf8(IKCrypto.unb64url(str)); }
    catch (e) { return { ok: false, error: 'The ' + what + ' string is not valid base64url.' }; }
    try {
      var v = JSON.parse(text);
      if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'The ' + what + ' decodes, but not to a JSON object.' };
      return { ok: true, value: v, text: text };
    } catch (e) {
      return { ok: false, error: 'The ' + what + ' decodes to bytes that are not JSON: ' + text.slice(0, 40) + (text.length > 40 ? '...' : '') };
    }
  }
  function fmtTime(sec) {
    if (typeof sec !== 'number' || !isFinite(sec)) return 'not a number';
    return new Date(sec * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  }
  function meaningOf(name, value, now) {
    switch (name) {
      case 'iss': return 'Issuer: who issued the token. The app expects exactly ' + ISS + '.';
      case 'sub': return 'Subject: who you are to this app. Derived from your XID, differently for each app.';
      case 'aud': return 'Audience: which app the token was made for. The app accepts it only if this is its own client id.';
      case 'iat': return 'Issued at ' + fmtTime(value) + '.';
      case 'exp':
        if (typeof value !== 'number') return 'Expiry: should be a number of seconds since 1970.';
        return value > now ? 'Expires ' + fmtTime(value) + ', in ' + Math.round((value - now) / 60) + ' minutes. Still valid.'
                           : 'Expired ' + fmtTime(value) + ', ' + Math.round((now - value) / 60) + ' minutes ago. The app rejects it on this check alone.';
      case 'nonce': return 'Ties the token to this sign-in: the app compares it with the nonce it stored when it started the sign-in.';
      default: return 'Not a claim the app expects; IdentiKey issues only standard claims.';
    }
  }

  IK.widgets['jwt'] = function (root, opts) {
    ensureStyle();

    var w = el('div', 'ik-widget ik-jwt');
    var stack = el('div', 'ik-stack');
    w.appendChild(stack);

    /* ---------- Token: colored mirror above an editable textarea ---------- */
    var tokWrap = el('div');
    tokWrap.appendChild(el('span', 'ik-label', 'ID token (compact JWT: header . claims . signature)'));
    var mirror = el('div', 'ik-mono ik-jwt-mirror');
    mirror.id = 'jwt-mirror';
    mirror.setAttribute('aria-hidden', 'true');
    tokWrap.appendChild(mirror);
    var legend = el('div', 'ik-jwt-legend');
    [['ik-jwt-h', 'header', 'var(--accent)'], ['ik-jwt-p', 'claims', 'var(--ink)'], ['ik-jwt-s', 'signature', 'var(--ink-3)']].forEach(function (d) {
      var it = el('span', d[0]); var sw = el('i'); sw.style.background = d[2]; it.appendChild(sw); it.appendChild(document.createTextNode(d[1])); legend.appendChild(it);
    });
    tokWrap.appendChild(legend);
    var taLab = el('label', 'ik-label', 'Edit the token (the panels below re-decode as you type)');
    taLab.htmlFor = 'jwt-token'; taLab.style.marginTop = '0.5rem';
    var ta = el('textarea', 'ik-textarea ik-mono');
    ta.id = 'jwt-token'; ta.rows = 4; ta.spellcheck = false;
    ta.setAttribute('autocapitalize', 'off'); ta.setAttribute('autocorrect', 'off');
    tokWrap.appendChild(taLab); tokWrap.appendChild(ta);
    stack.appendChild(tokWrap);

    var row = el('div', 'ik-row');
    var bFlip = btn('jwt-flip', 'Flip one character of the claims', 'is-secondary');
    var bExp = btn('jwt-expire', 'Set exp to the past', 'is-secondary');
    var bSign = btn('jwt-resign', 'Re-sign with the provider key');
    var bRestore = btn('jwt-restore', 'Restore', 'is-secondary');
    row.appendChild(bFlip); row.appendChild(bExp); row.appendChild(bSign); row.appendChild(bRestore);
    stack.appendChild(row);
    var status = el('p', 'ik-help'); status.id = 'jwt-status'; status.setAttribute('aria-live', 'polite'); status.style.margin = '0';
    stack.appendChild(status);

    /* ---------- Three panels ---------- */
    var cols = el('div', 'ik-jwt-cols');
    var pHead = panel('jwt-header', 'Header');
    var headOut = el('pre', 'ik-mono ik-jwt-json'); headOut.id = 'jwt-header-json';
    var headErr = el('p', 'ik-jwt-err'); headErr.id = 'jwt-header-error'; headErr.hidden = true;
    pHead.appendChild(headOut); pHead.appendChild(headErr);
    pHead.appendChild(el('p', 'ik-help', 'alg names the signature scheme (EdDSA, an Ed25519 signature); kid names which of the provider\'s published keys (its JWKS) signed this token.'));

    var pClaims = panel('jwt-claims', 'Claims');
    var claimsList = el('ul', 'ik-jwt-claims'); claimsList.id = 'jwt-claims-list';
    var claimsErr = el('p', 'ik-jwt-err'); claimsErr.id = 'jwt-claims-error'; claimsErr.hidden = true;
    pClaims.appendChild(claimsList); pClaims.appendChild(claimsErr);

    var pSig = panel('jwt-sig', 'Signature check');
    pSig.appendChild(el('span', 'ik-label', 'Provider public key (from its JWKS, matched by kid)'));
    var pubOut = el('div', 'ik-mono'); pubOut.id = 'jwt-pub';
    pSig.appendChild(pubOut);
    var result = el('div', 'ik-jwt-result'); result.id = 'jwt-result'; result.setAttribute('role', 'status'); result.setAttribute('aria-live', 'polite');
    var resLine = el('span'); resLine.id = 'jwt-result-line';
    var resWhy = el('p'); resWhy.id = 'jwt-result-why';
    result.appendChild(resLine); result.appendChild(resWhy);
    pSig.appendChild(result);
    var audLine = el('p', 'ik-jwt-aud'); audLine.id = 'jwt-aud-line';
    pSig.appendChild(audLine);
    var check = el('label', 'ik-jwt-check');
    check.htmlFor = 'jwt-other-app';
    var cb = el('input'); cb.type = 'checkbox'; cb.id = 'jwt-other-app';
    check.appendChild(cb); check.appendChild(document.createTextNode('Pretend to be a different app (aud check)'));
    pSig.appendChild(check);

    cols.appendChild(pHead); cols.appendChild(pClaims); cols.appendChild(pSig);
    stack.appendChild(cols);
    root.appendChild(w);

    /* ---------- State ---------- */
    var priv, pub, pubHex, kid;
    var original = null;   // { header, claims, h, p, s } as issued by the provider
    var resigned = false;  // the current signature was made by "Re-sign", not at issue time

    function issue() {
      priv = IKCrypto.ed.utils.randomPrivateKey();
      pub = IKCrypto.ed.getPublicKey(priv);
      pubHex = IKCrypto.bytesToHex(pub);
      kid = IKCrypto.bytesToHex(IKCrypto.sha256(pub)).slice(0, 8);
      var now = Math.floor(Date.now() / 1000);
      var header = { alg: 'EdDSA', kid: kid, typ: 'JWT' };
      var claims = {
        iss: ISS,
        sub: IKCrypto.base58(IKCrypto.randomBytes(32)),
        aud: AUD,
        iat: now,
        exp: now + 3600,
        nonce: IKCrypto.bytesToHex(IKCrypto.randomBytes(8))
      };
      var h = encodeJson(header), p = encodeJson(claims);
      original = { header: header, claims: claims, h: h, p: p, s: signOver(h, p) };
      pubOut.textContent = pubHex;
    }
    function signOver(h, p) {
      return IKCrypto.b64url(IKCrypto.ed.sign(IKCrypto.utf8ToBytes(h + '.' + p), priv));
    }
    function parts() { return ta.value.trim().split('.'); }
    function setToken(h, p, s) { ta.value = h + '.' + p + '.' + s; }

    // Mirror: three colored spans; characters that differ from the issued token are marked .ik-changed
    function renderMirror(ps) {
      mirror.textContent = '';
      var classes = ['ik-jwt-h', 'ik-jwt-p', 'ik-jwt-s'];
      var origs = [original.h, original.p, original.s];
      for (var i = 0; i < ps.length; i++) {
        if (i > 0) mirror.appendChild(el('span', 'ik-jwt-dot', '.'));
        var span = el('span', classes[Math.min(i, 2)]);
        var cur = ps[i], ref = origs[i] || '';
        if (i < 2 && cur.length === ref.length && cur !== ref) {
          var run = '';
          for (var k = 0; k < cur.length; k++) {
            if (cur[k] === ref[k]) { run += cur[k]; }
            else {
              if (run) span.appendChild(document.createTextNode(run)); run = '';
              span.appendChild(el('span', 'ik-changed', cur[k]));
            }
          }
          if (run) span.appendChild(document.createTextNode(run));
        } else {
          span.textContent = cur;
        }
        mirror.appendChild(span);
      }
      if (ps.length !== 3) mirror.appendChild(el('span', 'ik-jwt-err', '  (' + ps.length + ' strings; a JWT has exactly 3)'));
    }

    function renderClaims(dec, now) {
      claimsList.textContent = '';
      claimsErr.hidden = dec.ok;
      if (!dec.ok) { claimsErr.textContent = dec.error; return; }
      Object.keys(dec.value).forEach(function (name) {
        var v = dec.value[name];
        var li = el('li');
        var expired = name === 'exp' && (typeof v !== 'number' || v <= now);
        if (expired) li.classList.add('is-bad');
        var line = el('span', 'ik-mono');
        line.appendChild(el('strong', null, name));
        line.appendChild(document.createTextNode(': ' + JSON.stringify(v)));
        if (expired) { var chip = el('span', 'ik-chip is-bad', 'expired'); chip.style.marginLeft = '0.4rem'; line.appendChild(chip); }
        li.appendChild(line);
        li.appendChild(el('span', 'ik-jwt-meaning', meaningOf(name, v, now)));
        claimsList.appendChild(li);
      });
    }

    function renderAud(dec, sigOk) {
      var myAud = cb.checked ? OTHER_AUD : AUD;
      audLine.className = 'ik-jwt-aud';
      audLine.textContent = '';
      var tokenAud = dec.ok ? dec.value.aud : undefined;
      var lead = el('strong', null, 'aud check (the app\'s own, after the signature): ');
      audLine.appendChild(lead);
      if (tokenAud === undefined) { audLine.appendChild(document.createTextNode('no readable aud claim to compare with this app\'s client id "' + myAud + '".')); return; }
      var same = tokenAud === myAud;
      var mark = el('span', same ? 'ik-ok' : 'ik-fail', same ? 'matches.' : 'does not match.');
      audLine.appendChild(document.createTextNode('token says "' + tokenAud + '", this app\'s client id is "' + myAud + '": '));
      audLine.appendChild(mark);
      if (!same) {
        audLine.appendChild(document.createTextNode(sigOk
          ? ' The signature is valid, so the provider really issued this token, but it issued it to another app. This app must reject it: a token made for one app cannot be replayed at another.'
          : ' Both checks fail: the token is not for this app, and it is not intact either.'));
      } else {
        audLine.appendChild(document.createTextNode(' The token was issued for this app. Tick the box to see what another app would conclude.'));
      }
    }

    function render() {
      var ps = parts();
      var now = Math.floor(Date.now() / 1000);
      renderMirror(ps);

      var hd = ps.length === 3 ? decodePart(ps[0], 'header') : { ok: false, error: 'A JWT is three base64url strings joined by dots; this has ' + ps.length + '.' };
      var cd = ps.length === 3 ? decodePart(ps[1], 'claims') : { ok: false, error: 'A JWT is three base64url strings joined by dots; this has ' + ps.length + '.' };
      headErr.hidden = hd.ok;
      if (hd.ok) headOut.textContent = JSON.stringify(hd.value, null, 2); else { headOut.textContent = ''; headErr.textContent = hd.error; }
      renderClaims(cd, now);

      var ok = false;
      if (ps.length === 3) {
        try { ok = IKCrypto.ed.verify(IKCrypto.unb64url(ps[2]), IKCrypto.utf8ToBytes(ps[0] + '.' + ps[1]), pub); }
        catch (e) { ok = false; }
      }
      result.classList.toggle('is-valid', ok);
      result.classList.toggle('is-invalid', !ok);
      resLine.className = ok ? 'ik-ok' : 'ik-fail';
      var bodyChanged = ps.length !== 3 || ps[0] !== original.h || ps[1] !== original.p;
      if (ok) {
        resLine.textContent = 'Signature valid.';
        resWhy.textContent = resigned
          ? 'This header and claims were re-signed with the provider\'s private key, so they verify. Only the holder of that key can do this; an attacker who edits the claims cannot produce a signature this public key accepts.'
          : 'The header and claims are byte for byte what the provider signed, and the provider\'s private key made the signature.';
      } else {
        resLine.textContent = 'Signature invalid.';
        if (ps.length !== 3) resWhy.textContent = 'There is nothing well-formed to verify.';
        else if (bodyChanged) resWhy.textContent = 'The signature covers the exact bytes of the header and claims; they are no longer what was signed.';
        else resWhy.textContent = 'The header and claims are what was signed, but the signature bytes themselves were altered.';
      }
      renderAud(cd, ok);
    }

    /* ---------- Actions ---------- */
    function flip() {
      var ps = parts();
      if (ps.length !== 3) { setToken(original.h, original.p, original.s); ps = parts(); }
      var p = ps[1];
      // pick a character in the middle of the payload (inside the sub claim) and change it to another base64url character
      var i = Math.min(p.length - 1, Math.floor(p.length / 2));
      var ch = p[i];
      var rep = B64[(B64.indexOf(ch) + 1 + Math.floor(Math.random() * 62)) % 64];
      if (rep === ch) rep = B64[(B64.indexOf(ch) + 1) % 64];
      setToken(ps[0], p.slice(0, i) + rep + p.slice(i + 1), ps[2]);
      resigned = false;
      render();
      var stillJson = decodePart(parts()[1], 'claims').ok;
      status.textContent = 'One base64url character of the claims changed (marked above). ' + (stillJson
        ? 'The claims still decode, but not to what was signed.'
        : 'This one landed on a byte that makes the JSON unreadable; either way, the bytes are not what was signed.');
    }
    function expire() {
      var ps = parts();
      var cd = ps.length === 3 ? decodePart(ps[1], 'claims') : { ok: false };
      var claims = cd.ok ? cd.value : JSON.parse(JSON.stringify(original.claims));
      claims.exp = (typeof claims.exp === 'number' ? claims.exp : original.claims.exp) - 7200;
      setToken(ps.length === 3 ? ps[0] : original.h, encodeJson(claims), ps.length === 3 ? ps[2] : original.s);
      resigned = false;
      render();
      status.textContent = 'exp moved two hours back. Two independent checks now fail: the signature (the bytes changed) and the app\'s own expiry check on the decoded claim.';
    }
    function resign() {
      var ps = parts();
      if (ps.length !== 3) { status.textContent = 'Nothing well-formed to sign: the token needs three strings.'; return; }
      setToken(ps[0], ps[1], signOver(ps[0], ps[1]));
      resigned = !(ps[0] === original.h && ps[1] === original.p);
      render();
      status.textContent = resigned
        ? 'Re-signed over the edited header and claims with the provider\'s private key. The signature verifies again, which is exactly what an attacker without that key cannot achieve. The app\'s own checks (exp, aud, nonce) still apply.'
        : 'Re-signed the original header and claims: Ed25519 signatures are deterministic, so the signature is the same as before.';
    }
    function restore() {
      setToken(original.h, original.p, original.s);
      resigned = false;
      render();
      status.textContent = 'Back to the token as the provider issued it.';
    }

    ta.addEventListener('input', function () { resigned = false; render(); status.textContent = ''; });
    bFlip.addEventListener('click', flip);
    bExp.addEventListener('click', expire);
    bSign.addEventListener('click', resign);
    bRestore.addEventListener('click', restore);
    cb.addEventListener('change', render);

    issue();
    setToken(original.h, original.p, original.s);
    render();
  };
})();
