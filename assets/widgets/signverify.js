/* signverify — an Ed25519 signer and a verifier side by side.
   One idea: a valid signature asserts origin (this private key signed) and integrity (nothing changed since). */
(function () {
  window.IK = window.IK || {}; IK.widgets = IK.widgets || {};

  var DEFAULT_MESSAGE = 'I, Sam, approve release 2.4.1';
  var STYLE_ID = 'ik-signverify-style';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.ik-sv .ik-sv-cols { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }',
      '.ik-sv .ik-panel > h3 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.6rem; }',
      '.ik-sv .ik-sv-field { margin: 0 0 0.6rem; }',
      '.ik-sv .ik-sv-field .ik-row { justify-content: space-between; }',
      '.ik-sv .ik-sv-field .ik-label { margin: 0; }',
      '.ik-sv .ik-sv-val { font-family: var(--font-mono); font-size: 0.8125rem; line-height: 1.5; word-break: break-all; color: var(--ink); background: var(--code-bg); border-radius: 4px; padding: 0.35rem 0.5rem; min-height: 1.6rem; }',
      '.ik-sv .ik-sv-val.is-empty { color: var(--ink-3); font-family: var(--font-display); }',
      '.ik-sv .ik-sv-val.is-masked { letter-spacing: 0.05em; color: var(--ink-3); }',
      '.ik-sv .ik-sv-val.ik-changed { background: var(--warm-soft); }',
      '.ik-sv .ik-sv-result { margin: 0.6rem 0 0; padding: 0.5rem 0.6rem; border-radius: 4px; background: var(--paper-2); font-size: 0.85rem; }',
      '.ik-sv .ik-sv-result.is-valid { background: var(--good-soft); }',
      '.ik-sv .ik-sv-result.is-invalid { background: var(--bad-soft); }',
      '.ik-sv .ik-sv-result p { margin: 0.2rem 0 0; color: var(--ink-2); font-weight: 400; }',
      '.ik-sv .ik-sv-tamper { margin-top: 0.6rem; }',
      '.ik-sv .ik-sv-tamper .ik-label { margin-bottom: 0.4rem; }',
      '.ik-sv .ik-btn.is-tiny { padding: 0.15rem 0.5rem; font-size: 0.75rem; font-weight: 500; }',
      '.ik-sv .ik-chip { margin-left: 0.4rem; }'
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
  // A labelled read-only value box; returns {wrap, val, head}
  function field(id, label) {
    var wrap = el('div', 'ik-sv-field');
    var head = el('div', 'ik-row');
    var lab = el('span', 'ik-label', label);
    lab.id = id + '-label';
    head.appendChild(lab);
    var val = el('div', 'ik-sv-val');
    val.id = id;
    val.setAttribute('aria-labelledby', lab.id);
    wrap.appendChild(head); wrap.appendChild(val);
    return { wrap: wrap, val: val, head: head, label: lab };
  }
  function hex(bytes) { return IKCrypto.bytesToHex(bytes); }
  function digestOf(text) { return IKCrypto.sha256(IKCrypto.utf8ToBytes(text)); }

  IK.widgets['signverify'] = function (root, opts) {
    ensureStyle();

    var w = el('div', 'ik-widget ik-sv');
    var cols = el('div', 'ik-sv-cols');
    w.appendChild(cols);

    /* ---------- Signer ---------- */
    var signer = el('section', 'ik-panel');
    signer.setAttribute('aria-labelledby', 'signverify-signer-title');
    signer.appendChild(el('h3', null, 'Signer')).id = 'signverify-signer-title';

    var fPriv = field('signverify-priv', 'Private key (32 bytes, secret)');
    var showBtn = btn('signverify-priv-toggle', 'Show', 'is-secondary is-tiny');
    showBtn.setAttribute('aria-pressed', 'false');
    showBtn.setAttribute('aria-controls', 'signverify-priv');
    fPriv.head.appendChild(showBtn);
    signer.appendChild(fPriv.wrap);

    var fPub = field('signverify-pub', 'Public key (32 bytes, shareable)');
    signer.appendChild(fPub.wrap);

    var msgWrap = el('div', 'ik-sv-field');
    var msgLab = el('label', 'ik-label', 'Message to sign');
    msgLab.htmlFor = 'signverify-msg';
    var ta = el('textarea', 'ik-textarea');
    ta.id = 'signverify-msg'; ta.rows = 2; ta.spellcheck = false; ta.value = DEFAULT_MESSAGE;
    msgWrap.appendChild(msgLab); msgWrap.appendChild(ta);
    signer.appendChild(msgWrap);

    var signRow = el('div', 'ik-row');
    var signBtn = btn('signverify-sign', 'Sign');
    var newKeyBtn = btn('signverify-newkey', 'New key pair', 'is-secondary');
    signRow.appendChild(signBtn); signRow.appendChild(newKeyBtn);
    signer.appendChild(signRow);

    var fSig = field('signverify-sig', 'Signature (64 bytes, 128 hex digits)');
    fSig.wrap.style.marginTop = '0.6rem';
    signer.appendChild(fSig.wrap);
    signer.appendChild(el('p', 'ik-help', 'This demo hashes the message with SHA-256 first and signs that digest (a pre-hash, as in section 4); identikey-auth itself signs its encoded challenge directly.'));

    /* ---------- Verifier ---------- */
    var verifier = el('section', 'ik-panel');
    verifier.setAttribute('aria-labelledby', 'signverify-verifier-title');
    verifier.appendChild(el('h3', null, 'Verifier')).id = 'signverify-verifier-title';

    var vMsg = field('signverify-v-msg', 'Message received');
    var vPub = field('signverify-v-pub', 'Public key received');
    var pubTag = el('span', 'ik-chip is-warm', 'different key');
    pubTag.id = 'signverify-v-pub-tag'; pubTag.hidden = true;
    vPub.label.appendChild(pubTag);
    var vSig = field('signverify-v-sig', 'Signature received');
    verifier.appendChild(vMsg.wrap); verifier.appendChild(vPub.wrap); verifier.appendChild(vSig.wrap);

    var verifyRow = el('div', 'ik-row');
    var verifyBtn = btn('signverify-verify', 'Verify');
    verifyRow.appendChild(verifyBtn);
    verifier.appendChild(verifyRow);

    var result = el('div', 'ik-sv-result');
    result.id = 'signverify-result';
    result.setAttribute('role', 'status');
    result.setAttribute('aria-live', 'polite');
    var resultLine = el('span'); resultLine.id = 'signverify-result-line';
    var resultWhy = el('p'); resultWhy.id = 'signverify-result-why';
    result.appendChild(resultLine); result.appendChild(resultWhy);
    verifier.appendChild(result);

    var tamper = el('div', 'ik-sv-tamper');
    tamper.appendChild(el('span', 'ik-label', 'Tamper with what the verifier received'));
    var tamperRow = el('div', 'ik-row');
    var tMsg = btn('signverify-tamper-msg', 'Change one character of the message', 'is-secondary');
    var tKey = btn('signverify-tamper-key', 'Use a different public key', 'is-secondary');
    var tRestore = btn('signverify-restore', 'Restore', 'is-secondary');
    tamperRow.appendChild(tMsg); tamperRow.appendChild(tKey); tamperRow.appendChild(tRestore);
    tamper.appendChild(tamperRow);
    verifier.appendChild(tamper);

    cols.appendChild(signer); cols.appendChild(verifier);
    root.appendChild(w);

    /* ---------- State ---------- */
    var priv, pub, privShown = false;
    var signed = null;        // { message, pubHex, sigHex } as sent to the verifier
    var received = null;      // { message, pubHex, sigHex, msgChanged, keyChanged }
    var otherPub = null;      // a second key pair's public key (hex), for the "different key" tamper

    function renderPriv() {
      var h = hex(priv);
      fPriv.val.textContent = privShown ? h : h.replace(/./g, '•');
      fPriv.val.classList.toggle('is-masked', !privShown);
      showBtn.textContent = privShown ? 'Hide' : 'Show';
      showBtn.setAttribute('aria-pressed', privShown ? 'true' : 'false');
    }

    function newKeyPair() {
      priv = IKCrypto.ed.utils.randomPrivateKey();
      pub = IKCrypto.ed.getPublicKey(priv);
      otherPub = null;
      renderPriv();
      fPub.val.textContent = hex(pub);
      sign();
    }

    function sign() {
      var message = ta.value;
      var sig = IKCrypto.ed.sign(digestOf(message), priv);
      signed = { message: message, pubHex: hex(pub), sigHex: hex(sig) };
      fSig.val.textContent = signed.sigHex;
      fSig.val.classList.remove('is-empty');
      restoreReceived();
    }

    function restoreReceived() {
      received = { message: signed.message, pubHex: signed.pubHex, sigHex: signed.sigHex, msgChanged: false, keyChanged: false };
      renderReceived();
      verify();
    }

    function renderReceived() {
      vMsg.val.textContent = received.message;
      vMsg.val.classList.toggle('ik-changed', received.msgChanged);
      vPub.val.textContent = received.pubHex;
      vPub.val.classList.toggle('ik-changed', received.keyChanged);
      pubTag.hidden = !received.keyChanged;
      vSig.val.textContent = received.sigHex;
    }

    function verify() {
      var ok = false;
      try {
        ok = IKCrypto.ed.verify(IKCrypto.hexToBytes(received.sigHex), digestOf(received.message), IKCrypto.hexToBytes(received.pubHex));
      } catch (e) { ok = false; }
      result.classList.toggle('is-valid', ok);
      result.classList.toggle('is-invalid', !ok);
      resultLine.className = ok ? 'ik-ok' : 'ik-fail';
      if (ok) {
        resultLine.textContent = 'Signature valid.';
        resultWhy.textContent = 'The message is exactly what was signed, by the holder of the private key matching this public key.';
      } else {
        resultLine.textContent = 'Signature invalid.';
        if (received.keyChanged && received.msgChanged) {
          resultWhy.textContent = 'Both assertions fail: this public key did not produce the signature (origin), and the message is not what was signed (integrity).';
        } else if (received.keyChanged) {
          resultWhy.textContent = 'Origin fails: the private key matching this public key did not produce this signature. The message is unchanged, but the verifier cannot tell that from a signature made with another key.';
        } else if (received.msgChanged) {
          resultWhy.textContent = 'Integrity fails: the verifier hashed its copy of the message and got a different digest from the one that was signed, so the message changed after signing.';
        } else {
          resultWhy.textContent = 'The signature does not match this message and public key.';
        }
      }
      return ok;
    }

    function tamperMessage() {
      var m = received.message;
      if (received.msgChanged) m = signed.message;        // start from the signed message so it is always "one character"
      var i = m.length - 1;
      while (i >= 0 && /\s/.test(m[i])) i--;
      if (i < 0) { m = m + '.'; }
      else {
        var ch = m[i];
        var rep = /[0-9]/.test(ch) ? String((Number(ch) + 1) % 10)
          : (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) ? ch.toLowerCase()
          : (ch !== ch.toUpperCase()) ? ch.toUpperCase() : (ch === '.' ? '!' : '.');
        m = m.slice(0, i) + rep + m.slice(i + 1);
      }
      received.message = m;
      received.msgChanged = true;
      renderReceived();
      verify();
    }

    function tamperKey() {
      if (!otherPub) otherPub = hex(IKCrypto.ed.getPublicKey(IKCrypto.ed.utils.randomPrivateKey()));
      received.pubHex = otherPub;
      received.keyChanged = true;
      renderReceived();
      verify();
    }

    /* ---------- Wiring ---------- */
    showBtn.addEventListener('click', function () { privShown = !privShown; renderPriv(); });
    signBtn.addEventListener('click', sign);
    newKeyBtn.addEventListener('click', newKeyPair);
    verifyBtn.addEventListener('click', verify);
    tMsg.addEventListener('click', tamperMessage);
    tKey.addEventListener('click', tamperKey);
    tRestore.addEventListener('click', restoreReceived);
    ta.addEventListener('input', function () {
      // The signer edited the message: the old signature no longer covers it until Sign is pressed again.
      if (signed && ta.value !== signed.message) {
        fSig.val.textContent = 'Message edited since it was signed. Press Sign to sign the new text.';
        fSig.val.classList.add('is-empty');
      } else if (signed) {
        fSig.val.textContent = signed.sigHex;
        fSig.val.classList.remove('is-empty');
      }
    });

    newKeyPair();
  };
})();
