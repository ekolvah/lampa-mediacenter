(function () {
  'use strict';

  // Фильтр раздач («Смотреть → Торренты → Фильтр») применяется только внутри
  // экрана одного фильма — на карточках в списках (Главная/Избранное/подборки)
  // не видно, что под текущий фильтр у фильма не проходит ни одна раздача.
  // Плагин докидывает на такие карточки метку и делает постер чёрно-белым.
  //
  // Источник раздач — Lampa.Parser.get, тот же метод, которым пользуется штатный
  // экран «Торренты» (см. src/components/torrents.js в зеркале движка): это даёт
  // тот же бэкенд (jackett/prowlarr/torrserver — какой у пользователя настроен) и
  // тот же формат ответа без необходимости повторять сборку запроса вручную.
  //
  // Вердикт обязан совпадать с тем, что реально покажет экран «Торренты», поэтому
  // ниже воспроизведена не только проверка качества, а вся функция filtred():
  // движок требует прохождения ВСЕХ активных измерений фильтра сразу
  // (`return nopass ? false : passed`), а не только качества. Проверять одно
  // качество нельзя: раздача 2160p, отсеянная по языку, давала бы «раздачи есть»
  // там, где штатный экран показывает пусто.
  //
  // Раздачи запрашиваются только по глобальному фильтру torrents_filter — если у
  // конкретного фильма выставлен персональный оверрайд (torrents_filter_data),
  // он игнорируется: у списочных карточек KP нет number_of_seasons, из-за чего
  // локально посчитанный cardID может не совпасть с тем, что вычислит сам экран
  // «Торренты» для сериала. Оверрайды — редкий кейс, глобальный фильтр покрывает
  // основной сценарий.

  var CACHE_KEY = 'torrent_filter_badge_cache';
  var CACHE_MAX_ENTRIES = 500;
  var CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  var MAX_CONCURRENT = 2;
  // Сколько ждём, пока Lampa достроит внутренний DOM карточки (см. waitForView).
  var VIEW_WAIT_MS = 60 * 1000;

  var QUALITY_LABELS = { '4k': '4K', '1080p': '1080p', '720p': '720p' };

  // Соответствие «метка языка в фильтре → код», как в src/components/torrents/lang.js.
  // Порядок не важен: движок берёт код по индексу метки, здесь — по самой метке,
  // результат тот же, а от расхождения в порядке список не ломается.
  var LANGS = [
    { t: 'filter_lang_ru', c: 'ru' }, { t: 'filter_lang_uk', c: 'uk' }, { t: 'filter_lang_en', c: 'en' },
    { t: 'filter_lang_be', c: 'be' }, { t: 'filter_lang_zh', c: 'zh|cn' }, { t: 'filter_lang_ja', c: 'ja' },
    { t: 'filter_lang_ko', c: 'ko' }, { t: 'filter_lang_af', c: 'af' }, { t: 'filter_lang_sq', c: 'sq' },
    { t: 'filter_lang_ar', c: 'ar' }, { t: 'filter_lang_az', c: 'az' }, { t: 'filter_lang_hy', c: 'hy' },
    { t: 'filter_lang_ba', c: 'ba' }, { t: 'filter_lang_bg', c: 'bg' }, { t: 'filter_lang_bn', c: 'bn' },
    { t: 'filter_lang_bs', c: 'bs' }, { t: 'filter_lang_ca', c: 'ca' }, { t: 'filter_lang_ce', c: 'ce' },
    { t: 'filter_lang_cs', c: 'cs' }, { t: 'filter_lang_da', c: 'da' }, { t: 'filter_lang_ka', c: 'ka' },
    { t: 'filter_lang_de', c: 'de' }, { t: 'filter_lang_el', c: 'el' }, { t: 'filter_lang_es', c: 'es' },
    { t: 'filter_lang_et', c: 'et' }, { t: 'filter_lang_fa', c: 'fa' }, { t: 'filter_lang_fi', c: 'fi' },
    { t: 'filter_lang_fr', c: 'fr' }, { t: 'filter_lang_ga', c: 'ga' }, { t: 'filter_lang_gl', c: 'gl' },
    { t: 'filter_lang_gn', c: 'gn' }, { t: 'filter_lang_he', c: 'he' }, { t: 'filter_lang_hi', c: 'hi' },
    { t: 'filter_lang_hr', c: 'hr' }, { t: 'filter_lang_hu', c: 'hu' }, { t: 'filter_lang_id', c: 'id' },
    { t: 'filter_lang_is', c: 'is' }, { t: 'filter_lang_it', c: 'it' }, { t: 'filter_lang_kk', c: 'kk' },
    { t: 'filter_lang_ks', c: 'ks' }, { t: 'filter_lang_ku', c: 'ku' }, { t: 'filter_lang_ky', c: 'ky' },
    { t: 'filter_lang_lt', c: 'lt' }, { t: 'filter_lang_lv', c: 'lv' }, { t: 'filter_lang_mi', c: 'mi' },
    { t: 'filter_lang_mk', c: 'mk' }, { t: 'filter_lang_mn', c: 'mn' }, { t: 'filter_lang_mt', c: 'mt' },
    { t: 'filter_lang_no', c: 'no|nb|nn' }, { t: 'filter_lang_ne', c: 'ne' }, { t: 'filter_lang_nl', c: 'nl' },
    { t: 'filter_lang_pa', c: 'pa' }, { t: 'filter_lang_pl', c: 'pl' }, { t: 'filter_lang_ps', c: 'ps' },
    { t: 'filter_lang_pt', c: 'pt' }, { t: 'filter_lang_ro', c: 'ro' }, { t: 'filter_lang_si', c: 'si' },
    { t: 'filter_lang_sk', c: 'sk' }, { t: 'filter_lang_sl', c: 'sl' }, { t: 'filter_lang_sm', c: 'sm' },
    { t: 'filter_lang_so', c: 'so' }, { t: 'filter_lang_sr', c: 'sr' }, { t: 'filter_lang_sv', c: 'sv' },
    { t: 'filter_lang_sw', c: 'sw' }, { t: 'filter_lang_ta', c: 'ta' }, { t: 'filter_lang_tg', c: 'tg' },
    { t: 'filter_lang_th', c: 'th' }, { t: 'filter_lang_tk', c: 'tk' }, { t: 'filter_lang_tr', c: 'tr' },
    { t: 'filter_lang_tt', c: 'tt' }, { t: 'filter_lang_ur', c: 'ur' }, { t: 'filter_lang_uz', c: 'uz' },
    { t: 'filter_lang_vi', c: 'vi' }, { t: 'filter_lang_yi', c: 'yi' }
  ];

  function tr(key) {
    return Lampa.Lang.translate(key);
  }

  function langCode(label) {
    for (var i = 0; i < LANGS.length; i++) {
      if (tr(LANGS[i].t) === label) return LANGS[i].c;
    }
    // Движок при неизвестной метке считает измерение пройденным (c === undefined
    // → `else any = true`) — повторяем это, а не «ничего не подошло».
    return null;
  }

  // Первые четыре позиции filter_items.voice в движке — фиксированные категории,
  // остальные подставляются динамически из найденных раздач.
  function voiceCategory(label) {
    var cats = [
      'torrent_parser_voice_dubbing',
      'torrent_parser_voice_polyphonic',
      'torrent_parser_voice_two',
      'torrent_parser_voice_amateur'
    ];
    for (var i = 0; i < cats.length; i++) {
      if (tr(cats[i]) === label) return i + 1;
    }
    return -1;
  }

  function yearItems() {
    var out = [tr('torrent_parser_any_two')];
    var y = new Date().getFullYear();
    var i = 20;
    while (i--) out.push(y - (19 - i) + '');
    return out;
  }

  function toArray(v) {
    if (v === undefined || v === null || v === '') return [];
    return Array.isArray(v) ? v : [v];
  }

  // Порт filtred() из src/components/torrents.js — регекспы скопированы байт-в-байт
  // (сверено с живым app.min.js устройства), включая квирк [$] внутри класса
  // символов: там это буквальный доллар, а не якорь конца строки. Не выпрямляем —
  // цель совпадать с тем, что реально покажет штатный экран, а не с тем, что
  // «правильно» по regex.
  function passesFilter(element, filter) {
    var passed = false;
    var nopass = false;
    var title = (element.Title || '').toLowerCase();
    var tracker = element.Tracker || '';

    function test(search, test_index) {
      if (test_index) return title.indexOf(search) >= 0;
      return new RegExp(search).test(title);
    }

    function check(search, invert) {
      if (test(search)) {
        if (invert) nopass = true;
        else passed = true;
      } else {
        if (invert) passed = true;
        else nopass = true;
      }
    }

    function includes(type, arr) {
      if (!arr.length) return;

      var any = false;

      arr.forEach(function (a) {
        if (type == 'quality') {
          if (a == '4k' && test('(4k|uhd)[ |\\]|,|$]|2160[pр]|ultrahd')) any = true;
          if (a == '1080p' && test('fullhd|1080[pр]')) any = true;
          if (a == '720p' && test('720[pр]')) any = true;
        }
        if (type == 'voice') {
          var p = voiceCategory(a);
          var n = element.info && element.info.voices
            ? element.info.voices.map(function (v) { return v.toLowerCase(); })
            : [];

          if (p == 1) {
            if (test('дублирован|дубляж|  apple| dub| d[,| |$]|[,|\\s]дб[,|\\s|$]')) any = true;
          } else if (p == 2) {
            if (test('многоголос| p[,| |$]|[,|\\s](лм|пм)[,|\\s|$]')) any = true;
          } else if (p == 3) {
            if (test('двухголос|двуголос| l2[,| |$]|[,|\\s](лд|пд)[,|\\s|$]')) any = true;
          } else if (p == 4) {
            if (test('любитель|авторский| l1[,| |$]|[,|\\s](ло|ап)[,|\\s|$]')) any = true;
          } else if (test(a.toLowerCase(), true)) any = true;
          else if (n.length && n.indexOf(a.toLowerCase()) >= 0) any = true;
        }
        if (type == 'lang') {
          var c = langCode(a);

          if (c) {
            if (element.languages) {
              if (element.languages.find(function (l) { return l.toLowerCase().slice(0, 2) == c; })) any = true;
            } else if (title.indexOf(c) >= 0) any = true;
          } else any = true;
        }
        if (type == 'tracker') {
          if (tracker.split(',').find(function (t) { return t.trim().toLowerCase() == a.toLowerCase(); })) any = true;
        }
      });

      if (any) passed = true;
      else nopass = true;
    }

    includes('quality', toArray(filter.quality));
    includes('voice', toArray(filter.voice));
    includes('tracker', toArray(filter.tracker));
    includes('lang', toArray(filter.lang));

    if (filter.hdr) check('[\\[| ]hdr[10| |\\]|,|$]', filter.hdr !== 1);

    if (filter.dv == 0) check(tr('torrent_parser_no_choice'), filter.dv !== 1);
    else if (filter.dv == 1) check('dolby vision');
    else if (filter.dv == 2) check('dolby vision tv');
    else if (filter.dv == 3) check('dolby vision', filter.dv !== 0);

    if (filter.sub) check(' sub|[,|\\s]ст[,|\\s|$]', filter.sub !== 1);

    if (filter.year) check(yearItems()[filter.year]);

    if (filter._3d) {
      check(' стереопара|interlace|anaglyph|анаглиф|bd3d|over\\-?under|side\\-?by\\-?side|' +
        '[\\-\\[\\(| ]((half|h)?ou|(half|h)?sbs|lrq?|abq?|ba|rl|3d[\\- ]video)([ |\\]\\),]|$)',
      filter._3d !== 1);
    }

    return nopass ? false : passed;
  }

  function anyResultPasses(results, filter) {
    for (var i = 0; i < results.length; i++) {
      if (passesFilter(results[i], filter)) return true;
    }
    return false;
  }

  // Активен ли фильтр вообще — та же проверка, что filter_any в движке.
  function filterActive(filter) {
    for (var k in filter) {
      var v = filter[k];
      if (!v) continue;
      if (Array.isArray(v)) {
        if (v.length) return true;
      } else return true;
    }
    return false;
  }

  // Измерения, которые нельзя воспроизвести один-в-один, потому что движок
  // считает их через TitleParser, наружу не выставленный: season опирается на
  // element.general.seasons, нестандартные голоса — на element.info.voices.
  // В таких случаях вердикт не выносим вообще: молчание лучше ложной метки.
  function reproducible(filter) {
    if (toArray(filter.season).length) return false;

    var voices = toArray(filter.voice);
    for (var i = 0; i < voices.length; i++) {
      if (voiceCategory(voices[i]) === -1) return false;
    }
    return true;
  }

  function filterSignature(filter) {
    return JSON.stringify([
      toArray(filter.quality).slice().sort(),
      toArray(filter.voice).slice().sort(),
      toArray(filter.tracker).slice().sort(),
      toArray(filter.lang).slice().sort(),
      filter.hdr, filter.dv, filter.sub, filter.year, filter._3d
    ]);
  }

  function badgeLabel(filter) {
    var quality = toArray(filter.quality);
    var others = toArray(filter.voice).length || toArray(filter.tracker).length ||
      toArray(filter.lang).length || filter.hdr || filter.dv || filter.sub ||
      filter.year || filter._3d;

    // Пока сужен только по качеству — говорим, какого именно не хватает.
    // Как только в фильтре есть что-то ещё, метка «нет 4K» врала бы про причину.
    if (quality.length && !others) {
      return 'нет ' + quality.map(function (q) { return QUALITY_LABELS[q] || q; }).join('/');
    }
    return 'нет раздач';
  }

  var PROCESSED_FALLBACK_MAX = 2000;

  var processed = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  var processedFallback = [];

  function alreadyProcessed(item) {
    if (processed) return processed.has(item);
    return processedFallback.indexOf(item) >= 0;
  }

  function markProcessed(item) {
    if (processed) {
      processed.add(item);
      return;
    }
    // Без WeakSet (старый движок) держим границу размера, чтобы список не рос
    // бесконечно за время долгой сессии медиацентра.
    if (processedFallback.length >= PROCESSED_FALLBACK_MAX) processedFallback.shift();
    processedFallback.push(item);
  }

  function injectStyle() {
    if (document.getElementById('torrent-quality-badge-style')) return;

    // Классы намеренно свои, а не штатные card__marker / card--disabled: их
    // Lampa считает своими и переписывает (см. комментарий у markMiss), поэтому
    // вид штатного маркера воспроизводится здесь целиком.
    var style = document.createElement('style');
    style.id = 'torrent-quality-badge-style';
    style.textContent =
      '.card__quality-badge{position:absolute;left:.4em;bottom:.4em;' +
      'background:rgba(0,0,0,.5);border-radius:1em;padding:.2em .6em .2em .2em;' +
      'display:flex;align-items:center;z-index:1;}' +
      '.card__quality-badge::before{content:"";display:block;width:1em;height:1em;' +
      'border-radius:100%;background-color:#ff8a3d;margin-right:.4em;flex-shrink:0;}' +
      '.card__quality-badge>span{font-size:.8em;overflow:hidden;max-width:9.5em;' +
      'text-overflow:ellipsis;white-space:nowrap;}' +
      // Левый нижний угол — место штатного маркера закладок («Смотрю»,
      // «Просмотрено»); он есть только у карточек в закладках. Если он уже
      // отрисован, наш поднимается над ним.
      '.card__marker~.card__quality-badge{bottom:2.6em;}' +
      // Фильтруем только слои постера: бейдж остаётся цветным и читаемым.
      '.card--quality-miss .card__img,.card--quality-miss .card__filter{' +
      'filter:grayscale(100%);}';
    document.head.appendChild(style);
  }

  function movieTypeFlag(movie) {
    if (movie.type) return movie.type;
    return movie.name || movie.original_name ? 'tv' : 'movie';
  }

  function buildSearch(movie) {
    var year = ((movie.first_air_date || movie.release_date || '0000') + '').slice(0, 4);
    var title = movie.title || movie.name || '';
    var original = movie.original_title || movie.original_name || '';
    var combos = {
      df: original,
      df_year: original + ' ' + year,
      df_lg: original + ' ' + title,
      df_lg_year: original + ' ' + title + ' ' + year,
      lg: title,
      lg_year: title + ' ' + year,
      lg_df: title + ' ' + original,
      lg_df_year: title + ' ' + original + ' ' + year
    };
    return combos[Lampa.Storage.field('parse_lang')] || title;
  }

  function buildMarker(label) {
    var marker = document.createElement('div');
    marker.className = 'card__quality-badge';

    var span = document.createElement('span');
    span.textContent = label;

    marker.appendChild(span);
    return marker;
  }

  // Ни card__marker, ни card--disabled использовать нельзя, хотя визуально они
  // ровно то, что нужно. Lampa считает эти узлы и классы своими: onFavorite
  // ищет в карточке любой .card__marker и, если фильм не в закладках, делает
  // marker.remove() — наша подпись исчезала через ~250 мс после отрисовки.
  // card--disabled точно так же принадлежит методу карточки disable().
  // Чёрно-белый постер и подпись ставятся только вместе: обесцветить карточку,
  // не подписав, — худшее из состояний, причина эффекта будет непонятна.
  function markMiss(root, view, label) {
    if (root.querySelector('.card__quality-badge')) return;
    view.appendChild(buildMarker(label));
    root.classList.add('card--quality-miss');
  }

  // Вердикт из кэша применяется синхронно прямо в обработчике 'line', когда
  // Lampa ещё не построила внутренний DOM карточки: card__view появляется позже.
  // Молча выйти здесь нельзя — на прогретом кэше без этого не подписалась бы
  // ни одна карточка. Ждём появления card__view.
  function waitForView(root, label) {
    if (typeof MutationObserver === 'undefined') return;
    if (root.torrent_badge_waiting) return;
    root.torrent_badge_waiting = true;

    var timer = null;

    var observer = new MutationObserver(function () {
      var view = root.querySelector('.card__view');
      if (!view) return;
      stop();
      markMiss(root, view, label);
    });

    function stop() {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      root.torrent_badge_waiting = false;
    }

    observer.observe(root, { childList: true, subtree: true });
    timer = setTimeout(stop, VIEW_WAIT_MS);
  }

  function applyBadge(item, miss, label) {
    var root = item.render ? item.render(true) : null;
    if (!root) return;

    if (!miss) {
      root.classList.remove('card--quality-miss');
      return;
    }

    var view = root.querySelector('.card__view');

    if (view) markMiss(root, view, label);
    else waitForView(root, label);
  }

  var queue = [];
  var active = 0;
  var inFlight = Object.create(null);

  function pump() {
    while (active < MAX_CONCURRENT && queue.length) {
      var task = queue.shift();
      active++;

      Lampa.Parser.get(
        {
          search: buildSearch(task.movie),
          movie: task.movie,
          from_search: false,
          clarification: false,
          other: false
        },
        function (key, filter) {
          return function (data) {
            finishTask(key, ((data && data.Results) || []), filter);
          };
        }(task.key, task.filter),
        function (key, filter) {
          return function () {
            finishTask(key, null, filter);
          };
        }(task.key, task.filter)
      );
    }
  }

  function finishTask(key, results, filter) {
    var callbacks = inFlight[key] || [];
    delete inFlight[key];
    active--;

    // При ошибке (results === null) карточка намеренно остаётся без пометки —
    // нет достаточных оснований показать её ни как "есть раздачи", ни как "нет":
    // ложный "нет раздач" от временного сбоя парсера хуже, чем молчание. Из
    // processed[] она при этом не убирается: до следующего показа этого списка
    // повторный запрос не пойдёт, это осознанный компромисс ради нагрузки на
    // общий джекетт-агрегатор.
    if (results !== null) {
      var miss = !anyResultPasses(results, filter);

      var cache = Lampa.Storage.cache(CACHE_KEY, CACHE_MAX_ENTRIES, {});
      cache[key] = { ts: Date.now(), miss: miss };
      Lampa.Storage.set(CACHE_KEY, cache);

      callbacks.forEach(function (cb) {
        cb(miss);
      });
    }

    pump();
  }

  function enqueue(item, movie, filter, signature, label) {
    var key = movie.id + ':' + movieTypeFlag(movie) + ':' + signature;

    var cache = Lampa.Storage.cache(CACHE_KEY, CACHE_MAX_ENTRIES, {});
    var cached = cache[key];

    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      applyBadge(item, cached.miss, label);
      return;
    }

    if (inFlight[key]) {
      inFlight[key].push(function (miss) {
        applyBadge(item, miss, label);
      });
      return;
    }

    inFlight[key] = [
      function (miss) {
        applyBadge(item, miss, label);
      }
    ];

    queue.push({ key: key, movie: movie, filter: filter });
    pump();
  }

  function onLineEvent(e) {
    if (!e.items || !e.items.length) return;

    var filter = Lampa.Storage.get('torrents_filter', {});

    if (!filterActive(filter)) return;
    if (!reproducible(filter)) return;

    var signature = filterSignature(filter);
    var label = badgeLabel(filter);

    e.items.forEach(function (item) {
      if (alreadyProcessed(item)) return;
      if (!item.data || !item.data.id) return;

      markProcessed(item);
      enqueue(item, item.data, filter, signature, label);
    });
  }

  function startPlugin() {
    if (window.torrent_quality_badge_plugin) return;
    window.torrent_quality_badge_plugin = true;

    injectStyle();
    Lampa.Listener.follow('line', onLineEvent);
  }

  if (window.Lampa && window.Lampa.Api) startPlugin();
  else Lampa.Listener.follow('app', function (e) {
    if (e.type == 'ready') startPlugin();
  });
})();
