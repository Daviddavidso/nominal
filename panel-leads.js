/* ==========================================================================
   ЗАЯВКИ, ТЕЛЕГРАМ-БОТ И ПАРОЛЬ — модуль панели «НОМИНАЛ».

   Подключается после panel-core.js и publish.js и ходит в api.php той же
   сессией, что и публикация. Стартует по событию panel:unlocked от экрана
   входа (gate.js): раньше редактора для человека не существует.

   Озвучка: у панели один диктор — window.PANEL.announce из ядра. Строки
   состояния разделов видимые, но не живые: каждое действие даёт ровно одно
   сообщение, а не два (из строки и из общей области).
   ========================================================================== */

(function () {
  'use strict';

  var API = 'api.php';

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  if (!$('#leads') || !$('#pass')) return;

  /* ---------------------------------------------- помощники ------------ */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    var w = (a > 10 && a < 20) ? many : (b > 1 && b < 5) ? few : (b === 1) ? one : many;
    return n + ' ' + w;
  }

  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }

  var P = function () { return window.PANEL || {}; };

  function announce(text) {
    if (typeof P().announce === 'function') P().announce(text);
  }
  function announceSlow(key, delay, text) {
    if (typeof P().announceSlow === 'function') P().announceSlow(key, delay, text);
  }
  function focusRing(node) {
    if (!node) return;
    if (typeof P().focusRing === 'function') P().focusRing(node); else node.focus();
  }
  function refocus(sel) {
    var n = $(sel);
    if (n && n.isConnected) focusRing(n);
  }

  /* Видимая строка состояния раздела плюс одно объявление. silent — когда
     сообщение уже несёт сам фокус (поле с ошибкой, сводка). */
  function statusSetter(sel) {
    return function (msg, tone, silent) {
      var s = $(sel);
      if (!s) return;
      s.textContent = msg || '';
      s.setAttribute('data-tone', tone || '');
      if (msg && !silent) announce(msg);
    };
  }
  var leadsStatus = statusSetter('#leads-status');
  var tgStatus    = statusSetter('#tg-status');
  var passStatus  = statusSetter('#pass-status');

  /* Ошибка поля: текст в описании поля (aria-describedby), сам абзац
     скрывается через :empty. */
  function fieldErr(sel, msg) {
    var i = $(sel), b = $(sel + '-err');
    if (!i || !b) return;
    if (msg) { i.setAttribute('aria-invalid', 'true'); b.textContent = 'Ошибка: ' + msg; }
    else { i.removeAttribute('aria-invalid'); b.textContent = ''; }
  }

  /* aria-disabled, а не disabled: у выключенной кнопки пропадает фокус.
     Подпись кнопки не меняем — это её имя для голосового управления. */
  function setBusy(btn, on) {
    if (!btn) return;
    if (on) btn.setAttribute('aria-disabled', 'true'); else btn.removeAttribute('aria-disabled');
  }
  function isBusy(btn) { return btn.getAttribute('aria-disabled') === 'true'; }

  function api(action, payload, ms) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms || 20000);
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action }, payload || {})),
      credentials: 'same-origin',
      signal: ctrl.signal
    }).then(function (res) {
      /* Успех — только настоящий JSON с ok:true. Иначе заглушка хостинга
         («200 и html») прочиталась бы как ответ. */
      var isJson = (res.headers.get('content-type') || '').indexOf('application/json') !== -1;
      if (!isJson) return { status: res.status, ok: false, data: {}, notApi: true };
      return res.json().catch(function () { return {}; }).then(function (d) {
        return { status: res.status, ok: res.ok && !!d.ok, data: d };
      });
    }).finally(function () { clearTimeout(timer); });
  }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* Сессия истекла: экран входа возвращает gate.js, причина ложится в ошибку
     поля пароля. Черновик каталога и открытые карточки остаются на месте. */
  function sessionLost(res) {
    if (!res || res.status !== 401) return false;
    if (typeof P().lock === 'function') P().lock('сессия истекла — войдите заново, всё на месте.');
    else location.reload();
    return true;
  }

  /* Подтверждение — общий диалог оболочки (#ask): те же кнопки, тот же
     фокус, что и у удаления карточки. Своё подтверждение помечаем атрибутом,
     чтобы не спутать с чужим запуском. */
  var askPending = null;
  var ask = $('#ask');
  function confirmAsk(title, text, yesLabel, fn) {
    if (!ask || ask.open) return;
    askPending = fn;
    $('#ask-title').textContent = title;
    $('#ask-text').textContent = text;
    var y = $('#ask-yes');
    y.textContent = yesLabel;
    y.setAttribute('data-leads-run', '1');
    ask.showModal();
    $('#ask-no').focus({ preventScroll: true });
  }
  if (ask) {
    var disarm = function () {
      var y = $('#ask-yes');
      if (y) y.removeAttribute('data-leads-run');
      askPending = null;
    };
    $('#ask-yes').addEventListener('click', function () {
      if (this.getAttribute('data-leads-run') !== '1') return;
      this.removeAttribute('data-leads-run');
      var fn = askPending;
      askPending = null;
      if (fn) fn();
    });
    $('#ask-no').addEventListener('click', disarm);
    ask.addEventListener('cancel', disarm);
    ask.addEventListener('close', disarm);
  }

  /* В csv лежит серверное время «2026-09-03 14:22:05» (старые строки —
     «03.09.2026 14:22»). В datetime отдаём без зоны: часового пояса
     сервера мы не знаем. */
  function leadTime(raw) {
    var s = String(raw || '');
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (m) return { text: m[3] + '.' + m[2] + '.' + m[1] + ', ' + m[4] + ':' + m[5],
                    attr: m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] };
    m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})[ ,]+(\d{2}):(\d{2})/);
    if (m) return { text: m[1] + '.' + m[2] + '.' + m[3] + ', ' + m[4] + ':' + m[5],
                    attr: m[3] + '-' + m[2] + '-' + m[1] + 'T' + m[4] + ':' + m[5] };
    return { text: s, attr: '' };
  }

  /* ---------------------------------------------- заявки --------------- */

  var SEEN_KEY  = 'nominal:leads-seen';
  var LEADS     = [];      // последняя удачная выдача сервера
  var LEADS_ALL = 0;       // сколько всего в файле: список сверху обрезан
  var leadsReq  = 0;       // поколение запроса: медленный ответ не затирает свежий

  /* Ключ строки — по содержимому: сервер идентификаторов не отдаёт, а по
     номеру строки возвращать фокус нельзя — новые встают сверху. */
  function leadKey(l) { return l.date + '|' + l.phone + '|' + l.name; }

  function seenKey() { try { return localStorage.getItem(SEEN_KEY) || ''; } catch (e) { return ''; } }
  function markSeen() {
    if (!LEADS.length) return;
    try { localStorage.setItem(SEEN_KEY, leadKey(LEADS[0])); } catch (e) { /* приватный режим */ }
  }
  function newCount() {
    var mark = seenKey();
    if (!mark) return 0;                       // первый заход: «новых» не с чем сравнить
    for (var i = 0; i < LEADS.length; i++) if (leadKey(LEADS[i]) === mark) return i;
    return 0;                                  // отметку не нашли — молчим, а не пугаем числом
  }

  /* Ссылку строим только по белому списку: подставлять href из присланного
     текста нельзя. */
  function phoneHref(v) {
    var s = String(v || '').trim();
    return /^\+?\d[\d\s\-()]{8,19}$/.test(s) ? 'tel:' + s.replace(/[^\d+]/g, '') : '';
  }
  function phoneText(v) {
    var m = String(v || '').trim().match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
    return m ? '+7 ' + m[1] + ' ' + m[2] + '-' + m[3] + '-' + m[4] : String(v || '');
  }

  function dashCell(td, vh) {
    var d = el('span', 'cell-dash', '—');
    d.setAttribute('aria-hidden', 'true');
    td.appendChild(d);
    td.appendChild(el('span', 'vh', vh));
  }

  /* Обёртка таблицы — таб-стоп только когда её и правда надо прокручивать:
     иначе это мёртвая остановка на пути Tab. */
  function syncScroll() {
    var w = $('#leads-wrap');
    if (!w || w.hidden) return;
    if (w.scrollWidth > w.clientWidth + 1) w.setAttribute('tabindex', '0');
    else if (!w.contains(document.activeElement) && w !== document.activeElement) w.removeAttribute('tabindex');
  }
  window.addEventListener('resize', syncScroll);

  function renderLeads() {
    var wrap = $('#leads-wrap'), body = $('#leads-rows'), empty = $('#leads-empty');
    if (!wrap || !body) return;

    /* Куда вернуть фокус, если он стоял в таблице: запоминаем строку по
       содержимому до того, как стереть tbody. */
    var keep = null, inside = body.contains(document.activeElement);
    if (inside) {
      var tr = document.activeElement.closest('tr');
      if (tr) keep = tr.getAttribute('data-key');
    }

    body.textContent = '';
    var fresh = newCount();
    var frag = document.createDocumentFragment();

    LEADS.forEach(function (l, i) {
      var row = el('tr');
      row.setAttribute('data-key', leadKey(l));

      var th = el('th');
      th.setAttribute('scope', 'row');
      th.appendChild(document.createTextNode(l.name || 'Без имени'));
      if (i < fresh) th.appendChild(el('span', 'lead-new', 'новая'));
      row.appendChild(th);

      var when = leadTime(l.date);
      var tdW = el('td', 'cell-when');
      if (when.attr) {
        var t = el('time', null, when.text);
        t.setAttribute('datetime', when.attr);
        tdW.appendChild(t);
      } else tdW.textContent = when.text;
      row.appendChild(tdW);

      var tdP = el('td'), href = phoneHref(l.phone);
      if (href) {
        var a = el('a', null, phoneText(l.phone));
        a.href = href;
        tdP.appendChild(a);
      } else if (l.phone) tdP.textContent = l.phone;
      else dashCell(tdP, 'телефон не указан');
      row.appendChild(tdP);

      var tdS = el('td');
      if (l.product) tdS.textContent = l.product; else dashCell(tdS, 'продукт не указан');
      row.appendChild(tdS);

      frag.appendChild(row);
    });
    body.appendChild(frag);

    /* Счёт живёт в подписи таблицы — она читается при входе в таблицу. */
    var cap = $('#leads-cap');
    if (cap) {
      if (!LEADS_ALL) cap.textContent = 'Заявок пока нет';
      else {
        var txt = 'Всего ' + plural(LEADS_ALL, 'заявка', 'заявки', 'заявок');
        if (fresh) txt += ' · новых: ' + fresh;
        txt += (LEADS.length < LEADS_ALL) ? ' · показаны последние ' + LEADS.length + ', свежие сверху' : ' · свежие сверху';
        cap.textContent = txt;
      }
    }

    /* Прятать обёртку, пока внутри фокус, нельзя: [hidden] это display:none,
       фокус молча улетит в body. */
    var hide = LEADS.length === 0;
    if (hide && (wrap.contains(document.activeElement) || wrap === document.activeElement)) refocus('#leads-refresh');
    wrap.hidden = hide;
    if (empty) empty.hidden = !hide;
    syncScroll();

    if (keep) {
      var again = body.querySelector('tr[data-key="' + cssEsc(keep) + '"]');
      var land = again ? again.querySelector('a') : null;
      if (land) focusRing(land);
      else if (inside) refocus('#leads-refresh');
    }
  }

  /* Список не загрузился — подпись таблицы обязана это сказать: пустая
     таблица с подписью «заявок нет» врёт. */
  function leadsBroke(msg) {
    if (!LEADS.length) {
      var cap = $('#leads-cap');
      if (cap) cap.textContent = 'Список не загрузился';
    }
    leadsStatus(msg, 'bad');
  }

  function loadLeads(opts) {
    var loud = opts && opts.loud;
    var retried = opts && opts.retried;
    var wrap = $('#leads-wrap');
    var mine = ++leadsReq;

    /* Первый запрос со свежей страницы иногда съедает антибот хостинга —
       молча повторяем, иначе клиент видит «заявок нет» там, где они есть. */
    function fail(msg) {
      if (!loud && !retried) { setTimeout(function () { loadLeads({ retried: true }); }, 1500); return; }
      leadsBroke(msg);
    }

    if (wrap) wrap.setAttribute('aria-busy', 'true');
    if (loud) {
      leadsStatus('Обновляю список…', '', true);
      announceSlow('leads', 1000, 'Обновляю список…');
    }
    function done() { if (wrap) wrap.setAttribute('aria-busy', 'false'); }

    return api('leads').then(function (res) {
      if (mine !== leadsReq) return;
      done();
      if (sessionLost(res)) return;
      if (!res.ok || !Array.isArray(res.data.leads)) { fail('Не удалось загрузить заявки. Нажмите «Обновить» ещё раз.'); return; }
      LEADS = res.data.leads;
      LEADS_ALL = typeof res.data.total === 'number' ? res.data.total : LEADS.length;
      var fresh = newCount();
      renderLeads();
      if (loud) {
        if (!LEADS_ALL) leadsStatus('Заявок пока нет.', 'info');
        else leadsStatus('Список обновлён: ' + plural(LEADS_ALL, 'заявка', 'заявки', 'заявок') +
                         (fresh ? ', новых ' + fresh + '.' : '.'), 'ok');
      }
      markSeen();
    }).catch(function () {
      if (mine !== leadsReq) return;
      done();
      fail(LEADS.length ? 'Сервер не ответил. Список ниже — с прошлого обновления.'
                        : 'Сервер не ответил, заявки не загрузились. Нажмите «Обновить».');
    });
  }

  $('#leads-refresh').addEventListener('click', function () {
    var btn = this;
    if (isBusy(btn)) return;
    setBusy(btn, true);
    loadLeads({ loud: true }).then(function () { setBusy(btn, false); });
  });

  /* Файл заявок лежит выше корня сайта — ссылки на него нет. CSV собираем
     в браузере из того, что уже загружено. */
  $('#leads-csv').addEventListener('click', function () {
    if (!LEADS.length) { leadsStatus('Скачивать нечего — заявок пока нет.', 'info'); return; }
    var esc = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var rows = [['Дата', 'Имя', 'Телефон', 'Продукт']];
    LEADS.forEach(function (l) { rows.push([l.date, l.name, l.phone, l.product]); });
    var csv = rows.map(function (r) { return r.map(esc).join(';'); }).join('\r\n') + '\r\n';
    download('zayavki.csv', '﻿' + csv, 'text/csv;charset=utf-8');   // BOM — иначе Excel ломает кириллицу
    leadsStatus('Файл zayavki.csv сохранён: ' + plural(LEADS.length, 'заявка', 'заявки', 'заявок') + '.', 'ok');
  });

  /* ---------------------------------------------- телеграм ------------- */

  var TG_SEEN_KEY = 'nominal:tg-warn-seen';
  var TG_BOT = null;        // ник бота — из него собираем ссылку-приглашение
  var tgSigLast = '';       // отпечаток состояния: без изменений DOM не трогаем
  var tgBusy = false;       // идёт правка — опрос не имеет права перерисовывать
  var tgSaidAt = 0;         // когда последний раз говорил человек, а не опрос
  var tgPollTimer = null, tgPollUntil = 0, tgExpTimer = null;
  var tgDeniedSeen = 0;

  /* Ошибка у поля — фокус в поле, он и прочитает описание. Если фокус уже
     там (форму отправили Enter'ом), подменённое описание не прозвучит —
     тогда говорим отдельно. */
  function tgFieldErr(sel, msg) {
    fieldErr(sel, msg);
    var i = $(sel);
    if (!i) return;
    if (document.activeElement === i) announce('Ошибка: ' + msg);
    else focusRing(i);
  }

  /* Сообщение от опроса не имеет права затирать то, что человек вызвал сам. */
  function tgSay(msg, tone, fromPoll) {
    if (fromPoll && Date.now() - tgSaidAt < 4000) return;
    if (!fromPoll) tgSaidAt = Date.now();
    tgStatus(msg, tone);
  }

  function tgSig(bot, chats, denied) {
    return (bot || '') + '|' +
      (chats || []).map(function (c) { return c.id + ':' + (c.title || ''); }).sort().join(',') + '|' +
      (denied || []).map(function (d) { return (d.at || '') + ':' + (d.title || ''); }).join(',');
  }

  function tgWarnSeen() { try { return localStorage.getItem(TG_SEEN_KEY) || ''; } catch (e) { return ''; } }

  function renderTgWarn(denied) {
    var box = $('#tg-warn'), list = $('#tg-warn-list');
    if (!box || !list) return;
    denied = denied || [];

    /* Показываем, только если есть попытка новее той, что уже закрыли. */
    var newest = '';
    denied.forEach(function (d) { if ((d.at || '') > newest) newest = d.at || ''; });
    tgDeniedSeen = denied.length;
    if (!denied.length || (newest && newest <= tgWarnSeen())) {
      if (box.contains(document.activeElement)) refocus('#tg-h');
      box.hidden = true;
      return;
    }

    list.textContent = '';
    denied.slice().sort(function (x, y) { return (y.at || '') < (x.at || '') ? -1 : ((y.at || '') > (x.at || '') ? 1 : 0); })
      .forEach(function (d) {
        var li = el('li');
        /* Сырое время сервера: сравнивать с отметкой «прочитано» надо ровно
           то же значение, что записали. */
        li.setAttribute('data-at', d.at || '');
        li.appendChild(el('span', 'recips__name', d.title || 'без имени'));
        var when = leadTime(d.at);
        if (when.text) {
          li.appendChild(el('span', 'vh', ' пытался подключиться '));
          var t = el(when.attr ? 'time' : 'span', 'recips__when', when.text);
          if (when.attr) t.setAttribute('datetime', when.attr);
          li.appendChild(t);
        }
        if (d.n > 1) li.appendChild(el('span', 'recips__when', ' · попыток: ' + d.n));
        list.appendChild(li);
      });
    box.hidden = false;
  }

  function renderTgState(bot, chats) {
    var box = $('#tg-state'), off = $('#tg-off'), pair = $('#tg-pair-wrap');
    if (!box) return;

    /* Всё ниже либо стирает содержимое, либо прячет кнопки. Фокус, стоящий
       внутри, уводим заранее: с [hidden] он молча падает в body. Если он
       стоял на кнопке «Убрать» и такая же кнопка переживёт перерисовку —
       вернём его на неё. */
    var a = document.activeElement;
    var keepId = null;
    if (a && box.contains(a)) {
      var rmBtn = a.closest('.recips__rm');
      if (rmBtn) keepId = rmBtn.getAttribute('data-id');
    }
    var doomed = (a && box.contains(a)) || (a && !bot && ((off && off === a) || (pair && pair.contains(a))));

    box.textContent = '';
    chats = chats || [];
    TG_BOT = bot || null;

    box.appendChild(el('h4', null, 'Состояние'));

    if (!bot) {
      box.setAttribute('data-state', 'off');
      box.appendChild(el('p', null, 'Бот не подключён. Заявки видно только здесь, в списке ниже.'));
      if (off) off.hidden = true;
      if (pair) pair.hidden = true;
      if (doomed) refocus('#tg-h');
      return;
    }

    if (off) off.hidden = false;
    if (pair) pair.hidden = false;

    if (!chats.length) {
      /* Самое опасное состояние: токен принят, а уведомления не придут никогда. */
      box.setAttribute('data-state', 'half');
      box.appendChild(el('p', null, 'Бот @' + bot + ' подключён, но получателей пока нет — заявки никуда не уходят. ' +
        'Нажмите «Получить ссылку для подключения» и откройте её в Telegram.'));
      if (doomed) refocus('#tg-pair-get');
      return;
    }

    box.setAttribute('data-state', 'on');
    var intro = el('p', null, 'Бот @' + bot + ' подключён. Заявки приходят ' + chats.length + ' ' +
      (chats.length === 1 ? 'получателю' : 'получателям') + ':');
    intro.id = 'tg-recips-h';
    box.appendChild(intro);

    /* role="list" нужен из-за list-style: none — Safari иначе теряет
       семантику списка. */
    var ul = el('ul', 'recips');
    ul.setAttribute('role', 'list');
    ul.setAttribute('aria-labelledby', 'tg-recips-h');
    chats.forEach(function (c) {
      var name = c.title || 'без имени';
      var li = el('li', 'recips__row');
      li.setAttribute('data-id', String(c.id));
      li.appendChild(el('span', 'recips__name', name));
      var when = leadTime(c.since);
      if (when.text) {
        li.appendChild(el('span', 'vh', ' подключён '));
        var t = el(when.attr ? 'time' : 'span', 'recips__when', when.text);
        if (when.attr) t.setAttribute('datetime', when.attr);
        li.appendChild(t);
      }
      /* Видимая подпись — начало доступного имени; хвост с именем человека
         в отдельном span, чтобы её нельзя было случайно затереть. */
      var rm = el('button', 'abtn abtn--danger recips__rm');
      rm.type = 'button';
      rm.setAttribute('data-id', String(c.id));
      rm.setAttribute('data-name', name);
      rm.appendChild(el('span', null, 'Убрать'));
      rm.appendChild(el('span', 'vh', ' получателя «' + name + '»'));
      li.appendChild(rm);
      ul.appendChild(li);
    });
    box.appendChild(ul);

    if (doomed) {
      var same = keepId ? box.querySelector('.recips__rm[data-id="' + cssEsc(keepId) + '"]') : null;
      if (same) focusRing(same); else refocus('#tg-h');
    }
  }

  function applyTg(d, fromPoll) {
    var sig = tgSig(d.bot, d.chats, d.denied);
    if (fromPoll && sig === tgSigLast) return false;
    tgSigLast = sig;
    renderTgState(d.bot, d.chats);
    renderTgWarn(d.denied);
    return true;
  }

  /* Состояние неизвестно — говорим прямо. Написать «бот не подключён» нельзя:
     владелец полез бы вставлять токен заново, а это стирает получателей. */
  function tgUnknown(msg) {
    var box = $('#tg-state'), off = $('#tg-off'), pair = $('#tg-pair-wrap');
    if (!box) return;
    if (box.contains(document.activeElement) || (pair && pair.contains(document.activeElement)) ||
        (off && off === document.activeElement)) refocus('#tg-h');
    box.textContent = '';
    box.setAttribute('data-state', 'unknown');
    box.appendChild(el('h4', null, 'Состояние'));
    box.appendChild(el('p', null, msg || 'Не удалось узнать, подключён ли бот — сервер не ответил. Перезагрузите страницу.'));
    if (off) off.hidden = true;
    if (pair) pair.hidden = true;
  }

  /* Хостинг без cURL: бота подключить нельзя, форму прячем, причину пишем. */
  function tgUnavailable(msg) {
    var form = $('#tg-form');
    if (form) {
      if (form.contains(document.activeElement)) refocus('#tg-h');
      form.hidden = true;
    }
    $$('.tg-steps, .tg-note').forEach(function (n) { n.hidden = true; });
    tgUnknown(msg);
  }

  function loadTgState(opts) {
    var fromPoll = opts && opts.fromPoll;
    var retried = opts && opts.retried;
    if (tgBusy) return Promise.resolve();

    function fail() {
      if (fromPoll) return;
      if (!retried) { setTimeout(function () { loadTgState({ retried: true }); }, 1500); return; }
      tgUnknown();
      tgSay('Не удалось узнать, подключён ли бот: сервер не ответил. Перезагрузите страницу.', 'bad');
    }

    return api('notify').then(function (res) {
      if (sessionLost(res)) { tgPollStop(); return; }
      if (res.status === 500 && res.data && res.data.error) { tgUnavailable(res.data.error); return; }
      if (!res.ok) { fail(); return; }
      applyTg(res.data, fromPoll);
      return res.data;
    }).catch(function () { fail(); });
  }

  /* Опрос, пока ждём подключения: человек ушёл в телеграм, вкладка спрятана —
     невидимую не опрашиваем, ждём возврата. */
  function tgPollStop() { clearTimeout(tgPollTimer); tgPollTimer = null; tgPollUntil = 0; }

  function tgPollTick() {
    if (!tgPollUntil) return;
    if (Date.now() > tgPollUntil) {
      tgPollStop();
      tgSay('Пока никто не подключился. Нажмите «Проверить», когда нажмёте «Старт» в Telegram.', 'info', true);
      return;
    }
    if (document.visibilityState === 'hidden' || tgBusy) { tgPollTimer = setTimeout(tgPollTick, 4000); return; }
    var stateBox = $('#tg-state');
    var before = stateBox ? stateBox.getAttribute('data-state') : '';
    var deniedBefore = tgDeniedSeen;
    loadTgState({ fromPoll: true }).then(function (d) {
      if (d && d.chats && d.chats.length && before !== 'on') {
        tgPollStop();
        tgPairClose();
        var extra = (d.denied && d.denied.length) ? ' Ещё кто-то пытался подключиться — предупреждение выше.' : '';
        tgSay('Готово: подключился получатель «' + (d.chats[d.chats.length - 1].title || 'без имени') +
              '». Заявки приходят в Telegram.' + extra, 'ok');
        return;
      }
      if (d && tgDeniedSeen > deniedBefore) {
        tgSay('Кто-то пытался подключиться к боту и получил отказ. Подробности — в предупреждении выше.', 'info', true);
      }
      if (tgPollUntil) tgPollTimer = setTimeout(tgPollTick, 4000);
    });
  }

  function tgPollStart() {
    tgPollStop();
    tgPollUntil = Date.now() + 120000;   // две минуты: дальше человек нажмёт «Проверить» сам
    tgPollTimer = setTimeout(tgPollTick, 4000);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && tgPollUntil) { clearTimeout(tgPollTimer); tgPollTick(); }
  });

  /* Ссылка-приглашение. Собираем сами из ника бота и кода: подставлять в
     href строку, пришедшую готовой, — значит доверять ей адрес перехода. */
  function tgPairClose() {
    var box = $('#tg-pair');
    if (!box || box.hidden) return;
    if (box.contains(document.activeElement)) refocus('#tg-pair-get');
    box.hidden = true;
    $('#tg-pair-code').value = '';
    $('#tg-pair-link').removeAttribute('href');
    clearTimeout(tgExpTimer);
  }

  function tgPairLink(code) {
    if (!TG_BOT || !/^[A-Za-z0-9_]{4,32}$/.test(TG_BOT)) return '';
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(code)) return '';
    return 'https://t.me/' + TG_BOT + '?start=' + code;
  }

  function tgPairShow(code, ttl) {
    var box = $('#tg-pair'), fld = $('#tg-pair-code'), a = $('#tg-pair-link');
    var href = tgPairLink(code);
    /* Группами по четыре — так проще прочитать и продиктовать. */
    fld.value = code.replace(/(.{4})(?=.)/g, '$1 ');
    if (href) {
      a.href = href;
      a.hidden = false;
      $('#tg-pair-link-vh').textContent = ' — бот @' + TG_BOT + ', откроется в новой вкладке';
    } else { a.removeAttribute('href'); a.hidden = true; }
    box.hidden = false;

    /* Протухшую ссылку убираем со страницы совсем. */
    clearTimeout(tgExpTimer);
    tgExpTimer = setTimeout(function () {
      tgPairClose();
      tgSay('Ссылка устарела. Нажмите «Получить ссылку для подключения» ещё раз.', 'info');
    }, Math.max(10000, (ttl || 1800) * 1000));

    tgPollStart();
  }

  $('#tg-pair-get').addEventListener('click', function () {
    var btn = this;
    if (isBusy(btn)) return;
    setBusy(btn, true);
    tgBusy = true;
    tgStatus('Получаю ссылку…', '', true);
    announceSlow('tg', 1000, 'Получаю ссылку…');
    api('notify', { code: true }).then(function (res) {
      if (sessionLost(res)) return;
      if (!res.ok || !res.data.code || !res.data.code.code) {
        tgSay((res.data && res.data.error) || 'Не получилось выдать ссылку. Попробуйте ещё раз.', 'bad');
        return;
      }
      tgSigLast = tgSig(res.data.bot, res.data.chats, res.data.denied);
      renderTgState(res.data.bot, res.data.chats);
      renderTgWarn(res.data.denied);
      tgPairShow(res.data.code.code, res.data.code.ttl);
      tgSay('Ссылка готова, действует 30 минут. Откройте бота и нажмите «Старт» — здесь появится получатель.', 'ok');
    }).catch(function () { tgSay('Сервер не ответил. Ссылка не выдана.', 'bad'); })
      .then(function () { tgBusy = false; setBusy(btn, false); });
  });

  $('#tg-pair-check').addEventListener('click', function () {
    var btn = this;
    if (isBusy(btn)) return;
    setBusy(btn, true);
    tgStatus('Проверяю…', '', true);
    announceSlow('tg', 1000, 'Проверяю…');
    api('notify').then(function (res) {
      if (sessionLost(res)) return;
      if (!res.ok) { tgSay('Сервер не ответил. Попробуйте ещё раз.', 'bad'); return; }
      tgSigLast = tgSig(res.data.bot, res.data.chats, res.data.denied);
      renderTgState(res.data.bot, res.data.chats);
      renderTgWarn(res.data.denied);
      if (res.data.chats && res.data.chats.length) {
        tgPollStop();
        tgPairClose();
        tgSay('Готово: подключился получатель «' + (res.data.chats[res.data.chats.length - 1].title || 'без имени') +
              '». Заявки приходят в Telegram.', 'ok');
      } else {
        tgSay('Пока никто не подключился. Откройте бота в Telegram, нажмите «Старт» и проверьте ещё раз.', 'info');
      }
    }).catch(function () { tgSay('Сервер не ответил. Попробуйте ещё раз.', 'bad'); })
      .then(function () { setBusy(btn, false); });
  });

  $('#tg-pair-copy').addEventListener('click', function () {
    var fld = $('#tg-pair-code'), code = fld.value.replace(/\s+/g, '');
    if (!code) return;
    function done(ok) {
      if (ok) { tgSay('Код подключения скопирован.', 'ok'); return; }
      /* Буфер закрыт — выделяем поле: сам переезд фокуса и есть сообщение. */
      fld.focus();
      fld.select();
      tgSay('Скопировать не удалось — код выделен, нажмите Ctrl+C, на Mac Command+C.', 'bad', true);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(function () { done(true); }, function () { done(false); });
    } else done(false);
  });

  $('#tg-warn-hide').addEventListener('click', function () {
    var box = $('#tg-warn');
    var newest = '';
    $$('#tg-warn-list li').forEach(function (n) { var v = n.getAttribute('data-at') || ''; if (v > newest) newest = v; });
    try { localStorage.setItem(TG_SEEN_KEY, newest || new Date().toISOString()); } catch (e) { /* приватный режим */ }
    refocus('#tg-h');
    box.hidden = true;
  });

  /* Отзыв доступа: если в бота кто-то влез, владелец убирает его одной
     кнопкой, не переподключая бота. */
  $('#tg-state').addEventListener('click', function (e) {
    var btn = e.target.closest('.recips__rm');
    if (!btn || isBusy(btn)) return;
    var id = btn.getAttribute('data-id'), name = btn.getAttribute('data-name') || 'без имени';

    confirmAsk('Убрать получателя «' + name + '»?',
      'Заявки ему приходить перестанут. Чтобы вернуть, нужно будет выдать новую ссылку для подключения.',
      'Убрать', function () {
        var rows = $$('.recips__row', $('#tg-state'));
        var idx = rows.indexOf(btn.closest('.recips__row'));
        setBusy(btn, true);
        tgBusy = true;
        tgStatus('Убираю получателя…', '', true);
        announceSlow('tg', 1000, 'Убираю получателя…');

        api('notify', { drop: id }).then(function (res) {
          if (sessionLost(res)) return;
          if (!res.ok) { tgSay((res.data && res.data.error) || 'Не получилось убрать получателя.', 'bad'); return; }
          tgSigLast = tgSig(res.data.bot, res.data.chats, res.data.denied);
          renderTgState(res.data.bot, res.data.chats);
          renderTgWarn(res.data.denied);
          var left = $$('.recips__row', $('#tg-state'));
          if (left.length) {
            var next = left[Math.min(idx, left.length - 1)];
            var nb = next && next.querySelector('.recips__rm');
            if (nb) focusRing(nb);
            tgSay('Получатель «' + name + '» убран — ему заявки больше не приходят.', 'ok');
          } else {
            refocus('#tg-pair-get');
            tgSay('Получатель «' + name + '» убран. Получателей не осталось — заявки в Telegram не приходят, они остаются в списке ниже.', 'info');
          }
        }).catch(function () { tgSay('Сервер не ответил. Получатель не убран.', 'bad'); })
          .then(function () {
            tgBusy = false;
            /* Отказ сервера оставляет кнопку на месте — возвращаем её в строй. */
            if (btn.isConnected) setBusy(btn, false);
          });
      });
  });

  $('#tg-form').addEventListener('submit', function (e) {
    e.preventDefault();
    fieldErr('#tg-token', null);
    tgStatus('');
    var input = $('#tg-token');

    /* Из телеграма токен часто прилетает вместе с текстом письма и с
       неразрывными пробелами. Вытаскиваем его и возвращаем в поле. */
    var v = input.value.replace(/[ ​-‍﻿]/g, ' ').trim();
    var m = v.match(/\d{5,}:[A-Za-z0-9_-]{20,}/);
    if (m) v = m[0];
    v = v.replace(/\s+/g, '');
    input.value = v;

    if (!v) { tgFieldErr('#tg-token', 'вставьте токен от BotFather — без него подключать нечего.'); return; }
    if (!/^\d+:.+/.test(v) || v.length > 200) {
      tgFieldErr('#tg-token', 'токен выглядит как 1234567890:AAH… — похоже, скопировалось не то.');
      input.select();
      return;
    }

    var btn = $('#tg-connect');
    if (isBusy(btn)) return;
    setBusy(btn, true);
    tgStatus('Подключаю бота…', '', true);
    announceSlow('tg', 1000, 'Подключаю бота…');

    api('notify', { token: v }).then(function (res) {
      if (sessionLost(res)) return;
      if (res.ok) {
        input.value = '';
        tgSigLast = tgSig(res.data.bot, res.data.chats, res.data.denied);
        renderTgState(res.data.bot, res.data.chats);
        renderTgWarn(res.data.denied);
        tgSay(res.data.chats && res.data.chats.length
          ? 'Готово, бот подключён.'
          : 'Токен принят. Остался последний шаг: нажмите «Получить ссылку для подключения» и откройте её.', 'ok');
        return;
      }
      var msg = (res.data && res.data.error) || 'Не получилось подключить бота.';
      if (res.data && res.data.field === 'token') {
        if (v.length > 50) msg += ' Похоже, вместе с токеном скопировался лишний текст: оставьте в поле только строку вида 1234567890:AAH…';
        tgStatus('');
        tgFieldErr('#tg-token', msg.replace(/^(.)/, function (c) { return c.toLowerCase(); }));
        input.select();
      } else tgSay(msg, 'bad');
    }).catch(function () { tgSay('Сервер не ответил. Бот не подключён — попробуйте ещё раз.', 'bad'); })
      .then(function () { setBusy(btn, false); });
  });

  /* Отключение — отдельной кнопкой с подтверждением: случайный Enter не
     должен сносить бота и список получателей. */
  $('#tg-off').addEventListener('click', function () {
    var btn = this;
    if (isBusy(btn)) return;
    confirmAsk('Отключить бота?',
      'Заявки перестанут приходить в Telegram — останутся только в списке панели. ' +
      'Чтобы вернуть, нужно будет снова вставить токен и заново выдать ссылку каждому получателю.',
      'Отключить', function () {
        setBusy(btn, true);
        tgStatus('Отключаю бота…', '', true);
        announceSlow('tg', 1000, 'Отключаю бота…');
        api('notify', { token: '' }).then(function (res) {
          if (sessionLost(res)) return;
          if (res.ok) {
            tgPollStop();
            tgPairClose();
            renderTgState(null, []);
            refocus('#tg-token');
            tgSay('Бот отключён. Заявки остаются в списке ниже.', 'info');
          } else tgSay((res.data && res.data.error) || 'Не получилось отключить бота.', 'bad');
        }).catch(function () { tgSay('Сервер не ответил. Ничего не изменилось.', 'bad'); })
          .then(function () { if (btn.isConnected) setBusy(btn, false); });
      });
  });

  /* ---------------------------------------------- пароль --------------- */

  var passForm = $('#pass-form');

  /* Сводка ошибок: фокус на неё, объявления нет — сводка и есть сообщение. */
  function showPassErrors(errs) {
    var box = $('#pass-errs'), list = $('#pass-err-list'), h = $('#pass-errs-h');
    h.textContent = errs.length === 1 ? 'В форме одна ошибка'
                                      : 'В форме ' + plural(errs.length, 'ошибка', 'ошибки', 'ошибок');
    list.textContent = '';
    errs.forEach(function (pair) {
      var li = el('li'), a = el('a', null, pair[1]);
      a.href = '#' + pair[0];
      a.addEventListener('click', function (ev) { ev.preventDefault(); refocus('#' + pair[0]); });
      li.appendChild(a);
      list.appendChild(li);
    });
    passStatus('');
    box.hidden = false;
    focusRing(box);
  }

  /* Галочка объявляет своё состояние сама. Каретку сохраняем руками: смена
     type сбрасывает её в конец. */
  $('#p-show').addEventListener('change', function () {
    var show = this.checked;
    ['#p-old', '#p-new', '#p-new2'].forEach(function (s) {
      var i = $(s), a = i.selectionStart, b = i.selectionEnd, focused = document.activeElement === i;
      i.type = show ? 'text' : 'password';
      if (focused) { try { i.setSelectionRange(a, b); } catch (e) { /* поле не даёт */ } }
    });
  });

  passForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var errs = [];
    ['#p-old', '#p-new', '#p-new2'].forEach(function (s) { fieldErr(s, null); });
    passStatus('');
    $('#pass-errs').hidden = true;

    var old = $('#p-old').value, nw = $('#p-new').value, nw2 = $('#p-new2').value;
    if (!old) { fieldErr('#p-old', 'без текущего пароля сменить нельзя.'); errs.push(['p-old', 'Текущий пароль не введён']); }
    if (nw.length < 8) { fieldErr('#p-new', 'нужно хотя бы 8 символов, сейчас ' + nw.length + '.'); errs.push(['p-new', 'Новый пароль короче 8 символов']); }
    else if (/\s/.test(nw)) { fieldErr('#p-new', 'в пароле не должно быть пробелов.'); errs.push(['p-new', 'В новом пароле есть пробел']); }
    else if (nw === old) { fieldErr('#p-new', 'новый пароль совпадает с текущим.'); errs.push(['p-new', 'Новый пароль совпадает с текущим']); }
    else if (nw !== nw2) { fieldErr('#p-new2', 'второй пароль отличается от первого. Введите один и тот же.'); errs.push(['p-new2', 'Пароли не совпадают']); }

    /* Один список ошибок на все случаи, и свои, и серверные. */
    if (errs.length) { showPassErrors(errs); return; }

    var btn = $('#pass-submit');
    if (isBusy(btn)) return;
    setBusy(btn, true);
    passStatus('Меняю пароль…', '', true);
    announceSlow('pass', 1000, 'Меняю пароль…');

    api('password', { old: old, new: nw }).then(function (res) {
      if (sessionLost(res)) return;
      if (res.ok) {
        passForm.reset();
        $('#p-show').checked = false;
        ['#p-old', '#p-new', '#p-new2'].forEach(function (s) { $(s).type = 'password'; });
        /* Фокус остаётся на кнопке — читается только эта строка. */
        passStatus('Готово. Пароль изменён — следующий вход уже с новым. Запишите его: восстановить пароль нельзя.', 'ok');
        return;
      }
      var msg = (res.data && res.data.error) || 'Не получилось сменить пароль.';
      var isNew = res.data && res.data.field === 'new';
      var isOld = res.data && res.data.field === 'old';
      if (isNew || isOld) {
        fieldErr(isNew ? '#p-new' : '#p-old', msg.replace(/^(.)/, function (c) { return c.toLowerCase(); }));
        if (isOld) $('#p-old').value = '';   // новый пароль набран верно, стирать его незачем
        showPassErrors([[isNew ? 'p-new' : 'p-old', msg.replace(/\.$/, '')]]);
      } else passStatus(msg, 'bad');
    }).catch(function () { passStatus('Сервер не ответил. Пароль не изменён — попробуйте ещё раз.', 'bad'); })
      .then(function () { setBusy(btn, false); });
  });

  /* ---------------------------------------------- старт ---------------- */

  function offline(msg) {
    var ln = $('#leads-note'), pn = $('#pass-note');
    ln.textContent = msg || 'Раздел работает только на сайте: заявки и бот живут на сервере, а эта страница открыта не с сайта.';
    ln.hidden = false;
    pn.textContent = msg || 'Пароль меняется на сервере, а эта страница открыта не с сайта.';
    pn.hidden = false;
    $('#leads-body').hidden = true;
    $('#leads-acts').hidden = true;
    $('#pass-body').hidden = true;
  }

  function online() {
    $('#leads-note').hidden = true;
    $('#pass-note').hidden = true;
    $('#leads-body').hidden = false;
    $('#leads-acts').hidden = false;
    $('#pass-body').hidden = false;
  }

  /* Первая загрузка молчит: ядро в этот момент договаривает своё про
     черновик, и два сообщения подряд съели бы друг друга. */
  function init() {
    api('state', null, 15000).then(function (res) {
      if (res.notApi || !res.ok) { offline(); return; }
      if (!res.data.auth) { offline('Заявки и смена пароля доступны после входа.'); return; }
      online();
      loadLeads();
      if (res.data.curl === false) {
        tgUnavailable('На этом хостинге отключён cURL — Telegram подключить нельзя. Заявки всё равно сохраняются в списке ниже.');
      } else loadTgState();
    }).catch(function () { offline('Сервер не ответил. Обновите страницу.'); });
  }

  /* Событие приходит и после повторного входа (сессия истекала) — тогда
     списки просто перечитываются. */
  if (document.getElementById('gate')) document.addEventListener('panel:unlocked', init);
  else init();
})();
