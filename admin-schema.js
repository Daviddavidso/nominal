/* ==========================================================================
   СХЕМА ПРОЕКТА ДЛЯ ЯДРА АДМИНКИ (admin-core.js).

   Ядро одинаковое во всех витринах и про формат data.js ничего не знает.
   Здесь сказано только: какие у карточки поля и как разложить общий вид
   обратно в файл, который читает сайт.

   Сайт читает из data.js имена SITE / CATEGORIES / OFFERS.
   Панель правит все три.
   ========================================================================== */

window.ADMIN = {
  brand: 'НОМИНАЛ',
  dataFile: 'data.js',
  draftKey: 'nominal_admin_draft',
  preview: 'index.html?draft=1',

  /* Ссылки партнёрок приходят без erid — маркировку печатаем только если
     она реально есть в ссылке, выдумывать её нельзя. */
  requireErid: false,

  /* Включает блок «Логотип»: либо файл банка, либо цветная плашка.
     Цвет плашки заодно задаёт цвет крупной цифры — сайт сам затемнит его
     до читаемого, так что испортить контраст через панель невозможно. */
  logo: true,

  site: [
    { key: 'brand',    label: 'Название сайта', hint: 'Стоит в шапке, подвале и в заголовке вкладки.' },
    { key: 'tagline',  label: 'Подзаголовок',   hint: 'Короткая строка над главным заголовком.' },
    { key: 'phone',    label: 'Телефон',        hint: 'Можно оставить пустым.' },
    { key: 'telegram', label: 'Ссылка на Telegram', type: 'url',
      hint: 'Показывается, если заявка не ушла. Можно оставить пустым.' }
  ],

  groups: [
    { key: 'title', label: 'Название раздела', required: true, hint: 'Видно на кнопке-фильтре над каталогом.' },
    { key: 'cta',   label: 'Надпись на кнопках', required: true,
      hint: 'Одна на все карточки раздела: «Оформить», «Открыть вклад».' }
  ],

  card: [
    { key: 'partner',  label: 'Банк', required: true, hint: 'Видно рядом с логотипом.' },
    { key: 'tag',      label: 'Тип продукта', hint: 'Мелкая плашка: «дебетовая карта», «вклад».' },
    { key: 'title',    label: 'Название продукта', required: true, hint: 'Например «Альфа-Карта».' },
    { key: 'headline', label: 'Крупная цифра', required: true, hint: 'Например «до 5%» или «365 дней».' },
    { key: 'note',     label: 'Подпись под цифрой', hint: 'Например «кэшбэк в выбранных категориях».' },
    { key: 'specs',    label: 'Условия', type: 'pairs',
      hint: 'По строке на условие, через двоеточие: «Обслуживание: 0 ₽». Пишите только подтверждённые партнёркой цифры.' },
    { key: 'url',      label: 'Партнёрская ссылка', type: 'url',
      hint: 'Пока пусто — кнопка ведёт на форму заявки на этом же сайте.' }
  ],

  /* ---------------------------------------------- чтение --------------- */

  load: function () {
    var groups = CATEGORIES.map(function (c) {
      return { key: c.id, title: c.label, cta: c.cta };
    });

    var seen = {};
    var cards = OFFERS.map(function (o, i) {
      /* Устойчивый ключ: в файле его нет, а ядру он нужен, чтобы не путать
         карточки при перестановке. Считаем от банка и названия продукта. */
      var base = ((o.partner || '') + '-' + (o.title || '')).toLowerCase()
        .replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || ('c' + i);
      var uid = base, n = 2;
      while (seen[uid]) uid = base + '-' + (n++);
      seen[uid] = true;

      return {
        uid: uid,
        group: o.cat,
        hidden: !!o.hidden,
        partner: o.partner || '',
        tag: o.tag || '',
        title: o.title || '',
        headline: o.headline || '',
        note: o.note || '',
        specs: (o.specs || []).map(function (p) { return [p[0], p[1]]; }),
        url: o.url || '',
        logo: o.logo || '',
        tone: { bg: (o.tone && o.tone.bg) || '#1B2AE0', ink: (o.tone && o.tone.ink) || '#FFFFFF' },
        /* Векторный знак банка. В панели не показывается, но должен пережить
           круговорот — иначе у старых карточек пропадут логотипы. */
        mark: o.mark || ''
      };
    });

    return {
      SITE: JSON.parse(JSON.stringify(SITE)),
      GROUPS: groups,
      CARDS: cards
    };
  },

  /* ---------------------------------------------- сборка файла --------- */

  build: function (m) {
    function js(v) { return JSON.stringify(v, null, 2); }
    function t(v) { return String(v == null ? '' : v).trim(); }

    var categories = m.GROUPS.map(function (g) {
      return { id: g.key, label: t(g.title), cta: t(g.cta) || 'Оформить' };
    });

    var offers = m.CARDS.map(function (c) {
      var o = {
        cat: c.group,
        partner: t(c.partner),
        tag: t(c.tag),
        title: t(c.title),
        mark: t(c.mark),
        logo: t(c.logo),
        tone: { bg: t(c.tone && c.tone.bg) || '#1B2AE0', ink: t(c.tone && c.tone.ink) || '#FFFFFF' },
        headline: t(c.headline),
        note: t(c.note),
        specs: (c.specs || [])
          .map(function (p) { return [t(p[0]), t(p[1])]; })
          .filter(function (p) { return p[0] || p[1]; }),
        url: t(c.url)
      };
      if (c.hidden) o.hidden = true;
      return o;
    });

    return [
      '/* ═════════════════════════════════════════════════════════════════════════',
      '   КАТАЛОГ — единственный файл с предложениями.',
      '   Собран панелью ' + new Date().toLocaleString('ru-RU') + '.',
      '',
      '   Правится через admin.html. Руками тоже можно, но при следующем',
      '   сохранении из панели правки будут перезаписаны.',
      '',
      '   url      — партнёрская ссылка. Пусто — кнопка ведёт на форму заявки.',
      '   tone.bg  — цвет плашки с логотипом. От него же считается цвет крупной',
      '              цифры: сайт сам затемняет его, пока не станет читаемым.',
      '   logo     — файл логотипа. Пусто — рисуется векторный знак из mark.',
      '   mark     — id знака из набора в index.html (lg-alfa, lg-tbank и т.д.).',
      '',
      '   ВАЖНО ПРО ЦИФРЫ: ставки, лимиты и кэшбэк ставьте только те, что',
      '   подтверждены партнёркой. Цифра «на глаз» — недостоверная реклама.',
      '   ═════════════════════════════════════════════════════════════════════════ */',
      '',
      'const SITE = ' + js(m.SITE) + ';',
      '',
      '/* cta — надпись на кнопке карточек этого раздела. */',
      'const CATEGORIES = ' + js(categories) + ';',
      '',
      'const OFFERS = ' + js(offers) + ';',
      ''
    ].join('\n');
  }
};
