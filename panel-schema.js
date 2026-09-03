/* ==========================================================================
   СХЕМА ПРОЕКТА «НОМИНАЛ» ДЛЯ ЯДРА ПАНЕЛИ (panel-core.js).

   Ядро одинаковое во всех витринах и про формат data.js ничего не знает.
   Здесь сказано только: какие у карточки поля и как разложить общий вид
   обратно в файл, который читает сайт: SITE / CATEGORIES / OFFERS.
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

  /* Фон карточки на сайте — белый. К нему ядро считает контраст плашки.
     Без этой строки ядро берёт свой тёмный фон и бракует нормальные цвета. */
  surface: '#FFFFFF',

  /* Цвета новой плашки по умолчанию — фирменный синий сайта, а не оранжевый
     из ядра. */
  defaultTone: { bg: '#1B2AE0', ink: '#FFFFFF' },

  /* Готовые логотипы — файлы лежат в img/logos/. Список шире каталога:
     логотип нового оффера не нужно искать по интернету. Своя картинка
     грузится кнопкой «Выбрать файл…» в карточке. */
  presets: [
    { label: 'Банки', items: [
      { name: 'АК Барс Банк', value: 'img/logos/akbars.png' },
      { name: 'Альфа-Банк', value: 'img/logos/alfabank.png' },
      { name: 'Банк Санкт-Петербург', value: 'img/logos/bspb.png' },
      { name: 'ВТБ', value: 'img/logos/vtb.png' },
      { name: 'Газпромбанк', value: 'img/logos/gazprombank.png' },
      { name: 'Зенит Банк', value: 'img/logos/zenit.png' },
      { name: 'Кредит Европа Банк', value: 'img/logos/crediteurope.svg' },
      { name: 'МТС Банк', value: 'img/logos/mtsbank.png' },
      { name: 'ОТП Банк', value: 'img/logos/otp.png' },
      { name: 'Почта Банк', value: 'img/logos/pochtabank.png' },
      { name: 'ПСБ', value: 'img/logos/psb.png' },
      { name: 'Райффайзен Банк', value: 'img/logos/raiffeisen.png' },
      { name: 'Ренессанс Банк', value: 'img/logos/rencredit.png' },
      { name: 'Россельхозбанк', value: 'img/logos/rshb.png' },
      { name: 'Русский Стандарт', value: 'img/logos/rsb.png' },
      { name: 'Сбербанк', value: 'img/logos/sberbank.png' },
      { name: 'Совкомбанк', value: 'img/logos/sovcombank.png' },
      { name: 'Совкомбанк Халва', value: 'img/logos/halva.png' },
      { name: 'Т-Банк', value: 'img/logos/tbank.png' },
      { name: 'УБРиР', value: 'img/logos/ubrir.png' },
      { name: 'Уралсиб', value: 'img/logos/uralsib.png' },
      { name: 'Хоум Банк', value: 'img/logos/homecredit.png' },
      { name: 'Модульбанк', value: 'img/logos/modulbank.png' },
      { name: 'Ozon Банк', value: 'img/logos/ozon.png' }
    ] },
    { label: 'МФО и займы', items: [
      { name: 'Аденьги', value: 'img/logos/adengi.png' },
      { name: 'Быстроденьги', value: 'img/logos/bistrodengi.png' },
      { name: 'Деньга', value: 'img/logos/denga.png' },
      { name: 'Деньги на дом', value: 'img/logos/denginadom.png' },
      { name: 'Деньги сразу', value: 'img/logos/dengisrazu.png' },
      { name: 'До зарплаты', value: 'img/logos/dozarplati.png' },
      { name: 'ЕКапуста', value: 'img/logos/ekapusta.png' },
      { name: 'Займер', value: 'img/logos/zaymer.png' },
      { name: 'Лайм-Займ', value: 'img/logos/limezaim.png' },
      { name: 'МигКредит', value: 'img/logos/migcredit.png' },
      { name: 'Свои люди', value: 'img/logos/svoiludi.png' },
      { name: 'СМС Финанс', value: 'img/logos/smsfinance.png' },
      { name: 'Срочно деньги', value: 'img/logos/srochnodengi.png' },
      { name: 'Турбозайм', value: 'img/logos/turbozaim.svg' },
      { name: 'Центрофинанс', value: 'img/logos/centrofinans.png' },
      { name: 'CarMoney', value: 'img/logos/carmoney.png' },
      { name: 'CreditPlus', value: 'img/logos/creditplus.png' },
      { name: 'Joymoney', value: 'img/logos/joymoney.png' },
      { name: 'Kviku', value: 'img/logos/kviku.png' },
      { name: 'Max.Credit', value: 'img/logos/maxcredit.png' },
      { name: 'MoneyMan', value: 'img/logos/moneyman.png' },
      { name: 'OneClickMoney', value: 'img/logos/oneclickmoney.png' },
      { name: 'Platiza', value: 'img/logos/platiza.png' },
      { name: 'Rocketman', value: 'img/logos/rocketman.png' },
      { name: 'Webbankir', value: 'img/logos/webbankir.png' },
      { name: 'Zaymigo', value: 'img/logos/zaymigo.png' }
    ] }
  ],

  /* Только то, что сайт действительно показывает. */
  site: [
    { key: 'brand',    label: 'Название сайта', required: true,
      hint: 'Стоит в шапке и в подвале сайта.' },
    { key: 'tagline',  label: 'Строка над главным заголовком',
      hint: 'Мелкая строка с точкой на первом экране, например «24 банка-партнёра».' },
    { key: 'telegram', label: 'Ссылка на Telegram', type: 'url',
      hint: 'Показывается посетителю, если заявка не отправилась: «напишите нам в Telegram». Можно оставить пустым.' }
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
      hint: 'Вставьте ссылку из партнёрки или с сайта банка — панель сама допишет её до полного адреса. Пока пусто — кнопка ведёт на форму заявки на этом же сайте.' }
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
        /* Цвета плашки читаем всегда: у карточки с логотипом от них
           считается цвет крупной цифры. Не прочитать — значит затереть
           выбор клиента дефолтом при следующем сохранении. */
        tone: { bg: (o.tone && o.tone.bg) || '#1B2AE0', ink: (o.tone && o.tone.ink) || '#FFFFFF' },
        /* Векторный знак банка из index.html. В панели не показывается, но
           переживает круговорот, пока у карточки есть логотип. */
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
      var logo = t(c.logo);
      var o = {
        cat: c.group,
        partner: t(c.partner),
        tag: t(c.tag),
        title: t(c.title),
        /* Без логотипа сайт рисует плашку с инициалами — как и панель.
           Старый векторный знак тут только мешал бы: он перебил бы плашку. */
        mark: logo ? t(c.mark) : '',
        logo: logo,
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
      '   Правится через panel.html. Руками тоже можно, но при следующем',
      '   сохранении из панели правки будут перезаписаны.',
      '',
      '   url      — партнёрская ссылка. Пусто — кнопка ведёт на форму заявки.',
      '   tone.bg  — цвет плашки с логотипом. От него же считается цвет крупной',
      '              цифры: сайт сам затемняет его, пока не станет читаемым.',
      '   logo     — файл логотипа или встроенная картинка. Пусто — плашка',
      '              с инициалами банка в цветах tone.',
      '   mark     — id векторного знака из index.html (lg-alfa и т.д.), запас.',
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
