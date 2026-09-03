/* ═══════════════════════════════════════════════════════════
   НОМИНАЛ — скрипты витрины
   Заявки принимает api.php (действие lead): пишет в файл и шлёт в Telegram
   получателям, подключённым через панель управления.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ENDPOINT = 'api.php?action=lead';      // ← обработчик заявок
  /* Ссылка на Telegram из панели («Тексты сайта»): показывается, если
     отправка не прошла. catalog.js кладёт тексты сайта в window.NOMINAL. */
  var TG_FALLBACK = (window.NOMINAL && window.NOMINAL.site && window.NOMINAL.site.telegram) || '';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ── год в подвале ─────────────────────────────────────── */
  var yr = $('#yr');
  if (yr) yr.textContent = String(new Date().getFullYear());

  /* ── высота шапки → CSS-переменная (для scroll-padding) ── */
  // Меряем ТОЛЬКО строку шапки: если мерить всю .hdr, открытое мобильное меню
  // попадёт в --hdr-h, а --hdr-h влияет на вёрстку — получится растущая петля.
  var hdrIn = $('.hdr__in');
  if (hdrIn) {
    var syncH = function () {
      document.documentElement.style.setProperty('--hdr-h', hdrIn.offsetHeight + 'px');
    };
    syncH();
    if (window.ResizeObserver) new ResizeObserver(syncH).observe(hdrIn);
    else window.addEventListener('resize', syncH);
  }

  /* ── появление блоков при скролле ──────────────────────── */
  var els = $$('.reveal');
  var showAll = function () { els.forEach(function (el) { el.classList.add('is-in'); }); };

  if (!('IntersectionObserver' in window) || reduce.matches) {
    showAll();
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    els.forEach(function (el) { io.observe(el); });
    // страховка: в скрытой вкладке и панели превью IntersectionObserver не срабатывает
    setTimeout(showAll, 2500);
  }
  // фокус не должен попадать на невидимый блок
  document.addEventListener('focusin', function (e) {
    var r = e.target.closest && e.target.closest('.reveal');
    if (r) r.classList.add('is-in');
  });

  /* ── мобильное меню ────────────────────────────────────── */
  var burger = $('.burger');
  var mnav = $('#m-nav');
  if (burger && mnav) {
    var setNav = function (open) {
      burger.setAttribute('aria-expanded', String(open));
      mnav.classList.toggle('is-open', open);
      mnav.inert = !open;
    };
    var wide = window.matchMedia('(min-width: 901px)');
    var syncNav = function () {
      if (wide.matches) { setNav(false); mnav.inert = false; }
      else if (burger.getAttribute('aria-expanded') !== 'true') { mnav.inert = true; }
    };
    syncNav();
    (wide.addEventListener ? wide.addEventListener('change', syncNav) : wide.addListener(syncNav));

    burger.addEventListener('click', function () {
      var open = burger.getAttribute('aria-expanded') === 'true';
      setNav(!open);
      if (!open) { var a = $('a', mnav); if (a) a.focus(); }
    });
    mnav.addEventListener('click', function (e) { if (e.target.closest('a')) setNav(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
        setNav(false); burger.focus();
      }
    });
  }

  /* ── лента партнёров: пауза ────────────────────────────── */
  var strip = $('.strip');
  var pause = $('.strip__pause');
  if (strip && pause) {
    pause.addEventListener('click', function () {
      var p = strip.classList.toggle('is-paused');
      pause.setAttribute('aria-pressed', String(p));
      pause.textContent = p ? 'Продолжить' : 'Остановить';
    });
  }

  /* ── фильтр каталога ───────────────────────────────────── */
  var grid = $('#cards');
  var fstatus = $('#fstatus');
  var empty = $('#cards-empty');
  var chips = $$('.chipbtn');

  var plural = function (n, one, few, many) {
    var d = n % 10, h = n % 100;
    if (d === 1 && h !== 11) return one;
    if (d >= 2 && d <= 4 && (h < 10 || h >= 20)) return few;
    return many;
  };

  var sayTimer = null;
  var say = function (node, text) {
    if (!node) return;
    node.textContent = '';
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { node.textContent = text; }, 80);
  };

  if (grid && chips.length) {
    var cards = $$('.card', grid);
    chips.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cat = btn.dataset.filter;
        chips.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });

        grid.setAttribute('aria-busy', 'true');
        var n = 0;
        cards.forEach(function (c) {
          var ok = cat === 'all' || c.dataset.cat === cat;
          c.hidden = !ok;
          if (ok) n++;
        });
        grid.setAttribute('aria-busy', 'false');
        if (empty) empty.hidden = n !== 0;

        say(fstatus, n === 0
          ? 'Ничего не найдено'
          : 'Показано ' + n + ' ' + plural(n, 'предложение', 'предложения', 'предложений'));
      });
    });
  }

  /* ── FAQ ───────────────────────────────────────────────── */
  $$('.faq__b').forEach(function (btn) {
    var panel = document.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) return;

    var collapse = function () {
      panel.dataset.open = 'false';
      if (reduce.matches) { panel.hidden = true; return; }
      var done = false;
      var finish = function () {
        if (done) return; done = true;
        panel.removeEventListener('transitionend', onEnd);
        if (panel.dataset.open === 'false') panel.hidden = true;
      };
      var onEnd = function (e) { if (e.propertyName === 'grid-template-rows') finish(); };
      panel.addEventListener('transitionend', onEnd);
      setTimeout(finish, 420);
    };

    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      if (open) { collapse(); return; }
      panel.hidden = false;
      void panel.offsetHeight;                 // reflow, чтобы анимация стартовала с 0fr
      panel.dataset.open = 'true';
    });
  });

  /* ── веер карт: стопка → раскрытие ─────────────────────── */
  var scene = $('.scene');
  if (scene) {
    if (reduce.matches) {
      scene.classList.add('is-open', 'is-live');
    } else {
      // setTimeout, а не requestAnimationFrame: в скрытой панели превью rAF замораживается
      setTimeout(function () { scene.classList.add('is-open'); }, 420);
      // с запасом после раскрытия (0.42 + 0.27 задержки + 0.85 хода = 1.54 с)
      setTimeout(function () { scene.classList.add('is-live'); }, 2600);
    }
  }

  /* ── параллакс карт и пятно света на тёмной полосе ─────── */
  var fine = window.matchMedia('(pointer: fine)');
  if (!reduce.matches && fine.matches) {
    if (scene) {
      // без requestAnimationFrame: в скрытой панели превью rAF замораживается
      window.addEventListener('mousemove', function (e) {
        var r = scene.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        var x = (e.clientX - (r.left + r.width / 2)) / r.width * 2;
        var y = (e.clientY - (r.top + r.height / 2)) / r.height * 2;
        scene.style.setProperty('--px', Math.max(-1, Math.min(1, x)).toFixed(3));
        scene.style.setProperty('--py', Math.max(-1, Math.min(1, y)).toFixed(3));
      }, { passive: true });
    }

    var band = $('.band');
    if (band) {
      band.addEventListener('mousemove', function (e) {
        var r = band.getBoundingClientRect();
        band.style.setProperty('--sx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        band.style.setProperty('--sy', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      }, { passive: true });
    }
  }

  /* ── форма заявки ──────────────────────────────────────── */
  var form = $('#lead');
  if (!form) return;

  var status = $('#f-status');
  var errBox = $('#f-error');
  var submit = form.querySelector('button[type="submit"]');

  var normPhone = function (v) {
    var d = String(v).replace(/\D/g, '').replace(/^8/, '7');
    return (d.length === 11 && d.charAt(0) === '7') ? '+7' + d.slice(1) : null;
  };

  var RULES = {
    name: function (el) {
      return el.value.trim().length >= 2 ? '' : 'Укажите имя — минимум 2 символа.';
    },
    phone: function (el) {
      if (!el.value.trim()) return 'Укажите номер телефона — по нему мы перезвоним.';
      return normPhone(el.value) ? '' : 'Введите номер в формате +7 999 123-45-67.';
    },
    product: function (el) {
      return el.value ? '' : 'Выберите продукт из списка.';
    },
    consent: function (el) {
      return el.checked ? '' : 'Отметьте согласие на обработку персональных данных — без него заявку принять нельзя.';
    }
  };

  var fields = ['name', 'phone', 'product', 'consent'].map(function (n) { return form.elements[n]; });
  var errOf = function (el) { return document.getElementById(el.id + '-e'); };
  var setErr = function (el, m) { errOf(el).textContent = m; el.setAttribute('aria-invalid', 'true'); };
  var clrErr = function (el) { errOf(el).textContent = ''; el.setAttribute('aria-invalid', 'false'); };

  fields.forEach(function (el) {
    var live = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
    el.addEventListener(live, function () {
      if (el.getAttribute('aria-invalid') === 'true' && !RULES[el.name](el)) clrErr(el);
    });
    el.addEventListener('blur', function () {
      if (form.dataset.tried !== 'true') return;
      var m = RULES[el.name](el);
      m ? setErr(el, m) : clrErr(el);
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (form.dataset.busy === 'true') return;
    form.dataset.tried = 'true';
    errBox.textContent = '';

    var bad = [];
    fields.forEach(function (el) {
      var m = RULES[el.name](el);
      if (m) { setErr(el, m); bad.push(el); } else { clrErr(el); }
    });

    if (bad.length) {
      status.textContent = '';
      say(status, 'Заявка не отправлена. Ошибок: ' + bad.length + '. Проверьте выделенные поля.');
      setTimeout(function () {
        bad[0].focus({ preventScroll: true });
        bad[0].scrollIntoView({ block: 'center', behavior: reduce.matches ? 'auto' : 'smooth' });
      }, 120);
      return;
    }

    if (form.elements.site && form.elements.site.value) return;   // бот

    // На GitHub Pages нет PHP — показываем честную заглушку вместо ошибки сети.
    // На боевом хостинге это условие не срабатывает и заявка уходит в send.php.
    if (/\.github\.io$/i.test(location.hostname) || location.protocol === 'file:') {
      form.reset();
      fields.forEach(clrErr);
      form.dataset.tried = 'false';
      say(status, 'Это превью — заявка никуда не ушла. На рабочем сайте она приходит в Telegram и сохраняется в файл.');
      return;
    }

    form.dataset.busy = 'true';
    submit.setAttribute('aria-disabled', 'true');
    submit.classList.add('is-busy');
    var slow = setTimeout(function () { say(status, 'Отправляем заявку'); }, 700);

    var body = new FormData(form);
    body.set('phone', normPhone(form.elements.phone.value));

    fetch(ENDPOINT, { method: 'POST', body: body })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.text(); })
      .then(function () {
        clearTimeout(slow);
        form.reset();
        fields.forEach(clrErr);
        form.dataset.tried = 'false';
        say(status, 'Заявка отправлена. Перезвоним в течение рабочего дня.');
      })
      .catch(function () {
        clearTimeout(slow);
        status.textContent = '';
        say(errBox, 'Не удалось отправить заявку. Проверьте связь и попробуйте ещё раз.'
          + (TG_FALLBACK ? ' Либо напишите нам в Telegram: ' + TG_FALLBACK : ''));
      })
      .then(function () {
        form.dataset.busy = 'false';
        submit.removeAttribute('aria-disabled');
        submit.classList.remove('is-busy');
      });
  });
})();
