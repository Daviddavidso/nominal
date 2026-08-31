/* ==========================================================================
   ЯДРО АДМИНКИ — одинаковое во всех витринах.

   Проект описывает себя схемой и двумя функциями (файл admin-schema.js):

     window.ADMIN = {
       brand:    'ВЫГОДА',                 // видно в шапке
       draftKey: 'vygoda_admin_draft',     // ключ черновика в браузере
       preview:  'index.html?draft=1',     // необязательно
       requireErid: true,                  // маркировка обязательна
       logo: true,                         // блок логотипа/плашки в карточке
       site:   [ {key, label, hint, textarea} ],       // тексты сайта
       groups: [ {key, label, hint, textarea} ],       // подписи разделов
       card:   [ {key, label, hint, type, required} ], // поля карточки
       load:   function () { return {SITE, GROUPS, CARDS}; },
       build:  function (model) { return 'текст файла данных'; }
     };

   Общая модель: SITE — объект строк, GROUPS — [{key,title,...}],
   CARDS — [{uid, group, hidden, ...поля схемы}]. Как это ложится на
   реальный файл проекта, знает только его схема — ядро о формате не знает.

   Типы полей: text | textarea | url | pairs («Подпись: значение» построчно)
               | lines (по строке на пункт)
   ========================================================================== */

(function () {
  'use strict';

  var A = window.ADMIN;
  if (!A) { console.error('Нет window.ADMIN — админке нечего показывать.'); return; }

  /* Фон карточки на сайте — к нему считаем контраст плашки. У витрин он
     разный: тёмная карточка в одной, белая в другой. Берём из схемы
     проекта, иначе проверка ругается на цвета, которые на самом деле
     нормально читаются, и клиент не может ничего сохранить. */
  var SURFACE = (window.ADMIN && window.ADMIN.surface) || '#1c1c1c';
  var MIN_INK = 4.5, MIN_TILE = 3.0;
  var MAX_LOGO = 200 * 1024;
  var DEFAULT_TONE = { bg: '#ff9f43', ink: '#111111' };

  var groupsBox = document.getElementById('groups');
  var stateLine = document.getElementById('state');
  var summary = document.getElementById('error-summary');
  var summaryList = document.getElementById('error-summary-list');
  var summaryTitle = document.getElementById('error-summary-title');
  var ask = document.getElementById('ask');

  /* ---------------------------------------------- состояние ------------ */

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var fileModel = A.load();
  function fileState() { return clone(fileModel); }

  var state = fileState();
  var fromDraft = false;

  try {
    var raw = localStorage.getItem(A.draftKey);
    var draft = raw ? JSON.parse(raw) : null;
    if (draft && Array.isArray(draft.CARDS) && Array.isArray(draft.GROUPS) && draft.SITE) {
      state = draft;
      fromDraft = true;
    }
  } catch (e) { /* черновик битый — работаем с файлом */ }

  var open = {};
  var dirty = false;

  /* ---------------------------------------------- помощники ------------ */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function trim(v) { return String(v == null ? '' : v).trim(); }

  function eridOf(url) {
    var m = /[?&]erid=([A-Za-z0-9_-]+)/.exec(String(url || ''));
    return m ? m[1] : '';
  }

  function initials(name) {
    var w = trim(name).split(/[\s.\-—]+/).filter(Boolean);
    if (!w.length) return '?';
    return (w.length > 1 ? w[0][0] + w[1][0] : w[0][0]).toUpperCase();
  }

  var NAME_KEYS = ['partner', 'brand', 'title', 'name'];
  function label(card) {
    var parts = [];
    A.card.forEach(function (f) {
      if (NAME_KEYS.indexOf(f.key) !== -1 && trim(card[f.key])) parts.push(trim(card[f.key]));
    });
    return parts.slice(0, 2).join(', ');
  }

  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return n + ' ' + many;
    if (b > 1 && b < 5) return n + ' ' + few;
    if (b === 1) return n + ' ' + one;
    return n + ' ' + many;
  }

  function uidNew() {
    if (window.crypto && crypto.randomUUID) return 'c-' + crypto.randomUUID().slice(0, 8);
    return 'c-' + Math.random().toString(36).slice(2, 10);
  }

  /* ---------------------------------------------- контраст ------------- */

  function isHex(v) { return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trim(v)); }

  function lum(hex) {
    var h = trim(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var v = [0, 2, 4].map(function (i) {
      var c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function ratio(a, b) {
    var l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function fmt(n) { return n.toFixed(2).replace('.', ',') + ':1'; }

  /* Две проверки: буква к плашке (обычный текст) и плашка к фону карточки
     (несущий элемент интерфейса). */
  function toneReport(bg, ink) {
    if (!isHex(bg) || !isHex(ink)) {
      return { state: 'fail', ok: false, text: 'Цвет записывается как #12833B или #fff.' };
    }
    var rInk = ratio(bg, ink), rTile = ratio(bg, SURFACE);
    var okInk = rInk >= MIN_INK, okTile = rTile >= MIN_TILE;
    if (!okInk || !okTile) {
      return { state: 'fail', ok: false,
        text: 'Не проходит: буква к плашке ' + fmt(rInk) + ' (нужно 4,5:1), плашка к фону карточки '
            + fmt(rTile) + ' (нужно 3:1). ' + (okInk ? 'Возьмите фон плашки светлее.' : 'Возьмите буквы светлее.') };
    }
    if (rInk < 5.5 || rTile < 4) {
      return { state: 'warn', ok: true, text: 'Впритык: буква ' + fmt(rInk) + ', плашка ' + fmt(rTile) + '.' };
    }
    return { state: 'pass', ok: true, text: 'Проходит: буква ' + fmt(rInk) + ', плашка ' + fmt(rTile) + '.' };
  }

  /* ---------------------------------------------- живые области -------- */

  var timers = {}, slowTimers = {};

  function announce(text, assertive) {
    var node = document.getElementById(assertive ? 'a-alert' : 'a-status');
    var key = assertive ? 'alert' : 'status';
    clearTimeout(timers[key]);
    node.textContent = '';
    /* Пустой такт: одинаковый текст подряд иначе не объявляется. */
    timers[key] = setTimeout(function () { node.textContent = text; }, 80);
  }
  function announceSlow(key, delay, text) {
    clearTimeout(slowTimers[key]);
    slowTimers[key] = setTimeout(function () { announce(text); }, delay);
  }

  /* Фокус из кода должен быть виден и после работы мышью: :focus-visible
     в этом случае не срабатывает. */
  function focusRing(node) {
    if (!node) return;
    node.classList.add('js-ring');
    node.addEventListener('blur', function once() {
      node.classList.remove('js-ring');
      node.removeEventListener('blur', once);
    });
    node.focus();
  }

  /* ---------------------------------------------- разметка ------------- */

  var ICON = {
    up: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
        '<path d="M12 19V6M6 12l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
        '<path d="M12 5v13M6 12l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg>',
    open: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
        '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  function fid(uid, name) { return 'f-' + uid + '-' + name; }

  function valueFor(card, f) {
    var v = card[f.key];
    if (f.type === 'pairs') {
      return (v || []).map(function (p) { return p[0] + ': ' + p[1]; }).join('\n');
    }
    if (f.type === 'lines') return (v || []).join('\n');
    return v == null ? '' : v;
  }

  function fieldHTML(uid, f, card) {
    var id = fid(uid, f.key);
    var val = valueFor(card, f);
    var wide = f.type === 'textarea' || f.type === 'pairs' || f.type === 'lines' || f.type === 'url';
    var multi = f.type === 'textarea' || f.type === 'pairs' || f.type === 'lines';
    var input = multi
      ? '<textarea id="' + id + '" data-field="' + f.key + '" rows="4" aria-describedby="' +
        id + '-hint ' + id + '-err">' + esc(val) + '</textarea>'
      : '<input type="' + (f.type === 'url' ? 'url' : 'text') + '" id="' + id + '" data-field="' + f.key +
        '" autocomplete="off" aria-describedby="' + id + '-hint ' + id + '-err" value="' + esc(val) + '">';
    return '<div class="field' + (wide ? ' wide' : '') + '">' +
             '<label for="' + id + '">' + esc(f.label) + '</label>' + input +
             '<p class="hint" id="' + id + '-hint">' + esc(f.hint || '') + '</p>' +
             '<p class="field__error" id="' + id + '-err"></p>' +
           '</div>';
  }

  function logoHTML(card) {
    var uid = card.uid;
    var mono = !trim(card.logo);
    var tone = card.tone || clone(DEFAULT_TONE);
    var rep = toneReport(tone.bg, tone.ink);
    return '<fieldset class="logo-modes wide">' +
      '<legend>Логотип</legend>' +
      '<div class="radios">' +
        '<label><input type="radio" name="mode-' + uid + '" data-field="mode" value="img"' +
          (mono ? '' : ' checked') + '> Картинка</label>' +
        '<label><input type="radio" name="mode-' + uid + '" data-field="mode" value="mono"' +
          (mono ? ' checked' : '') + '> Плашка с инициалами</label>' +
      '</div>' +
      '<div data-pane="img"' + (mono ? ' hidden' : '') + '>' +
        '<div class="fields">' +
          fieldHTML(uid, { key: 'logo', label: 'Файл логотипа',
            hint: 'Путь внутри сайта. Либо выберите файл — он встроится в файл данных.' }, card) +
        '</div>' +
        '<div class="row-inline" style="margin-top:6px">' +
          '<span class="logo-preview"><img src="' + esc(card.logo || '') + '" alt="" width="52" height="52" data-role="img-preview"></span>' +
          '<label class="abtn" for="' + fid(uid, 'file') + '">Выбрать файл…</label>' +
          '<input class="vh" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" id="' +
            fid(uid, 'file') + '" data-field="file">' +
          '<span class="hint" data-role="file-name"></span>' +
        '</div>' +
      '</div>' +
      '<div data-pane="mono"' + (mono ? '' : ' hidden') + '>' +
        '<div class="row-inline" style="margin-top:6px">' +
          '<span class="tile-preview" data-role="tile" aria-hidden="true" style="--tone:' + esc(tone.bg) +
            ';--tone-ink:' + esc(tone.ink) + '">' + esc(initials(label(card))) + '</span>' +
          '<span class="color-pair"><label for="' + fid(uid, 'toneBg') + '">Плашка</label>' +
            '<input type="color" id="' + fid(uid, 'toneBg') + '" data-field="toneBg" value="' + esc(tone.bg) + '">' +
            '<input type="text" data-field="toneBgHex" aria-label="Цвет плашки кодом" value="' + esc(tone.bg) + '"></span>' +
          '<span class="color-pair"><label for="' + fid(uid, 'toneInk') + '">Буквы</label>' +
            '<input type="color" id="' + fid(uid, 'toneInk') + '" data-field="toneInk" value="' + esc(tone.ink) + '">' +
            '<input type="text" data-field="toneInkHex" aria-label="Цвет букв кодом" value="' + esc(tone.ink) + '"></span>' +
        '</div>' +
        '<p class="contrast" data-role="contrast" data-state="' + rep.state + '" id="' + fid(uid, 'tone') + '-err">' +
          esc(rep.text) + '</p>' +
      '</div>' +
    '</fieldset>';
  }

  function cardHTML(card, i, total) {
    var uid = card.uid;
    var name = label(card) || 'новая карточка';
    var isOpen = !!open[uid];
    var erid = eridOf(card.url);

    var fields = A.card.map(function (f) { return fieldHTML(uid, f, card); }).join('');

    var eridLine = A.requireErid
      ? '<p class="field wide hint" data-role="erid">' +
        (erid ? 'Маркировка на сайте: «Реклама. Идентификатор erid: ' + esc(erid) + '»'
              : 'В ссылке нет erid — карточка на сайт не попадёт.') + '</p>'
      : '';

    return '<li class="card" data-uid="' + esc(uid) + '" data-hidden="' + (card.hidden ? 'true' : 'false') + '">' +
      '<div class="card__row">' +
        '<span class="card__pos">' + (i + 1) + ' / ' + total + '</span>' +
        '<button class="abtn abtn--icon" type="button" data-act="toggle" aria-expanded="' +
          (isOpen ? 'true' : 'false') + '" aria-controls="panel-' + esc(uid) + '">' + ICON.open +
          '<span class="vh">Открыть карточку ' + esc(name) + '</span></button>' +
        '<span class="card__name" data-role="name">' + esc(name) + '</span>' +
        '<span class="card__flag" data-role="flag"' + (card.hidden ? '' : ' hidden') + '>Скрыта с сайта</span>' +
        '<button class="abtn abtn--icon" type="button" data-act="up"' +
          (i === 0 ? ' aria-disabled="true"' : '') + '>' + ICON.up +
          '<span class="vh">Переместить «' + esc(name) + '» выше</span></button>' +
        '<button class="abtn abtn--icon" type="button" data-act="down"' +
          (i === total - 1 ? ' aria-disabled="true"' : '') + '>' + ICON.down +
          '<span class="vh">Переместить «' + esc(name) + '» ниже</span></button>' +
        '<label class="check"><input type="checkbox" data-field="hidden"' + (card.hidden ? ' checked' : '') +
          '> Скрыть<span class="vh"> карточку ' + esc(name) + ' с сайта</span></label>' +
        '<button class="abtn abtn--danger" type="button" data-act="del">Удалить' +
          '<span class="vh"> карточку ' + esc(name) + '</span></button>' +
      '</div>' +
      '<div class="card__panel" id="panel-' + esc(uid) + '"' + (isOpen ? '' : ' hidden') + '>' +
        '<fieldset style="border:0;margin:0;padding:0">' +
          '<legend class="vh">Карточка ' + esc(name) + '</legend>' +
          '<div class="fields">' + fields + eridLine +
            '<div class="field"><label for="' + fid(uid, 'group') + '">Раздел каталога</label>' +
              '<select id="' + fid(uid, 'group') + '" data-field="group" aria-describedby="' +
                fid(uid, 'group') + '-hint ' + fid(uid, 'group') + '-err">' +
                state.GROUPS.map(function (g) {
                  return '<option value="' + esc(g.key) + '"' + (g.key === card.group ? ' selected' : '') +
                         '>' + esc(g.title) + '</option>';
                }).join('') +
              '</select>' +
              '<p class="hint" id="' + fid(uid, 'group') + '-hint">Куда карточка попадёт на сайте.</p>' +
              '<p class="field__error" id="' + fid(uid, 'group') + '-err"></p></div>' +
            (A.logo ? logoHTML(card) : '') +
          '</div>' +
        '</fieldset>' +
      '</div>' +
    '</li>';
  }

  function cardsOf(key) {
    return state.CARDS.filter(function (c) { return c.group === key; });
  }

  function render(focusSel) {
    groupsBox.innerHTML = state.GROUPS.map(function (g, gi) {
      var list = cardsOf(g.key);
      var gid = 'g-' + g.key;
      var meta = (A.groups || []).map(function (f) {
        var id = gid + '-' + f.key;
        var v = g[f.key] == null ? '' : g[f.key];
        var input = f.textarea
          ? '<textarea id="' + id + '" data-group="' + esc(g.key) + '" data-gfield="' + f.key +
            '" aria-describedby="' + id + '-hint ' + id + '-err">' + esc(v) + '</textarea>'
          : '<input type="text" id="' + id + '" data-group="' + esc(g.key) + '" data-gfield="' + f.key +
            '" autocomplete="off" aria-describedby="' + id + '-hint ' + id + '-err" value="' + esc(v) + '">';
        return '<div class="field wide"><label for="' + id + '">' + esc(f.label) + '</label>' + input +
               '<p class="hint" id="' + id + '-hint">' + esc(f.hint || '') + '</p>' +
               '<p class="field__error" id="' + id + '-err"></p></div>';
      }).join('');

      return '<section class="agroup" aria-labelledby="' + gid + '-h">' +
        '<h2 id="' + gid + '-h">' + esc(g.title || 'Раздел ' + (gi + 1)) + '</h2>' +
        (meta ? '<fieldset class="agroup__meta"><legend>Как подписан раздел</legend>' +
                '<div class="fields">' + meta + '</div></fieldset>' : '') +
        (list.length
          ? '<ul class="editor-list" role="list">' +
            list.map(function (c, i) { return cardHTML(c, i, list.length); }).join('') + '</ul>'
          : '<p class="hint">В разделе пока нет карточек.</p>') +
        '<p style="margin-top:14px"><button class="abtn" type="button" data-add="' + esc(g.key) + '">' +
          'Добавить карточку<span class="vh"> в раздел ' + esc(g.title) + '</span></button></p>' +
      '</section>';
    }).join('');

    if (focusSel) focusRing(groupsBox.querySelector(focusSel));
  }

  /* ---------------------------------------------- правка --------------- */

  function cardOf(node) {
    var li = node.closest('[data-uid]');
    if (!li) return null;
    var uid = li.getAttribute('data-uid');
    for (var i = 0; i < state.CARDS.length; i++) {
      if (state.CARDS[i].uid === uid) return { card: state.CARDS[i], li: li, i: i };
    }
    return null;
  }

  function touched() {
    dirty = true;
    stateLine.setAttribute('data-dirty', 'true');
    stateLine.textContent = 'Есть правки, ещё не сохранённые на сайте';
    clearTimeout(timers.autosave);
    timers.autosave = setTimeout(function () { saveDraft(true); }, 700);
  }

  function fieldByKey(key) {
    for (var i = 0; i < A.card.length; i++) if (A.card[i].key === key) return A.card[i];
    return null;
  }

  groupsBox.addEventListener('input', function (e) {
    var t = e.target;
    var gkey = t.getAttribute('data-group');
    if (gkey) {
      var g = state.GROUPS.filter(function (x) { return x.key === gkey; })[0];
      if (g) {
        g[t.getAttribute('data-gfield')] = t.value;
        if (t.getAttribute('data-gfield') === 'title') {
          var h = document.getElementById('g-' + gkey + '-h');
          if (h) h.textContent = t.value || 'Раздел';
        }
      }
      touched();
      return;
    }

    var key = t.getAttribute('data-field');
    if (!key) return;
    var ref = cardOf(t);
    if (!ref) return;
    var card = ref.card;
    var f = fieldByKey(key);

    if (f && f.type === 'pairs') {
      card[key] = t.value.split('\n').map(function (line) {
        var at = line.indexOf(':');
        if (at === -1) return null;
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }).filter(function (p) { return p && p[0] && p[1]; });
    } else if (f && f.type === 'lines') {
      card[key] = t.value.split('\n').map(trim).filter(Boolean);
    } else if (key === 'toneBg' || key === 'toneInk' || key === 'toneBgHex' || key === 'toneInkHex') {
      syncTone(ref, key, t.value);
    } else if (key !== 'file' && key !== 'mode') {
      card[key] = t.value;
    }

    if (NAME_KEYS.indexOf(key) !== -1) {
      var nameBox = ref.li.querySelector('[data-role="name"]');
      if (nameBox) nameBox.textContent = label(card) || 'Новая карточка';
      var tile = ref.li.querySelector('[data-role="tile"]');
      if (tile) tile.textContent = initials(label(card));
    }

    if (key === 'url' && A.requireErid) {
      var erid = eridOf(card.url);
      var box = ref.li.querySelector('[data-role="erid"]');
      if (box) {
        box.textContent = erid
          ? 'Маркировка на сайте: «Реклама. Идентификатор erid: ' + erid + '»'
          : 'В ссылке нет erid — карточка на сайт не попадёт.';
      }
    }

    if (key === 'logo') {
      var img = ref.li.querySelector('[data-role="img-preview"]');
      if (img && trim(t.value)) img.src = t.value;
    }

    touched();
  });

  function syncTone(ref, key, value) {
    var card = ref.card;
    card.tone = card.tone || clone(DEFAULT_TONE);
    var isBg = key === 'toneBg' || key === 'toneBgHex';
    card.tone[isBg ? 'bg' : 'ink'] = value;

    var pair = ref.li.querySelector('[data-field="' + (isBg ? 'toneBg' : 'toneInk') + '"]');
    var hex = ref.li.querySelector('[data-field="' + (isBg ? 'toneBgHex' : 'toneInkHex') + '"]');
    if (isHex(value)) {
      if (pair && pair.value.toLowerCase() !== value.toLowerCase()) pair.value = value;
      if (hex && hex.value.toLowerCase() !== value.toLowerCase()) hex.value = value;
    }
    var tile = ref.li.querySelector('[data-role="tile"]');
    if (tile) {
      tile.style.setProperty('--tone', card.tone.bg);
      tile.style.setProperty('--tone-ink', card.tone.ink);
    }
    var out = ref.li.querySelector('[data-role="contrast"]');
    if (out) {
      var rep = toneReport(card.tone.bg, card.tone.ink);
      out.setAttribute('data-state', rep.state);
      out.textContent = rep.text;
    }
  }

  groupsBox.addEventListener('change', function (e) {
    var t = e.target;
    var key = t.getAttribute('data-field');
    if (!key) return;
    var ref = cardOf(t);
    if (!ref) return;
    var card = ref.card;

    if (key === 'hidden') {
      card.hidden = t.checked;
      ref.li.setAttribute('data-hidden', card.hidden ? 'true' : 'false');
      var flag = ref.li.querySelector('[data-role="flag"]');
      if (flag) flag.hidden = !card.hidden;
      var shown = cardsOf(card.group).filter(function (c) { return !c.hidden; }).length;
      announceSlow('hide', 500, (card.hidden ? 'Скрыто. ' : 'Показано. ') +
        'В разделе видно ' + plural(shown, 'карточку', 'карточки', 'карточек') + '.');
      touched();
      return;
    }

    if (key === 'group') {
      card.group = t.value;
      var g = state.GROUPS.filter(function (x) { return x.key === t.value; })[0];
      open[card.uid] = true;
      render('[data-uid="' + card.uid + '"] [data-act="toggle"]');
      announce('Карточка перенесена в раздел «' + (g ? g.title : t.value) + '».');
      touched();
      return;
    }

    if (key === 'mode') {
      var mono = t.value === 'mono';
      ref.li.querySelector('[data-pane="img"]').hidden = mono;
      ref.li.querySelector('[data-pane="mono"]').hidden = !mono;
      if (mono) { card.logo = ''; card.logoName = ''; card.tone = card.tone || clone(DEFAULT_TONE); }
      else if (!trim(card.logo)) card.tone = null;
      /* Фокус не двигаем: переключатель не должен уводить в другое место. */
      announce(mono ? 'Логотип: плашка с инициалами.' : 'Логотип: картинка.');
      touched();
      return;
    }

    if (key === 'file') {
      var file = t.files && t.files[0];
      if (!file) return;
      var out = ref.li.querySelector('[data-role="file-name"]');
      if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type) || file.size > MAX_LOGO) {
        t.value = '';
        if (out) out.textContent = 'Файл не подошёл: ' + file.name;
        announce('Файл не подходит: нужен PNG, JPG, WEBP или SVG размером до 200 КБ.');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        card.logo = String(reader.result);
        card.logoName = file.name;
        card.tone = null;
        var img = ref.li.querySelector('[data-role="img-preview"]');
        if (img) img.src = card.logo;
        if (out) out.textContent = 'Файл встроен в файл данных: ' + file.name;
        /* В текстовое поле путь не пишем: тысячи символов base64 зачитываются
           вслух и правятся по одному символу. */
        var path = ref.li.querySelector('[data-field="logo"]');
        if (path) path.value = '';
        announce('Логотип обновлён: ' + file.name + '.');
        touched();
      };
      reader.readAsDataURL(file);
    }
  });

  /* ---------------------------------------------- кнопки карточек ------ */

  groupsBox.addEventListener('click', function (e) {
    var add = e.target.closest('[data-add]');
    if (add) return addCard(add.getAttribute('data-add'));

    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var ref = cardOf(btn);
    if (!ref) return;
    var act = btn.getAttribute('data-act');

    if (act === 'toggle') {
      var panel = document.getElementById('panel-' + ref.card.uid);
      var isOpen = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      panel.hidden = isOpen;
      open[ref.card.uid] = !isOpen;
      return;
    }
    if (act === 'up' || act === 'down') return move(ref, act);
    if (act === 'del') return askDelete(ref);
  });

  /* Меняем местами элементы на их настоящих местах в общем массиве —
     порядок соседнего раздела при этом не трогается. */
  function move(ref, dir) {
    var list = cardsOf(ref.card.group);
    var pos = list.indexOf(ref.card);
    var name = label(ref.card);

    if (dir === 'up' && pos === 0) { announceSlow('move', 400, '«' + name + '» уже первая в разделе.'); return; }
    if (dir === 'down' && pos === list.length - 1) { announceSlow('move', 400, '«' + name + '» уже последняя в разделе.'); return; }

    var other = list[dir === 'up' ? pos - 1 : pos + 1];
    var a = state.CARDS.indexOf(ref.card), b = state.CARDS.indexOf(other);
    state.CARDS[a] = other;
    state.CARDS[b] = ref.card;

    var newPos = dir === 'up' ? pos : pos + 2;
    render('[data-uid="' + ref.card.uid + '"] [data-act="' + dir + '"]');
    announceSlow('move', 400, '«' + name + '»: позиция ' + newPos + ' из ' + list.length + '.');
    touched();
  }

  function addCard(groupKey) {
    var card = { uid: uidNew(), group: groupKey, hidden: false };
    A.card.forEach(function (f) {
      card[f.key] = f.type === 'pairs' || f.type === 'lines' ? [] : (f.key === 'url' ? 'https://' : '');
    });
    if (A.logo) card.tone = clone(DEFAULT_TONE);

    var list = cardsOf(groupKey);
    var at = list.length ? state.CARDS.indexOf(list[list.length - 1]) + 1 : state.CARDS.length;
    state.CARDS.splice(at, 0, card);
    open[card.uid] = true;
    render('[data-uid="' + card.uid + '"] [data-field="' + A.card[0].key + '"]');
    announce('Карточка добавлена. В разделе ' + plural(list.length + 1, 'карточка', 'карточки', 'карточек') + '.');
    touched();
  }

  /* ---------------------------------------------- диалог --------------- */

  var pending = null;

  function openAsk(title, text, yesLabel, onYes) {
    if (ask.open) return;
    pending = onYes;
    document.getElementById('ask-title').textContent = title;
    document.getElementById('ask-text').textContent = text;
    document.getElementById('ask-yes').textContent = yesLabel;
    ask.showModal();
    document.getElementById('ask-no').focus({ preventScroll: true });
  }

  document.getElementById('ask-no').addEventListener('click', function () {
    pending = null;
    ask.close();
  });

  /* Работу делаем здесь, а не в обработчике close: событие close приходит
     не во всех окружениях, и действие тогда молча не случается. */
  document.getElementById('ask-yes').addEventListener('click', function () {
    var fn = pending;
    pending = null;
    ask.close();
    if (fn) fn();
  });

  ask.addEventListener('cancel', function () { pending = null; });

  function askDelete(ref) {
    var name = label(ref.card) || 'без названия';
    openAsk('Удалить карточку «' + name + '»?',
            'Карточка исчезнет из каталога. Вернуть её можно будет только сбросом черновика.',
            'Удалить', function () { doDelete(ref.card.uid); });
  }

  function doDelete(uid) {
    var idx = -1;
    for (var i = 0; i < state.CARDS.length; i++) if (state.CARDS[i].uid === uid) idx = i;
    if (idx === -1) return;

    var card = state.CARDS[idx];
    var name = label(card) || 'без названия';
    var group = card.group;
    var list = cardsOf(group);
    var pos = list.indexOf(card);
    var neighbour = list[pos + 1] || list[pos - 1];

    state.CARDS.splice(idx, 1);
    delete open[uid];
    render();

    /* Фокус обязан приземлиться на что-то осмысленное. */
    focusRing(neighbour
      ? groupsBox.querySelector('[data-uid="' + neighbour.uid + '"] [data-act="del"]')
      : groupsBox.querySelector('[data-add="' + group + '"]'));

    var left = cardsOf(group).length;
    setTimeout(function () {
      announce('Удалено: ' + name + '. В разделе осталось ' +
        plural(left, 'карточка', 'карточки', 'карточек') + '.');
    }, 150);
    touched();
  }

  /* ---------------------------------------------- проверка ------------- */

  function setError(id, message, problems, who) {
    var input = document.getElementById(id);
    var box = document.getElementById(id + '-err');
    /* aria-describedby задан в разметке и не трогается: иначе подсказка
       под полем пропадёт вместе с ошибкой. */
    if (input) input.setAttribute('aria-invalid', 'true');
    if (box) box.textContent = 'Ошибка: ' + message;
    problems.push({ id: id, text: who + ': ' + message });
  }

  function validate() {
    var problems = [];
    Array.prototype.forEach.call(document.querySelectorAll('[aria-invalid]'), function (n) {
      n.removeAttribute('aria-invalid');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.field__error'), function (n) {
      n.textContent = '';
    });

    (A.groups || []).forEach(function (f) {
      if (!f.required) return;
      state.GROUPS.forEach(function (g) {
        if (!trim(g[f.key])) setError('g-' + g.key + '-' + f.key, 'заполните поле.', problems, 'Раздел');
      });
    });

    /* Проверяем ВСЕ карточки, включая скрытые: скрытая — это одна галочка
       до публикации, и ошибка всплыла бы в самый неудобный момент. */
    state.CARDS.forEach(function (card) {
      var inGroup = cardsOf(card.group);
      var g = state.GROUPS.filter(function (x) { return x.key === card.group; })[0];
      var who = (g ? '«' + trim(g.title) + '», ' : '') + 'карточка ' + (inGroup.indexOf(card) + 1) +
                (label(card) ? ' (' + label(card) + ')' : '');

      A.card.forEach(function (f) {
        if (f.required && !trim(card[f.key])) {
          setError(fid(card.uid, f.key), 'заполните «' + f.label.toLowerCase() + '».', problems, who);
        }
        if (f.type === 'url' && trim(card[f.key])) {
          var bad = '';
          try {
            var u = new URL(trim(card[f.key]));
            if (u.protocol !== 'https:') bad = 'ссылка должна начинаться с https://.';
            else if (A.requireErid && !eridOf(card[f.key])) {
              bad = 'в ссылке нет erid — без маркировки карточку показывать нельзя.';
            }
          } catch (e) { bad = 'ссылка введена не полностью — нужен адрес целиком, с https://.'; }
          if (bad) setError(fid(card.uid, f.key), bad, problems, who);
        }
      });

      if (A.logo && !trim(card.logo)) {
        var rep = toneReport((card.tone || {}).bg, (card.tone || {}).ink);
        if (!rep.ok) setError(fid(card.uid, 'tone'), rep.text, problems, who);
      }
    });

    /* Список чистим вместе со скрытием: иначе при следующем показе
       на мгновение видны прошлые, уже исправленные ошибки. */
    if (!problems.length) { summary.hidden = true; summaryList.textContent = ''; return true; }

    /* Список пересобираем целиком и меняем заголовок: иначе вторая такая же
       проверка с теми же ошибками не прозвучит. */
    summaryTitle.textContent = 'Проверка не пройдена. ' +
      plural(problems.length, 'ошибка', 'ошибки', 'ошибок') + '.';
    summaryList.innerHTML = problems.map(function (p) {
      return '<li><a href="#' + esc(p.id) + '">' + esc(p.text) + '</a></li>';
    }).join('');
    summary.hidden = false;
    summary.blur();
    focusRing(summary);
    return false;
  }

  summaryList.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    var node = document.getElementById(a.getAttribute('href').slice(1));
    if (!node) return;
    var li = node.closest('[data-uid]');
    if (li) {
      var panel = li.querySelector('.card__panel');
      var toggle = li.querySelector('[data-act="toggle"]');
      if (panel && panel.hidden) {
        panel.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        open[li.getAttribute('data-uid')] = true;
      }
    }
    focusRing(node);
  });

  /* ---------------------------------------------- черновик и файл ------ */

  function saveDraft(silent) {
    try {
      localStorage.setItem(A.draftKey, JSON.stringify(state));
      var t = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      stateLine.removeAttribute('data-dirty');
      stateLine.textContent = dirty ? 'Сохранено в браузере в ' + t + ', на сайт ещё не выгружено'
                                    : 'Сохранено в браузере в ' + t;
      if (!silent) announce('Черновик сохранён в браузере.');
      return true;
    } catch (e) {
      stateLine.setAttribute('data-dirty', 'true');
      stateLine.textContent = 'Черновик не сохранён: в браузере кончилось место';
      announce('Черновик не сохранён: в браузере кончилось место. Скачайте резервную копию прямо сейчас.', true);
      return false;
    }
  }

  function buildFile() { return A.build(state); }

  function download() {
    if (!validate()) return;
    saveDraft(true);
    var blob = new Blob([buildFile()], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = A.dataFile || 'data.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    announce('Резервная копия скачана.');
  }

  function preview() {
    if (!saveDraft(true)) return;
    /* Сайт не умеет собирать каталог из черновика — он читает готовый файл.
       Поэтому кладём рядом с черновиком собранный текст файла: страница с
       ?draft=1 подхватит его вместо боевого каталога и покажет правки. */
    try { localStorage.setItem(A.draftKey + ':file', buildFile()); } catch (e) { /* нет места */ }
    window.open(A.preview || 'index.html?draft=1', '_blank', 'noopener');
    announce('Предпросмотр открыт в новой вкладке.');
  }

  ['download', 'download-2'].forEach(function (id) {
    var b = document.getElementById(id);
    if (b) b.addEventListener('click', download);
  });
  ['preview', 'preview-2'].forEach(function (id) {
    var b = document.getElementById(id);
    if (b) b.addEventListener('click', preview);
  });
  document.getElementById('check').addEventListener('click', function () {
    if (validate()) announce('Ошибок нет, можно сохранять на сайт.');
  });
  document.getElementById('reset').addEventListener('click', function () {
    openAsk('Сбросить черновик?',
            'Все правки в этом браузере пропадут, редактор вернётся к тому, что сейчас на сайте.',
            'Сбросить', function () {
              localStorage.removeItem(A.draftKey);
              state = fileState();
              open = {};
              dirty = false;
              summary.hidden = true;
              fillSite();
              render();
              stateLine.removeAttribute('data-dirty');
              stateLine.textContent = 'Черновик сброшен';
              announce('Черновик сброшен. Показано то, что лежит на сайте.');
            });
  });

  /* ---------------------------------------------- тексты сайта --------- */

  function fillSite() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-site-field]'), function (input) {
      input.value = state.SITE[input.getAttribute('data-site-field')] || '';
    });
  }

  var siteBox = document.getElementById('site-fields');
  if (siteBox) {
    siteBox.innerHTML = (A.site || []).map(function (f) {
      var id = 'site-' + f.key;
      var input = f.textarea
        ? '<textarea id="' + id + '" data-site-field="' + f.key + '" aria-describedby="' + id + '-hint"></textarea>'
        : '<input type="text" id="' + id + '" data-site-field="' + f.key + '" autocomplete="off" aria-describedby="' + id + '-hint">';
      return '<div class="field' + (f.textarea ? ' wide' : '') + '"><label for="' + id + '">' + esc(f.label) +
             '</label>' + input + '<p class="hint" id="' + id + '-hint">' + esc(f.hint || '') + '</p></div>';
    }).join('');
  }

  document.getElementById('form').addEventListener('input', function (e) {
    var key = e.target.getAttribute('data-site-field');
    if (!key) return;
    state.SITE[key] = e.target.value;
    touched();
  });

  window.addEventListener('beforeunload', function (e) {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
  window.addEventListener('pagehide', function () { saveDraft(true); });

  /* ---------------------------------------------- наружу --------------- */

  /* Модуль публикации (publish.js) берёт отсюда файл и проверку. */
  window.PUBLISH = {
    build: buildFile,
    validate: validate,
    /* Слепок берём с данных, а не с собранного файла: в его шапке стоит время
       сборки, и хеш файла менялся бы при каждом вызове — строка состояния
       вечно показывала бы «есть несохранённые правки». */
    stateHash: function () {
      return JSON.stringify({ S: state.SITE, G: state.GROUPS, C: state.CARDS });
    },
    confirmText: 'Каталог на сайте будет заменён этой версией.'
  };

  /* ---------------------------------------------- старт ---------------- */

  fillSite();
  render();
  stateLine.textContent = fromDraft ? 'Открыт черновик из этого браузера'
                                    : 'Показано то, что лежит на сайте';
})();
