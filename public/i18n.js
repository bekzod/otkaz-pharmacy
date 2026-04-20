(function () {
  const STORAGE_KEY = 'otkaz.lang';
  const SUPPORTED = ['ru', 'uz-Cyrl', 'uz-Latn'];
  const DEFAULT = 'ru';

  const translations = {
    ru: {
      title: 'Otkaz Pharmacy — Аналитика',
      'hero.eyebrow': 'Аналитика лекарств из Telegram',
      'aria.statusOverview': 'Обзор статуса сервиса',
      'aria.counterViews': 'Виды счётчиков лекарств',
      'aria.resolvedFilter': 'Фильтр по статусу решения',
      'aria.language': 'Язык',
      'aria.medicineSearch': 'Поиск лекарства',

      'status.server': 'Сервер',
      'status.crawler': 'Краулер',
      'status.analytics': 'Аналитика',
      'status.lastError': 'Последняя ошибка',
      'status.checking': 'Проверка',
      'status.starting': 'Запуск',
      'status.loadingUptime': 'Загрузка времени работы',
      'status.waitingForStatus': 'Ожидание статуса',
      'status.loading': 'Загрузка',
      'status.currentGroupUnavailable': 'Текущая группа недоступна',
      'status.none': 'Нет',
      'status.online': 'Онлайн',
      'status.unavailable': 'Недоступно',
      'status.unknown': 'Неизвестно',
      'status.error': 'Ошибка',
      'status.uptime': 'Время работы {value}',
      'status.startedAt': 'Запущено {value}',
      'status.currentGroup': 'Текущая группа: {value}',
      'status.iterations': 'Итераций: {n}, групп: {g}',
      'status.requestFailed': 'Запрос статуса не выполнен',
      'status.retrying': 'Повтор попытки',

      'counters.kicker': 'Счётчики',
      'counters.heading': 'Упоминания лекарств',
      'counters.loadingSummary': 'Загрузка счётчиков',

      'view.tradeName': 'По торговому названию',
      'view.name': 'По названию',
      'view.tradeName.title': 'Счётчики по торговому названию',
      'view.name.title': 'Счётчики по названию',
      'view.tradeName.empty':
        'За последние 90 дней нет счётчиков по торговому названию.',
      'view.name.empty': 'За последние 90 дней нет счётчиков по названию.',

      'search.placeholder': 'Поиск по названию лекарства',
      'search.summary': 'Локальный поиск: «{query}». Показано {count} из {total}.',
      'search.noResults': 'По запросу «{query}» ничего не найдено.',
      'actions.openIgnored': 'Открыть игнорируемые тексты',
      'actions.backToCaptured': 'Назад к захваченным текстам',
      'actions.ignoreText': 'Игнорировать',
      'actions.restore': 'Восстановить',
      'table.medicine': 'Лекарство',
      'table.lastReset': 'Дата последнего сброса',
      'table.1d': '1 дн.',
      'table.3d': '3 дн.',
      'table.30d': '30 дн.',
      'table.90d': '90 дн.',
      'table.reset': 'Сброс',
      'table.undoLast': 'Отменить последний',
      'table.ignore': 'Игнорировать',
      'table.more': 'Ещё',
      'table.loading': 'Загрузка счётчиков…',
      'table.loadFailed': 'Не удалось загрузить счётчики.',

      'sort.columnLabel': 'Сортировка по «{column}», сейчас: {state}',
      'sort.state.none': 'не отсортировано',
      'sort.state.asc': 'по возрастанию',
      'sort.state.desc': 'по убыванию',

      'trend.kicker': 'Динамика',
      'trend.heading': 'Ежедневные значения за 90 дней',
      'trend.selectPrompt':
        'Выберите лекарства в таблице, чтобы сравнить их ежедневные значения.',

      'analyticsSummary':
        '{title}. Сортировка по 90-дневному счётчику. Нажмите на строку, чтобы добавить её на график.',
      'chart.loading': 'Загрузка данных за 90 дней…',
      'chart.summary':
        '{n} активных лекарств за последние 90 дней. Значения до последнего сброса каждой строки показаны как ноль.',

      'row.id': 'ID {id}',
      'row.resetAt': 'Сброс: {date}',
      'row.noBaseline': 'Нет точки сброса',
      'row.none': 'Нет',
      'row.resetButton': 'Сброс',
      'row.undoButton': 'Отменить последний',
      'row.ignoreButton': 'Игнорировать',
      'row.ignoreConfirm': 'Игнорировать «{label}»? Строка больше не будет учитываться.',
      'row.ignored': '«{label}» добавлено в список игнорируемых.',
      'row.addCommentButton': 'Добавить комментарий',
      'row.editCommentButton': 'Изменить комментарий',
      'row.commentPrompt': 'Комментарий для «{label}» (оставьте пустым, чтобы удалить):',
      'row.commentSaved': 'Комментарий сохранён для «{label}».',
      'row.commentRemoved': 'Комментарий удалён для «{label}».',
      'row.resolveButton': 'Отметить решённым',
      'row.unresolveButton': 'Пометить нерешённым',
      'row.resolved': 'Решено',
      'row.resolvedAt': 'Решено: {date}',
      'row.resolvedToast': '«{label}» отмечено как решённое.',
      'row.unresolvedToast': 'Решение снято для «{label}».',

      'filter.all': 'Все',
      'filter.resolved': 'Решённые',
      'filter.unresolved': 'Нерешённые',

      'reset.created': 'Сброс создан для «{label}».',
      'reset.removed': 'Последний сброс удалён для «{label}».',

      'copy.hint': 'Нажмите, чтобы скопировать',
      'copy.success': 'Скопировано: «{label}»',
      'copy.failed': 'Не удалось скопировать',

      notAvailable: 'Недоступно',
    },

    'uz-Cyrl': {
      title: 'Otkaz Pharmacy — Аналитика',
      'hero.eyebrow': 'Telegram’даги дори аналитикаси',
      'aria.statusOverview': 'Хизмат ҳолатини кўриш',
      'aria.counterViews': 'Дори ҳисоблагичлар кўриниши',
      'aria.resolvedFilter': 'Ҳал қилинганлик бўйича фильтр',
      'aria.language': 'Тил',
      'aria.medicineSearch': 'Дорини қидириш',

      'status.server': 'Сервер',
      'status.crawler': 'Краулер',
      'status.analytics': 'Аналитика',
      'status.lastError': 'Охирги хатолик',
      'status.checking': 'Текширилмоқда',
      'status.starting': 'Ишга тушмоқда',
      'status.loadingUptime': 'Ишлаш вақти юкланмоқда',
      'status.waitingForStatus': 'Ҳолат кутилмоқда',
      'status.loading': 'Юкланмоқда',
      'status.currentGroupUnavailable': 'Жорий гуруҳ мавжуд эмас',
      'status.none': 'Йўқ',
      'status.online': 'Онлайн',
      'status.unavailable': 'Мавжуд эмас',
      'status.unknown': 'Номаълум',
      'status.error': 'Хатолик',
      'status.uptime': 'Ишлаш вақти: {value}',
      'status.startedAt': 'Ишга туширилган: {value}',
      'status.currentGroup': 'Жорий гуруҳ: {value}',
      'status.iterations': 'Итерациялар: {n}, гуруҳлар: {g}',
      'status.requestFailed': 'Ҳолат сўрови бажарилмади',
      'status.retrying': 'Қайта уринмоқда',

      'counters.kicker': 'Ҳисоблагичлар',
      'counters.heading': 'Дори эслатмалари',
      'counters.loadingSummary': 'Ҳисоблагичлар юкланмоқда',

      'view.tradeName': 'Савдо номи бўйича',
      'view.name': 'Номи бўйича',
      'view.tradeName.title': 'Савдо номи бўйича ҳисоблагичлар',
      'view.name.title': 'Номи бўйича ҳисоблагичлар',
      'view.tradeName.empty':
        'Сўнгги 90 кунда савдо номи бўйича ҳисоблагичлар мавжуд эмас.',
      'view.name.empty': 'Сўнгги 90 кунда ном бўйича ҳисоблагичлар мавжуд эмас.',

      'search.placeholder': 'Дори номи бўйича қидириш',
      'search.summary': 'Локал қидирув: «{query}». {total} тадан {count} таси кўрсатилмоқда.',
      'search.noResults': '«{query}» бўйича ҳеч нарса топилмади.',
      'actions.openIgnored': 'Эътиборга олинмайдиган матнларни очиш',
      'actions.backToCaptured': 'Қайд этилган матнларга қайтиш',
      'actions.ignoreText': 'Эътиборга олмаслик',
      'actions.restore': 'Қайта тиклаш',
      'table.medicine': 'Дори',
      'table.lastReset': 'Охирги сброс санаси',
      'table.1d': '1 кун',
      'table.3d': '3 кун',
      'table.30d': '30 кун',
      'table.90d': '90 кун',
      'table.reset': 'Сброс',
      'table.undoLast': 'Охиргисини бекор қилиш',
      'table.ignore': 'Эътиборга олмаслик',
      'table.more': 'Яна',
      'table.loading': 'Ҳисоблагичлар юкланмоқда…',
      'table.loadFailed': 'Ҳисоблагичларни юклаб бўлмади.',

      'sort.columnLabel': '«{column}» бўйича сортировка, ҳозир: {state}',
      'sort.state.none': 'сортировка йўқ',
      'sort.state.asc': 'ўсиш бўйича',
      'sort.state.desc': 'камайиш бўйича',

      'trend.kicker': 'Динамика',
      'trend.heading': '90 кунлик кунлик қийматлар',
      'trend.selectPrompt':
        'Кунлик қийматларни таққослаш учун жадвалдан дори танланг.',

      'analyticsSummary':
        '{title}. 90 кунлик ҳисоблагич бўйича тартибланган. Қаторни графикка қўшиш учун босинг.',
      'chart.loading': '90 кунлик маълумотлар юкланмоқда…',
      'chart.summary':
        'Сўнгги 90 кунда {n} та фаол дори. Ҳар бир қаторнинг охирги сросидан олдинги қийматлар ноль кўрсатилган.',

      'row.id': 'ID {id}',
      'row.resetAt': 'Сброс: {date}',
      'row.noBaseline': 'Сброс нуқтаси йўқ',
      'row.none': 'Йўқ',
      'row.resetButton': 'Сброс',
      'row.undoButton': 'Охиргисини бекор қилиш',
      'row.ignoreButton': 'Эътиборга олмаслик',
      'row.ignoreConfirm': '«{label}» эътиборга олинмасинми? Бу қатор бошқа ҳисобга олинмайди.',
      'row.ignored': '«{label}» эътиборга олинмайдиганлар рўйхатига қўшилди.',
      'row.addCommentButton': 'Изоҳ қўшиш',
      'row.editCommentButton': 'Изоҳни таҳрирлаш',
      'row.commentPrompt': '«{label}» учун изоҳ (бўш қолдирсангиз ўчирилади):',
      'row.commentSaved': '«{label}» учун изоҳ сақланди.',
      'row.commentRemoved': '«{label}» учун изоҳ ўчирилди.',
      'row.resolveButton': 'Ҳал қилинган деб белгилаш',
      'row.unresolveButton': 'Ҳал қилинмаган деб белгилаш',
      'row.resolved': 'Ҳал қилинган',
      'row.resolvedAt': 'Ҳал қилинган: {date}',
      'row.resolvedToast': '«{label}» ҳал қилинган деб белгиланди.',
      'row.unresolvedToast': '«{label}» учун ҳал қилинганлик олиб ташланди.',

      'filter.all': 'Барчаси',
      'filter.resolved': 'Ҳал қилинганлар',
      'filter.unresolved': 'Ҳал қилинмаганлар',

      'reset.created': '«{label}» учун сброс яратилди.',
      'reset.removed': '«{label}» учун охирги сброс олиб ташланди.',

      'copy.hint': 'Нусхалаш учун босинг',
      'copy.success': 'Нусхаланди: «{label}»',
      'copy.failed': 'Нусхалаб бўлмади',

      notAvailable: 'Мавжуд эмас',
    },

    'uz-Latn': {
      title: 'Otkaz Pharmacy — Tahlil',
      'hero.eyebrow': 'Telegramdagi dori tahlili',
      'aria.statusOverview': 'Xizmat holati ko‘rinishi',
      'aria.counterViews': 'Dori hisoblagichlari ko‘rinishi',
      'aria.resolvedFilter': 'Hal qilinganlik bo‘yicha filtr',
      'aria.language': 'Til',
      'aria.medicineSearch': 'Dorini qidirish',

      'status.server': 'Server',
      'status.crawler': 'Krauler',
      'status.analytics': 'Tahlil',
      'status.lastError': 'Oxirgi xatolik',
      'status.checking': 'Tekshirilmoqda',
      'status.starting': 'Ishga tushmoqda',
      'status.loadingUptime': 'Ishlash vaqti yuklanmoqda',
      'status.waitingForStatus': 'Holat kutilmoqda',
      'status.loading': 'Yuklanmoqda',
      'status.currentGroupUnavailable': 'Joriy guruh mavjud emas',
      'status.none': 'Yo‘q',
      'status.online': 'Onlayn',
      'status.unavailable': 'Mavjud emas',
      'status.unknown': 'Noma’lum',
      'status.error': 'Xatolik',
      'status.uptime': 'Ishlash vaqti: {value}',
      'status.startedAt': 'Ishga tushirilgan: {value}',
      'status.currentGroup': 'Joriy guruh: {value}',
      'status.iterations': 'Iteratsiyalar: {n}, guruhlar: {g}',
      'status.requestFailed': 'Holat so‘rovi bajarilmadi',
      'status.retrying': 'Qayta urinilmoqda',

      'counters.kicker': 'Hisoblagichlar',
      'counters.heading': 'Dori eslatmalari',
      'counters.loadingSummary': 'Hisoblagichlar yuklanmoqda',

      'view.tradeName': 'Savdo nomi bo‘yicha',
      'view.name': 'Nomi bo‘yicha',
      'view.tradeName.title': 'Savdo nomi bo‘yicha hisoblagichlar',
      'view.name.title': 'Nomi bo‘yicha hisoblagichlar',
      'view.tradeName.empty':
        'So‘nggi 90 kunda savdo nomi bo‘yicha hisoblagichlar mavjud emas.',
      'view.name.empty':
        'So‘nggi 90 kunda nom bo‘yicha hisoblagichlar mavjud emas.',

      'search.placeholder': 'Dori nomi bo‘yicha qidirish',
      'search.summary': 'Lokal qidiruv: «{query}». {total} tadan {count} tasi ko‘rsatilmoqda.',
      'search.noResults': '«{query}» bo‘yicha hech narsa topilmadi.',
      'actions.openIgnored': 'E’tiborga olinmaydigan matnlarni ochish',
      'actions.backToCaptured': 'Qayd etilgan matnlarga qaytish',
      'actions.ignoreText': 'E’tiborga olmaslik',
      'actions.restore': 'Qayta tiklash',
      'table.medicine': 'Dori',
      'table.lastReset': 'Oxirgi sbros sanasi',
      'table.1d': '1 kun',
      'table.3d': '3 kun',
      'table.30d': '30 kun',
      'table.90d': '90 kun',
      'table.reset': 'Sbros',
      'table.undoLast': 'Oxirgisini bekor qilish',
      'table.ignore': 'E’tiborga olmaslik',
      'table.more': 'Yana',
      'table.loading': 'Hisoblagichlar yuklanmoqda…',
      'table.loadFailed': 'Hisoblagichlarni yuklab bo‘lmadi.',

      'sort.columnLabel': '«{column}» bo‘yicha sortlash, hozir: {state}',
      'sort.state.none': 'sortlanmagan',
      'sort.state.asc': 'o‘sish bo‘yicha',
      'sort.state.desc': 'kamayish bo‘yicha',

      'trend.kicker': 'Dinamika',
      'trend.heading': '90 kunlik kunlik qiymatlar',
      'trend.selectPrompt':
        'Kunlik qiymatlarni taqqoslash uchun jadvaldan dorilarni tanlang.',

      'analyticsSummary':
        '{title}. 90 kunlik hisoblagich bo‘yicha tartiblangan. Qatorni grafikka qo‘shish uchun bosing.',
      'chart.loading': '90 kunlik ma’lumotlar yuklanmoqda…',
      'chart.summary':
        'So‘nggi 90 kunda {n} ta faol dori. Har bir qatorning oxirgi sbrosigacha bo‘lgan qiymatlar nol ko‘rinishida.',

      'row.id': 'ID {id}',
      'row.resetAt': 'Sbros: {date}',
      'row.noBaseline': 'Sbros nuqtasi yo‘q',
      'row.none': 'Yo‘q',
      'row.resetButton': 'Sbros',
      'row.undoButton': 'Oxirgisini bekor qilish',
      'row.ignoreButton': 'E’tiborga olmaslik',
      'row.ignoreConfirm': '«{label}» e’tiborga olinmasinmi? Bu qator boshqa hisobga olinmaydi.',
      'row.ignored': '«{label}» e’tiborga olinmaydiganlar ro‘yxatiga qo‘shildi.',
      'row.addCommentButton': 'Izoh qo‘shish',
      'row.editCommentButton': 'Izohni tahrirlash',
      'row.commentPrompt': '«{label}» uchun izoh (bo‘sh qoldirsangiz o‘chiriladi):',
      'row.commentSaved': '«{label}» uchun izoh saqlandi.',
      'row.commentRemoved': '«{label}» uchun izoh o‘chirildi.',
      'row.resolveButton': 'Hal qilingan deb belgilash',
      'row.unresolveButton': 'Hal qilinmagan deb belgilash',
      'row.resolved': 'Hal qilingan',
      'row.resolvedAt': 'Hal qilingan: {date}',
      'row.resolvedToast': '«{label}» hal qilingan deb belgilandi.',
      'row.unresolvedToast': '«{label}» uchun hal qilinganlik olib tashlandi.',

      'filter.all': 'Barchasi',
      'filter.resolved': 'Hal qilinganlar',
      'filter.unresolved': 'Hal qilinmaganlar',

      'reset.created': '«{label}» uchun sbros yaratildi.',
      'reset.removed': '«{label}» uchun oxirgi sbros olib tashlandi.',

      'copy.hint': 'Nusxalash uchun bosing',
      'copy.success': 'Nusxalandi: «{label}»',
      'copy.failed': 'Nusxalab bo‘lmadi',

      notAvailable: 'Mavjud emas',
    },
  };

  function getLang() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (SUPPORTED.includes(stored)) return stored;
    } catch (error) {
      /* localStorage may be unavailable (private mode etc.) */
    }
    return DEFAULT;
  }

  function setLang(lang) {
    if (!SUPPORTED.includes(lang)) return;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (error) {
      /* ignore */
    }
    document.documentElement.lang = lang;
  }

  function t(key, params) {
    const dict = translations[getLang()] || translations[DEFAULT];
    const template = dict[key] != null ? dict[key] : translations[DEFAULT][key];
    if (template == null) return key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (_, name) =>
      params[name] == null ? '' : String(params[name]),
    );
  }

  function applyStaticTranslations(root) {
    const scope = root || document;

    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });

    scope.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.dataset.i18nAttr.split(';').forEach((pair) => {
        const [attr, key] = pair.split(':').map((part) => part && part.trim());
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });

    const titleEl = document.querySelector('title');
    if (titleEl && titleEl.dataset.i18n) {
      document.title = t(titleEl.dataset.i18n);
    }
  }

  window.i18n = {
    t,
    getLang,
    setLang,
    applyStaticTranslations,
    SUPPORTED,
    DEFAULT,
  };
})();
