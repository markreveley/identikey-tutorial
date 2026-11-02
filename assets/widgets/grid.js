/* grid — the custody ladder (C0..C4) laid against the access levels (A0..A5) of sections 23 and 24.
   One idea: every cell is a question, "can this way of authenticating reach a key held this way?",
   and the answer follows from the two definitions alone. */
(function () {
  window.IK = window.IK || {}; IK.widgets = IK.widgets || {};

  var STYLE_ID = 'ik-grid-style';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.ik-grid .ik-grid-wrap { overflow-x: auto; max-width: 100%; padding-bottom: 0.25rem; }',
      '.ik-grid table { border-collapse: separate; border-spacing: 0; font-size: 0.8125rem; min-width: 540px; width: 100%; }',
      '.ik-grid th { font-weight: 600; color: var(--ink-2); text-align: left; vertical-align: bottom; padding: 0.35rem 0.4rem; line-height: 1.25; }',
      '.ik-grid thead th { font-size: 0.75rem; }',
      '.ik-grid thead th b { display: block; color: var(--ink); font-size: 0.8125rem; }',
      '.ik-grid tbody th { white-space: nowrap; }',
      '.ik-grid tbody th small { display: block; font-weight: 400; color: var(--ink-3); font-size: 0.7rem; }',
      '.ik-grid td { padding: 0; border: 1px solid transparent; border-bottom-color: var(--rule); }',
      '.ik-grid tr.is-hosted th, .ik-grid tr.is-hosted td { background: var(--accent-soft); }',
      '.ik-grid td.is-lib { border-left: 2px dashed var(--accent); border-right: 2px dashed var(--accent); }',
      '.ik-grid td.is-lib-top { border-top: 2px dashed var(--accent); }',
      '.ik-grid td.is-lib-bottom { border-bottom: 2px dashed var(--accent); }',
      '.ik-grid td button { display: block; width: 100%; min-height: 2.6rem; font: inherit; font-size: 1.1rem; line-height: 1; color: var(--ink); background: transparent; border: 0; border-radius: 3px; cursor: pointer; padding: 0.3rem; }',
      '.ik-grid td button:hover { background: var(--paper-2); }',
      '.ik-grid td button.is-na { color: var(--ink-3); font-size: 1.5rem; }',
      '.ik-grid td[aria-selected="true"] button { background: var(--accent); color: var(--accent-ink); }',
      '.ik-grid td button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }',
      '.ik-grid .ik-grid-legend { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; font-size: 0.78rem; color: var(--ink-2); margin: 0; padding: 0; list-style: none; }',
      '.ik-grid .ik-grid-legend i { display: inline-block; width: 0.9rem; height: 0.9rem; vertical-align: -0.15rem; margin-right: 0.3rem; border-radius: 2px; }',
      '.ik-grid .ik-grid-legend i.is-hosted { background: var(--accent-soft); }',
      '.ik-grid .ik-grid-legend i.is-lib { border: 2px dashed var(--accent); }',
      '.ik-grid .ik-panel > h3 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.5rem; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }',
      '.ik-grid .ik-grid-kv { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.3rem 0.7rem; font-size: 0.8125rem; margin: 0; }',
      '.ik-grid .ik-grid-kv dt { color: var(--ink-3); margin: 0; white-space: nowrap; }',
      '.ik-grid .ik-grid-kv dd { margin: 0; color: var(--ink); }',
      '.ik-grid .ik-grid-kv dd b { font-weight: 600; }',
      '.ik-grid .ik-grid-kv dd.is-special { background: var(--warm-soft); color: var(--warm); border-radius: 3px; padding: 0.1rem 0.3rem; }',
      '.ik-grid .ik-grid-kv dd.is-na { background: var(--bad-soft); border-radius: 3px; padding: 0.1rem 0.3rem; }',
      '@media (max-width: 420px) { .ik-grid .ik-grid-kv { grid-template-columns: minmax(0, 1fr); gap: 0.1rem 0; } .ik-grid .ik-grid-kv dd { margin-bottom: 0.4rem; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* Section 23: the ladder, top rung first. */
  var RUNGS = [
    { id: 'C4', name: 'sole self-custody', title: 'Self-custody, sole', sign: 'only you', recovery: 'none', what: 'Be your own bank. Available on purpose, never the default.' },
    { id: 'C3', name: 'assisted recovery', title: 'Self-custody, assisted recovery', sign: 'only you', recovery: 'a quorum of guardians you chose', what: 'The recommended destination. Self-custody that survives a lost phone.' },
    { id: 'C2', name: 'managed', title: 'Managed', sign: 'the service, but only on your authenticated instruction, with a logged consent record', recovery: 'the service can restore access to the account (not yet offered by the hosted service)', what: 'The hosted product\'s design target. The service signs for you, and cannot sign without you.' },
    { id: 'C1', name: 'custodial', title: 'Custodial', sign: 'the service, unilaterally', recovery: 'the service can restore access to the account (not yet offered by the hosted service)', what: 'A traditional account. The honest name for most products that call themselves "web3 login".' },
    { id: 'C0', name: 'throwaway', title: 'Throwaway', sign: 'you, until you lose it', recovery: 'none, by design', what: 'An ephemeral or semi-anonymous identity. A legitimate destination, not a failure.' }
  ];
  /* Section 24: the access levels. */
  var LEVELS = [
    { id: 'A0', name: 'password', mechanism: 'Password', where: 'C1, C2' },
    { id: 'A1', name: 'email link', mechanism: 'Email magic link or SMS one-time code', where: 'C1, C2, and only for recovering account access, never a key' },
    { id: 'A2', name: 'social login', mechanism: 'Social bootstrap (Apple, Google)', where: 'C1, C2, as identity verification at signup, not ongoing authentication' },
    { id: 'A3', name: 'passkey', mechanism: 'Passkey (WebAuthn): authentication to a remote party', where: 'C1, C2' },
    { id: 'A4', name: 'enclave-backed key', mechanism: 'A key you hold, answering a challenge (identikey-auth)', where: 'C2 to C4. The native mechanism.' },
    { id: 'A5', name: 'air-gapped signer', mechanism: 'An offline or air-gapped signer', where: 'C4' }
  ];
  var MARKS = {
    C4: '· · · ○ ● ●',
    C3: '· · · ○ ● ○',
    C2: '○ ○ ○ ● ● ·',
    C1: '● ● ● ● ○ ·',
    C0: '· · · ○ ● ·'
  };
  var MARK_NAME = { '●': 'primary', '○': 'supported', '·': 'does not make sense' };
  var MARK_TEXT = {
    '●': 'the primary way of reaching the key at this rung',
    '○': 'supported: a way of reaching the key at this rung, but not the main one',
    '·': 'this combination does not make sense'
  };

  /* Why a "·" cell is empty, derived from the two definitions. */
  function naReason(r, a) {
    var youOnly = r.id === 'C3' || r.id === 'C4';
    if (youOnly && a.id === 'A0') return 'a self-custody rung cannot be reached by a password the service checks: at ' + r.id + ' only you can sign, so there is no service holding a key to unlock.';
    if (youOnly && a.id === 'A1') return 'an email link or one-time code only ever recovers account access at a service, never a key, and at ' + r.id + ' only you can sign: there is no service account standing in front of the key.';
    if (youOnly && a.id === 'A2') return 'a social login verifies identity to a service at signup, and at ' + r.id + ' no service holds or signs with the key, so there is nothing for Apple or Google to vouch you into.';
    if (r.id === 'C0' && a.id === 'A0') return 'a throwaway identity has no recovery by design and no account the service keeps, so there is no password for a service to check.';
    if (r.id === 'C0' && a.id === 'A1') return 'an email link recovers account access, and a throwaway identity has none to recover: recovery is "none, by design".';
    if (r.id === 'C0' && a.id === 'A2') return 'a social bootstrap ties an identity to an Apple or Google account at signup, the opposite of an ephemeral or semi-anonymous identity.';
    if (a.id === 'A5' && r.id === 'C2') return 'an air-gapped signer keeps the key off any connected machine, while at C2 the service holds the key and signs on your instruction; the key cannot be in both places.';
    if (a.id === 'A5' && r.id === 'C1') return 'an air-gapped signer never meets a service, while at C1 the service signs unilaterally; a key it can use cannot be offline.';
    if (a.id === 'A5' && r.id === 'C0') return 'an offline signer is a deliberate, high-ceremony setup for a key you mean to keep, the opposite of a throwaway identity with no recovery.';
    return 'the definitions of ' + r.id + ' and ' + a.id + ' do not meet.';
  }

  /* The sentence for the special intersections. */
  function special(r, a) {
    if ((r.id === 'C1' || r.id === 'C2') && a.id === 'A3') return 'This is where the hosted service is today: accounts on the hosted service are reached by passkey.';
    if (r.id === 'C2' && a.id === 'A4') return 'Reachable today through the challenge ceremony (section 20): a key you hold answers the provider\'s challenge with identikey-auth.';
    if (r.id === 'C2' && (a.id === 'A0' || a.id === 'A1' || a.id === 'A2')) return 'Supported but not offered by IdentiKey, which is passkey-only.';
    if (r.id === 'C1' && a.id === 'A4') return 'A held key can answer a challenge for a custodial account, but the service can still sign without you, so the key does not change the rung.';
    if (r.id === 'C3' && a.id === 'A3') return 'Supported, not primary: at C3 there is no remote party to authenticate to; the one real case is a browser using a passkey to wrap a locally stored key.';
    if (r.id === 'C4' && a.id === 'A3') return 'Supported, not primary: a passkey here is a key-wrapping tool in a browser, not a proof of identity to anyone.';
    if ((r.id === 'C3' || r.id === 'C4') && a.id === 'A4') return 'The identikey-auth library occupies this column at every rung from C2 up; a native app backing the key with the device\'s secure hardware is what makes ' + r.id + ' reachable by ordinary people.';
    if (r.id === 'C3' && a.id === 'A5') return 'Supported: an offline signer can hold a self-custody key that guardians can also help recover.';
    if (r.id === 'C4' && a.id === 'A5') return 'Primary alongside A4: at the sole self-custody rung an offline or air-gapped signer is the natural home for the key, with nobody able to help if it is lost.';
    if (r.id === 'C0' && a.id === 'A4') return 'A throwaway identity is simply a key you hold and may lose; answering a challenge with it is the whole account.';
    if (r.id === 'C0' && a.id === 'A3') return 'Supported: a passkey can wrap an ephemeral key in a browser, but nothing survives losing it.';
    return '';
  }

  IK.widgets['grid'] = function (root, opts) {
    ensureStyle();

    var w = el('div', 'ik-widget ik-grid');
    var stack = el('div', 'ik-stack');
    w.appendChild(stack);

    var intro = el('p', 'ik-help', 'Custody rungs down the side, access levels across the top. Select a cell to read what the mark means there. Arrow keys move between cells.');
    intro.id = 'grid-intro'; intro.style.margin = '0';
    stack.appendChild(intro);

    /* ---------- The grid ---------- */
    var wrap = el('div', 'ik-grid-wrap');
    var table = el('table'); table.id = 'grid-table';
    table.setAttribute('role', 'grid');
    table.setAttribute('aria-label', 'Custody rungs against access levels');
    table.setAttribute('aria-describedby', 'grid-intro');
    var thead = el('thead'); var hr = el('tr'); hr.setAttribute('role', 'row');
    var corner = el('th', null, ''); corner.setAttribute('role', 'columnheader'); corner.setAttribute('scope', 'col');
    hr.appendChild(corner);
    LEVELS.forEach(function (a) {
      var th = el('th'); th.setAttribute('role', 'columnheader'); th.setAttribute('scope', 'col'); th.id = 'grid-col-' + a.id;
      th.appendChild(el('b', null, a.id)); th.appendChild(document.createTextNode(a.name));
      hr.appendChild(th);
    });
    thead.appendChild(hr); table.appendChild(thead);

    var tbody = el('tbody');
    var cells = [];   // cells[rowIndex][colIndex] = { td, btn, r, a, mark }
    RUNGS.forEach(function (r, ri) {
      var tr = el('tr', (r.id === 'C1' || r.id === 'C2') ? 'is-hosted' : ''); tr.setAttribute('role', 'row');
      var th = el('th'); th.setAttribute('role', 'rowheader'); th.setAttribute('scope', 'row'); th.id = 'grid-row-' + r.id;
      th.appendChild(document.createTextNode(r.id + ' ' + r.name));
      if (r.id === 'C1' || r.id === 'C2') th.appendChild(el('small', null, 'hosted service'));
      tr.appendChild(th);
      var marks = MARKS[r.id].split(' ');
      var row = [];
      LEVELS.forEach(function (a, ci) {
        var mark = marks[ci];
        var td = el('td'); td.setAttribute('role', 'gridcell'); td.setAttribute('aria-selected', 'false');
        var lib = a.id === 'A4' && (r.id === 'C2' || r.id === 'C3' || r.id === 'C4');
        if (lib) { td.classList.add('is-lib'); if (r.id === 'C4') td.classList.add('is-lib-top'); if (r.id === 'C2') td.classList.add('is-lib-bottom'); }
        var b = el('button', mark === '·' ? 'is-na' : '', mark);
        b.type = 'button'; b.id = 'grid-cell-' + r.id + '-' + a.id; b.tabIndex = -1;
        b.setAttribute('aria-label', r.id + ' ' + r.name + ', ' + a.id + ' ' + a.name + ': ' + MARK_NAME[mark]);
        b.setAttribute('data-mark', mark);
        td.appendChild(b); tr.appendChild(td);
        row.push({ td: td, btn: b, r: r, a: a, mark: mark, ri: ri, ci: ci });
      });
      cells.push(row);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    stack.appendChild(wrap);

    var legend = el('ul', 'ik-grid-legend'); legend.id = 'grid-legend';
    [['●', 'primary'], ['○', 'supported'], ['·', 'does not make sense']].forEach(function (m) {
      var li = el('li'); li.appendChild(el('b', null, m[0] + ' ')); li.appendChild(document.createTextNode(m[1])); legend.appendChild(li);
    });
    var l1 = el('li'); l1.appendChild(el('i', 'is-hosted')); l1.appendChild(document.createTextNode('C1 and C2: the hosted service of Part 4')); legend.appendChild(l1);
    var l2 = el('li'); l2.appendChild(el('i', 'is-lib')); l2.appendChild(document.createTextNode('A4 from C2 up: the identikey-auth protocol library')); legend.appendChild(l2);
    stack.appendChild(legend);

    /* ---------- Detail panel ---------- */
    var panel = el('section', 'ik-panel'); panel.id = 'grid-detail';
    panel.setAttribute('aria-live', 'polite'); panel.setAttribute('aria-labelledby', 'grid-detail-title');
    var title = el('h3'); title.id = 'grid-detail-title';
    var titleText = el('span'); var markChip = el('span', 'ik-chip'); markChip.id = 'grid-detail-mark';
    title.appendChild(titleText); title.appendChild(markChip);
    panel.appendChild(title);
    var dl = el('dl', 'ik-grid-kv');
    function kv(key, id) { dl.appendChild(el('dt', null, key)); var dd = el('dd'); dd.id = id; dl.appendChild(dd); return dd; }
    var dRung = kv('Rung', 'grid-detail-rung');
    var dLevel = kv('Access level', 'grid-detail-level');
    var dMark = kv('Here', 'grid-detail-here');
    var dNote = kv('Note', 'grid-detail-note');
    panel.appendChild(dl);
    stack.appendChild(panel);
    root.appendChild(w);

    /* ---------- State ---------- */
    var selected = null;

    function describe(c) {
      var r = c.r, a = c.a;
      titleText.textContent = r.id + ' ' + r.name + ' × ' + a.id + ' ' + a.name;
      markChip.textContent = c.mark + ' ' + MARK_NAME[c.mark];
      markChip.className = 'ik-chip' + (c.mark === '●' ? ' is-good' : c.mark === '○' ? ' is-warm' : '');
      dRung.textContent = '';
      dRung.appendChild(el('b', null, r.id + ' ' + r.title + '. '));
      dRung.appendChild(document.createTextNode('Who can sign: ' + r.sign + '. Recovery: ' + r.recovery + '. ' + r.what));
      dLevel.textContent = '';
      dLevel.appendChild(el('b', null, a.id + ' ' + a.mechanism + '. '));
      dLevel.appendChild(document.createTextNode('Where it applies: ' + a.where + (/\.$/.test(a.where) ? '' : '.')));
      if (c.mark === '·') {
        dMark.className = 'is-na';
        dMark.textContent = MARK_TEXT['·'] + ': ' + naReason(r, a);
      } else {
        dMark.className = '';
        dMark.textContent = c.mark + ' ' + MARK_TEXT[c.mark] + '.';
      }
      var sp = special(r, a);
      dNote.textContent = sp || 'No special case at this intersection.';
      dNote.className = sp ? 'is-special' : '';
    }

    function select(c, focus) {
      if (selected) { selected.td.setAttribute('aria-selected', 'false'); selected.btn.tabIndex = -1; }
      selected = c;
      c.td.setAttribute('aria-selected', 'true'); c.btn.tabIndex = 0;
      describe(c);
      if (focus) c.btn.focus();
    }

    cells.forEach(function (row) {
      row.forEach(function (c) {
        c.btn.addEventListener('click', function () { select(c, true); });
        c.btn.addEventListener('keydown', function (e) {
          var ri = c.ri, ci = c.ci;
          if (e.key === 'ArrowRight') ci++;
          else if (e.key === 'ArrowLeft') ci--;
          else if (e.key === 'ArrowDown') ri++;
          else if (e.key === 'ArrowUp') ri--;
          else if (e.key === 'Home') ci = 0;
          else if (e.key === 'End') ci = LEVELS.length - 1;
          else return;
          e.preventDefault();
          ri = Math.max(0, Math.min(RUNGS.length - 1, ri));
          ci = Math.max(0, Math.min(LEVELS.length - 1, ci));
          select(cells[ri][ci], true);
        });
      });
    });

    select(cells[2][3], false); // C2 managed × A3 passkey: where the hosted service is today
  };
})();
