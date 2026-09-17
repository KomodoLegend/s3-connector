(() => {
  const STRINGS = {
    en: {
      "app.title": "S3 Connector",
      "sidebar.tagline": "Connections and buckets",
      "btn.new.title": "New connection",
      "btn.exportAll": "Export…",
      "btn.import": "Import…",
      "search.connections": "Search connections…",
      "hint.context": "Right-click a connection for actions",
      "empty.title": "No connection selected",
      "empty.body": "Create a new one or select from the left. Right-click opens endpoint data view.",
      "editor.connection": "Connection",
      "btn.export": "Export",
      "btn.edit": "Edit",
      "btn.test": "Test",
      "btn.cancel": "Cancel",
      "btn.save": "Save",
      "btn.open": "Open",
      "btn.delete": "Delete",
      "field.name": "Name",
      "field.endpoint": "Endpoint",
      "field.region": "Region",
      "field.options": "Options",
      "field.notes": "Notes",
      "field.notes.ph": "Optional",
      "field.bucketName": "Bucket name",
      "field.accessKey": "Access Key",
      "field.secretKey": "Secret Key",
      "option.useSsl": "Use SSL",
      "option.pathStyle": "Path-style",
      "ph.name": "Prod MinIO",
      "ph.endpoint": "https://s3.example.com or s3.example.com:9000",
      "ph.region": "us-east-1",
      "ph.createBucket": "my-bucket",
      "ph.browsePrefix": "prefix/",
      "eye.show": "Show password",
      "eye.hide": "Hide password",
      "eye.title": "Show / hide",
      "buckets.title": "Buckets",
      "buckets.refresh": "Refresh",
      "buckets.refresh.title": "Refresh list from S3",
      "buckets.create": "+ create",
      "search.buckets": "Search buckets…",
      "ctx.view": "View all data",
      "ctx.browse": "Object browser",
      "ctx.edit": "Edit",
      "ctx.test": "Test connection",
      "ctx.export": "Export this connection",
      "ctx.delete": "Delete",
      "export.title": "Export to JSON",
      "export.what": "What to export",
      "export.all": "All connections",
      "export.one": "One connection",
      "export.secrets": "Include access/secret keys",
      "export.download": "Download JSON",
      "import.title": "Import JSON",
      "import.file": "File:",
      "import.replace": "Replace all existing",
      "import.ok": "Import",
      "data.close": "Close",
      "auth.chatHint": "For chat (Mattermost etc.)",
      "auth.copy": "Copy",
      "auth.copy.title": "Copy auth block",
      "browse.up": "Up one level",
      "browse.refresh": "Refresh",
      "browse.upload": "Upload file…",
      "th.name": "Name",
      "th.size": "Size",
      "th.date": "Date",
      "th.created": "Created",
      "delBucket.title": "Delete bucket on S3",
      "delBucket.body": "The bucket and all contents will be deleted on the server. Type the name to confirm:",
      "delBucket.ph": "type the exact name",
      "delBucket.ok": "Delete",
      "createBucket.title": "Create bucket",
      "createBucket.label": "Bucket:",
      "createBucket.ok": "Create",
      "lang.title": "Language",
      "status.ok": "Connection OK",
      "status.err": "No connection",
      "status.pending": "Checking…",
      "status.unknown": "Status unknown",
      "list.empty": "Empty — press +",
      "list.none": "Nothing found",
      "list.unnamed": "unnamed",
      "buckets.loading": "Loading buckets from S3…",
      "buckets.saveFirst": "Save the connection to load buckets",
      "buckets.none": "No buckets on the endpoint (or no ListBuckets permission)",
      "buckets.noneShort": "Nothing found",
      "create.msg.open": "Bucket unavailable. Create on S3 and open?",
      "create.msg.new": "A new bucket will be created on S3.",
      "create.needName": "Enter a bucket name",
      "create.creating": "Creating…",
      "create.done": 'Bucket "{0}" created',
      "create.fail": "Failed to create bucket: {0}",
      "saveFirst": "Save the connection first",
      "openingBucket": "Opening bucket…",
      "data.title": "Connection data",
      "auth.copied": "Copied — paste into Mattermost",
      "auth.copyFail": "Failed to copy",
      "yes": "yes",
      "no": "no",
      "browse.title": "Object browser",
      "browse.bucket": "Bucket: {0}",
      "browse.loading": "Loading…",
      "browse.noBucketsOpt": "(no buckets)",
      "browse.noBuckets": "No buckets",
      "browse.empty": "Empty",
      "browse.dl": "Download",
      "browse.folder": "folder",
      "browse.root": "Bucket root",
      "browse.createdMeta": "Created: {0}",
      "browse.prefixMeta": "Prefix: {0}",
      "browse.uploading": "Uploading {0}…",
      "browse.uploaded": "Uploaded: {0}",
      "browse.deleting": "Deleting on S3…",
      "del.done": 'Bucket "{0}" deleted from S3',
      "newConnection": "New connection",
      "fillAndSave": "Fill in the fields and save",
      "editing": "Editing settings",
      "nameEndpointRequired": "Name and endpoint are required",
      "saving": "Saving…",
      "saved": "Saved",
      "testing": "Testing…",
      "exported": "Exported",
      "jsonDownloaded": "JSON downloaded",
      "import.result": "Import: +{0}, updated {1}",
      "confirm.deleteConn": "Delete this connection?",
      "dash": "—",
    },
    ru: {
      "app.title": "S3 Connector",
      "sidebar.tagline": "Соединения и бакеты",
      "btn.new.title": "Новое соединение",
      "btn.exportAll": "Экспорт…",
      "btn.import": "Импорт…",
      "search.connections": "Поиск соединений…",
      "hint.context": "ПКМ по соединению — меню действий",
      "empty.title": "Нет выбранного соединения",
      "empty.body": "Создайте новое или выберите слева. Правый клик открывает просмотр данных эндпоинта.",
      "editor.connection": "Соединение",
      "btn.export": "Экспорт",
      "btn.edit": "Редактировать",
      "btn.test": "Проверить",
      "btn.cancel": "Отмена",
      "btn.save": "Сохранить",
      "btn.open": "Открыть",
      "btn.delete": "Удалить",
      "field.name": "Имя",
      "field.endpoint": "Endpoint",
      "field.region": "Region",
      "field.options": "Опции",
      "field.notes": "Заметки",
      "field.notes.ph": "Опционально",
      "field.bucketName": "Имя бакета",
      "field.accessKey": "Access Key",
      "field.secretKey": "Secret Key",
      "option.useSsl": "Use SSL",
      "option.pathStyle": "Path-style",
      "ph.name": "Prod MinIO",
      "ph.endpoint": "https://s3.example.com или s3.example.com:9000",
      "ph.region": "us-east-1",
      "ph.createBucket": "my-bucket",
      "ph.browsePrefix": "prefix/",
      "eye.show": "Показать пароль",
      "eye.hide": "Скрыть пароль",
      "eye.title": "Показать / скрыть",
      "buckets.title": "Бакеты",
      "buckets.refresh": "Обновить",
      "buckets.refresh.title": "Обновить список с S3",
      "buckets.create": "+ создать",
      "search.buckets": "Поиск бакетов…",
      "ctx.view": "Смотреть все данные",
      "ctx.browse": "Браузер объектов",
      "ctx.edit": "Редактировать",
      "ctx.test": "Проверить соединение",
      "ctx.export": "Экспорт этого соединения",
      "ctx.delete": "Удалить",
      "export.title": "Экспорт в JSON",
      "export.what": "Что экспортировать",
      "export.all": "Все соединения",
      "export.one": "Одно соединение",
      "export.secrets": "Включить access/secret keys",
      "export.download": "Скачать JSON",
      "import.title": "Импорт JSON",
      "import.file": "Файл:",
      "import.replace": "Заменить все существующие",
      "import.ok": "Импортировать",
      "data.close": "Закрыть",
      "auth.chatHint": "Для чата (Mattermost и др.)",
      "auth.copy": "Копировать",
      "auth.copy.title": "Скопировать блок авторизации",
      "browse.up": "На уровень выше",
      "browse.refresh": "Обновить",
      "browse.upload": "Загрузить файл…",
      "th.name": "Имя",
      "th.size": "Размер",
      "th.date": "Дата",
      "th.created": "Создан",
      "delBucket.title": "Удалить бакет на S3",
      "delBucket.body": "Бакет и всё содержимое будут удалены на сервере. Для подтверждения введите имя:",
      "delBucket.ph": "введите имя точно",
      "delBucket.ok": "Удалить",
      "createBucket.title": "Создать бакет",
      "createBucket.label": "Бакет:",
      "createBucket.ok": "Создать",
      "lang.title": "Язык",
      "status.ok": "Соединение OK",
      "status.err": "Нет соединения",
      "status.pending": "Проверка…",
      "status.unknown": "Статус неизвестен",
      "list.empty": "Пока пусто — нажмите +",
      "list.none": "Ничего не найдено",
      "list.unnamed": "без имени",
      "buckets.loading": "Загрузка бакетов с S3…",
      "buckets.saveFirst": "Сохраните соединение, чтобы загрузить бакеты",
      "buckets.none": "На эндпоинте нет бакетов (или нет прав ListBuckets)",
      "buckets.noneShort": "Ничего не найдено",
      "create.msg.open": "Бакет недоступен. Создать на S3 и открыть?",
      "create.msg.new": "Новый бакет будет создан на S3.",
      "create.needName": "Укажите имя бакета",
      "create.creating": "Создание…",
      "create.done": "Бакет «{0}» создан",
      "create.fail": "Не удалось создать бакет: {0}",
      "saveFirst": "Сначала сохраните соединение",
      "openingBucket": "Открытие бакета…",
      "data.title": "Данные соединения",
      "auth.copied": "Скопировано — можно вставить в Mattermost",
      "auth.copyFail": "Не удалось скопировать",
      "yes": "да",
      "no": "нет",
      "browse.title": "Браузер объектов",
      "browse.bucket": "Бакет: {0}",
      "browse.loading": "Загрузка…",
      "browse.noBucketsOpt": "(нет бакетов)",
      "browse.noBuckets": "Нет бакетов",
      "browse.empty": "Пусто",
      "browse.dl": "Скачать",
      "browse.folder": "папка",
      "browse.root": "Корень бакета",
      "browse.createdMeta": "Создан: {0}",
      "browse.prefixMeta": "Путь: {0}",
      "browse.uploading": "Загрузка {0}…",
      "browse.uploaded": "Загружено: {0}",
      "browse.deleting": "Удаление на S3…",
      "del.done": "Бакет «{0}» удалён с S3",
      "newConnection": "Новое соединение",
      "fillAndSave": "Заполните поля и сохраните",
      "editing": "Редактирование настроек",
      "nameEndpointRequired": "Имя и endpoint обязательны",
      "saving": "Сохранение…",
      "saved": "Сохранено",
      "testing": "Проверка…",
      "exported": "Экспортировано",
      "jsonDownloaded": "JSON скачан",
      "import.result": "Импорт: +{0}, обновлено {1}",
      "confirm.deleteConn": "Удалить соединение?",
      "dash": "—",
    },
  };

  const STORAGE_KEY = "s3-connector-lang";
  const listeners = [];

  function detectLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "ru" || saved === "en") return saved;
    } catch {
      /* ignore */
    }
    const nav = (navigator.language || "").toLowerCase();
    return nav.startsWith("ru") ? "ru" : "en";
  }

  let lang = detectLang();

  function t(key, ...args) {
    const table = STRINGS[lang] || STRINGS.en;
    let s = table[key] ?? STRINGS.en[key] ?? key;
    args.forEach((v, i) => {
      s = s.replaceAll(`{${i}}`, String(v));
    });
    return s;
  }

  function applyDom(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      if (el.childElementCount && el.querySelector("input,select,textarea,svg,button")) {
        // leave structure; prefer dedicated child spans
        return;
      }
      el.textContent = t(key);
    });
    root.querySelectorAll("[data-i18n-text]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n-text"));
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    root.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    });
    root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
    });
    document.documentElement.lang = lang;
    document.title = t("app.title");
    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.lang === lang);
    });
  }

  function setLang(next) {
    if (next !== "ru" && next !== "en") return;
    if (next === lang) {
      applyDom();
      return;
    }
    lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
    applyDom();
    listeners.forEach((fn) => {
      try {
        fn(lang);
      } catch {
        /* ignore */
      }
    });
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  function getLang() {
    return lang;
  }

  window.I18n = { t, setLang, getLang, applyDom, onChange };
})();
