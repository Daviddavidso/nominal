/* ═══════════════════════════════════════════════════════════
   Рисует каталог и фильтры из data.js.
   Грузится ДО app.js — тот вешает фильтр уже на готовые карточки.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Каталог объявлен в data.php/data.js глобальными const, а const мимо
     window не переприсвоить — поэтому работаем с локальными переменными.
     На адресе с ?draft=1 в них ложится черновик из панели (его кладёт
     panel.html кнопкой «Предпросмотр»), на боевом адресе ничего не меняется. */
  var site   = typeof SITE       !== 'undefined' ? SITE       : {};
  var cats   = typeof CATEGORIES !== 'undefined' ? CATEGORIES : [];
  var offers = typeof OFFERS     !== 'undefined' ? OFFERS     : [];

  if (/[?&]draft/.test(location.search)) {
    try {
      var draftFile = localStorage.getItem('nominal_admin_draft:file');
      if (draftFile) {
        var d = new Function(draftFile + '\n;return { SITE: SITE, CATEGORIES: CATEGORIES, OFFERS: OFFERS };')();
        site = d.SITE || site; cats = d.CATEGORIES || cats; offers = d.OFFERS || offers;
      }
    } catch (e) { /* битый черновик — показываем боевой каталог */ }
  }
  /* app.js берёт отсюда ссылку на Telegram для подсказки в форме. */
  window.NOMINAL = { site: site };

  /* ── тексты сайта из панели ── */
  if (site.brand) {
    Array.prototype.forEach.call(document.querySelectorAll('.brand__word'), function (n) {
      n.textContent = site.brand;
    });
  }
  var eyebrow = document.querySelector('.hero .eyebrow');
  if (eyebrow && site.tagline) {
    var dot = eyebrow.querySelector('.dot');
    eyebrow.textContent = '';
    if (dot) eyebrow.appendChild(dot);
    eyebrow.appendChild(document.createTextNode(site.tagline));
  }

  var grid = document.getElementById('cards');
  var filters = document.querySelector('.filters');
  if (!grid) return;

  /* ── цвет крупной цифры ──────────────────────────────────
     Берём цвет плашки и затемняем, пока он не даст 4.5:1 на белом.
     Так цифра остаётся читаемой, какой бы цвет ни выбрал клиент. */
  function lum(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var c = [0, 2, 4].map(function (i) {
      var v = parseInt(h.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function onWhite(hex) { return 1.05 / (lum(hex) + 0.05); }
  function darken(hex, k) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return '#' + [0, 2, 4].map(function (i) {
      var v = Math.round(parseInt(h.substr(i, 2), 16) * k);
      return ('0' + Math.max(0, Math.min(255, v)).toString(16)).slice(-2);
    }).join('');
  }
  function accentOf(hex) {
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return 'var(--ink)';
    var c = hex, k = 1;
    while (onWhite(c) < 4.5 && k > 0.2) { k -= 0.06; c = darken(hex, k); }
    return onWhite(c) >= 4.5 ? c : 'var(--ink)';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function initials(name) {
    return String(name || '?').trim().split(/[\s-]+/).slice(0, 2)
      .map(function (w) { return w.charAt(0); }).join('').toUpperCase();
  }

  var ctaOf = {};
  cats.forEach(function (c) { ctaOf[c.id] = c.cta || 'Оформить'; });

  /* ── фильтры ── */
  if (filters) {
    filters.innerHTML =
      '<button class="chipbtn" type="button" data-filter="all" aria-pressed="true">Все</button>' +
      cats.map(function (c) {
        return '<button class="chipbtn" type="button" data-filter="' + esc(c.id) +
               '" aria-pressed="false">' + esc(c.label) + '</button>';
      }).join('');
  }

  /* ── карточки ── */
  var shown = offers.filter(function (o) { return !o.hidden; });

  grid.innerHTML = shown.map(function (o, i) {
    var n = i + 1;
    var tone = o.tone || {};
    var bg = tone.bg || '#1B2AE0';
    var ink = tone.ink || '#FFFFFF';
    var href = (o.url || '').trim() || '#apply';
    var ext = href.indexOf('http') === 0;

    var hasImg = !!(o.logo || '').trim();
    var badge = hasImg
      ? '<img src="' + esc(o.logo) + '" alt="" width="46" height="46" loading="lazy">'
      : (o.mark
          ? '<svg viewBox="0 0 32 32" focusable="false"><use href="#' + esc(o.mark) + '"/></svg>'
          : '<span class="blogo__ini">' + esc(initials(o.partner)) + '</span>');

    var specs = (o.specs || []).map(function (p) {
      return '<div><dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd></div>';
    }).join('');

    return '<li class="card reveal" data-cat="' + esc(o.cat) + '"' +
             ' style="--c:' + esc(bg) + ';--ci:' + esc(ink) + ';--t:' + esc(accentOf(bg)) + '">' +
             '<div class="card__head">' +
               '<span class="blogo' + (hasImg ? ' blogo--img' : '') + '" aria-hidden="true">' + badge + '</span>' +
               '<span class="card__bankname">' + esc(o.partner) + '</span>' +
               (o.tag ? '<span class="card__tag">' + esc(o.tag) + '</span>' : '') +
             '</div>' +
             '<h3 class="card__title" id="p' + n + '-t">' + esc(o.title) + '</h3>' +
             '<p class="card__hero"><b>' + esc(o.headline) + '</b>' +
               '<span>' + esc(o.note) + '</span></p>' +
             (specs ? '<dl class="card__spec">' + specs + '</dl>' : '') +
             '<a class="card__cta" id="p' + n + '-c" href="' + esc(href) + '"' +
               (ext ? ' target="_blank" rel="noopener sponsored nofollow"' : '') +
               ' aria-labelledby="p' + n + '-c p' + n + '-t' + (ext ? ' p' + n + '-nt' : '') + '">' +
               esc(ctaOf[o.cat] || 'Оформить') + '</a>' +
             (ext ? '<span class="vh" id="p' + n + '-nt">откроется в новой вкладке</span>' : '') +
           '</li>';
  }).join('');

  var st = document.getElementById('fstatus');
  if (st) {
    var n = shown.length, d = n % 10, h = n % 100;
    var w = (d === 1 && h !== 11) ? 'предложение'
          : (d >= 2 && d <= 4 && (h < 10 || h >= 20)) ? 'предложения' : 'предложений';
    st.textContent = 'Показано ' + n + ' ' + w;
  }
})();
