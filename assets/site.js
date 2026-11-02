/* Site runtime: mounts widgets, numbers figures, builds the "on this page" rail. */
(function () {
  window.IK = window.IK || {};
  IK.widgets = IK.widgets || {};

  function numberFigures() {
    var figs = document.querySelectorAll('figure.ik-figure');
    for (var i = 0; i < figs.length; i++) {
      var cap = figs[i].querySelector('figcaption');
      if (!cap) continue;
      var no = document.createElement('span');
      no.className = 'fig-no';
      no.textContent = 'Figure ' + (i + 1) + '.';
      cap.insertBefore(no, cap.firstChild);
    }
  }

  function mountWidgets() {
    var figs = document.querySelectorAll('figure.ik-figure[data-widget]');
    for (var i = 0; i < figs.length; i++) {
      var fig = figs[i];
      var name = fig.getAttribute('data-widget');
      var body = fig.querySelector('.ik-body');
      if (!body) continue;
      var fn = IK.widgets[name];
      if (typeof fn !== 'function') {
        body.innerHTML = '<div class="ik-unsupported">Interactive "' + name + '" did not load.</div>';
        continue;
      }
      var opts = {};
      try { opts = JSON.parse(fig.getAttribute('data-opts') || '{}'); } catch (e) {}
      try { fn(body, opts); } catch (e) {
        body.innerHTML = '<div class="ik-unsupported">This interactive hit an error: ' + (e && e.message ? e.message : e) + '</div>';
        if (window.console) console.error(name, e);
      }
    }
  }

  function buildRail() {
    var rail = document.querySelector('.rail ol');
    if (!rail) return;
    var heads = document.querySelectorAll('main > h1[id], main > h2[id], main > h3[id]');
    for (var i = 0; i < heads.length; i++) {
      var h = heads[i];
      var li = document.createElement('li');
      if (h.tagName === 'H1') continue;
      if (h.tagName === 'H3') li.style.paddingLeft = '0.75rem';
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      li.appendChild(a);
      rail.appendChild(li);
    }
    if ('IntersectionObserver' in window) {
      var links = rail.querySelectorAll('a');
      var map = {};
      for (var j = 0; j < links.length; j++) map[links[j].getAttribute('href').slice(1)] = links[j];
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            for (var k in map) map[k].classList.remove('active');
            var l = map[en.target.id]; if (l) l.classList.add('active');
          }
        });
      }, { rootMargin: '-10% 0px -80% 0px' });
      for (var m = 0; m < heads.length; m++) io.observe(heads[m]);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    numberFigures();
    mountWidgets();
    buildRail();
  });
})();
