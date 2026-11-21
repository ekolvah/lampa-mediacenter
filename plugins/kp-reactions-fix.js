(function () {
  'use strict';

  // На источнике KP (плагин kp_source) карточки несут id вида "KP_<kinopoisk_id>",
  // а движок берёт реакции (cub.red) и трейлеры (TMDB videos) по TMDB id — у
  // KP-карточек его нет, поэтому блок реакций пуст, а кнопки «Трейлеры» нет.
  // Патч дорезолвливает TMDB-тайтл через imdb_id (который KP отдаёт), а без
  // imdb_id или при пустом find — поиском TMDB по названию и году со сверкой
  // названия, и подставляет в ответ KP.full() reactions и videos тем же способом,
  // каким их получает штатный источник tmdb — см. docs/lampa-config-review.md.
  // Если русского видео у TMDB нет, первым в список ставится русский трейлер с
  // YouTube от сервиса трейлеров на приставке (docs/jacred-on-ugoos.md). У сериала,
  // чей последний вышедший сезон N ≥ 2, первым ставится трейлер сезона N: от сервиса,
  // иначе из видео сезона в TMDB. Кнопка «Трейлер» в строке кнопок карточки запускает
  // первый ролик этого списка.
  // Плагин держит и Главную KP: штатные ряды «Сейчас смотрят фильмы/сериалы» и их полный список
  // по «Ещё» показывают только новинки (обёртки KP.main и KP.list, тот же поиск TMDB-тайтла,
  // что для трейлеров). Тем же поиском KP-история попадает в ряд ядра «Рекомендуем посмотреть»:
  // её TMDB-тайтлы встают в очередь recomends_scan, а из recomends_list убираются (spec
  // kp-history-recommendations). За рядами «Сейчас смотрят» обёртка KP.main ставит ряды
  // рекомендаций ядра фильмов и сериалов: kp_source их на Главную не ставит (spec
  // kp-main-recommendations).

  var DAY = 60 * 24; // life кэша движка — в минутах
  var WEEK = DAY * 7;
  var TRAILER_SERVICE = 'http://127.0.0.1:9118/trailer';
  // Больше срока поиска в сервисе (8 с): при зависшем YouTube успевает прийти его 502.
  var TRAILER_TIMEOUT_MS = 10000;
  // Сколько Главная или страница полного списка ждёт новинок: дольше экран пуст.
  var ROWS_TIMEOUT_MS = 5000;
  // Предел прохода по KP-истории для рекомендаций: меньше первого тика ядра (120 с).
  var RECS_TIMEOUT_MS = 60000;
  // Страниц коллекции на ряд Главной и на одну страницу полного списка.
  var BATCH = 5;
  // Карточек в ряду рекомендаций Главной (у ядра 20) и карточек на странице его экрана «Ещё».
  var REC_ROW_LIMIT = 40;
  var REC_PAGE = 20;
  // Добавка к заголовку ряда, собранного не до конца.
  var INCOMPLETE = ' · неполный';
  // Штатные ряды kp_source по url, который кладёт его getList.
  var NOW_WATCHING = [
    { url: 'api/v2.2/films/collections?type=TOP_POPULAR_MOVIES', name: 'Сейчас смотрят фильмы' },
    { url: 'api/v2.2/films/collections?type=POPULAR_SERIES', name: 'Сейчас смотрят сериалы' },
  ];
  // Память рядов NOW_WATCHING в Lampa.Storage: { <url ряда>: { <id карточки>: { f, s, l } } };
  // f — мс появления (0 — не новая), s — сезон сериала или null, l — день последней сборки с ней.
  var SEEN_KEY = 'kp_now_watching_seen';
  var DAY_MS = 24 * 60 * 60 * 1000;
  // Сколько дней карточка стоит в начале ряда и через сколько дней отсутствия её забывают.
  var NEW_DAYS = 5;
  var FORGET_DAYS = 30;

  // normalizeTitle/cleanTitle — копия из kp_source.js (наружу не экспортированы):
  // регистр, виды дефиса, «ё»/«е» и пунктуация при сравнении не важны.
  function cleanTitle(str) {
    return str.replace(/[\s.,:;\u2019'`!?]+/g, ' ').trim();
  }

  function normalizeTitle(str) {
    return cleanTitle(str.toLowerCase().replace(/[\-\u2010-\u2015\u2E3A\u2E3B\uFE58\uFE63\uFF0D]+/g, '-').replace(/ё/g, 'е'));
  }

  // Нормализованные непустые названия.
  function titles(a, b) {
    return [a, b].filter(function (t) { return typeof t === 'string' && t; }).map(normalizeTitle);
  }

  function patch() {
    var KP = Lampa.Api.sources.KP;
    var cub = Lampa.Api.sources.cub;
    var tmdb = Lampa.Api.sources.tmdb;

    if (!KP || !cub || !tmdb || KP.__reactions_patched) return;

    var orgFull = KP.full;

    // Реакции и трейлеры одного тайтла параллельно; oncomplite — когда готовы оба.
    function enrich(result, title, oncomplite) {
      var pending = 2;
      function done() { if (--pending === 0) oncomplite(result); }

      cub.reactionsGet(title, function (reactions) {
        result.reactions = reactions;
        done();
      });

      if (typeof tmdb.videos !== 'function') {
        console.warn('kp-reactions-fix: tmdb.videos is not a function, no trailers', title.method, title.id);
        return done();
      }

      // Видео и, у сериала, его последний сезон — параллельно; решение о трейлере — когда пришли оба.
      var videos;
      var season;
      var waiting = 2;
      function ready() {
        if (--waiting === 0) trailers(result, title, videos, season, done);
      }

      var getSeason = title.method === 'tv' ? lastSeason : function (t, cb) { cb(null); };
      getSeason(title, function (last) {
        season = last && last.number >= 2 ? last : null;
        ready();
      });
      // Сбой запроса движок отдаёт как пустой список — не отличить от «видео нет».
      tmdb.videos(title, function (answer) {
        videos = answer;
        ready();
      });
    }

    // Список «Трейлеры»: видео TMDB, первым — русский трейлер сервиса; у сериала с последним
    // сезоном N ≥ 2 — трейлер сезона N, при отказе сервиса — из видео сезона в TMDB.
    function trailers(result, title, videos, season, done) {
      var list = (videos && videos.results) || [];
      if (!list.length) {
        console.warn('kp-reactions-fix: no videos', title.method, title.id);
      }
      result.videos = videos;
      var hasRu = list.some(function (v) { return v.iso_639_1 === 'ru'; });
      // Русский ролик TMDB не говорит, какого он сезона, поэтому у сериала сервис спрашивают всегда.
      if (hasRu && !season) return done();

      var movie = result.movie;
      var date = season ? season.date : releaseDate(movie);
      ruTrailer(movie, season, function (video) {
        if (video) {
          result.videos = { results: putFirst(video, date, list) };
          return done();
        }
        if (!season) return done();
        seasonTrailer(title, movie, season, function (trailer) {
          if (trailer) result.videos = { results: putFirst(trailer, date, list) };
          done();
        });
      });
    }

    function time(video) {
      return new Date(video.published_at).getTime();
    }

    // Самое новое видео по published_at; без даты не считается. null — датированных нет.
    function newest(list) {
      return list.reduce(function (max, v) { return time(v) > (max ? time(max) : -Infinity) ? v : max; }, null);
    }

    // Ролик первым в списке «Трейлеры» по ключам сортировки движка: язык tmdb_lang (до «Ещё»)
    // и published_at строго позже самого нового в списке — при равных датах порядок не задан.
    function putFirst(video, date, list) {
      var last = newest(list);
      var at = date;
      if (last && !(new Date(date).getTime() > time(last))) at = new Date(time(last) + 1000).toISOString();
      var first = {};
      for (var key in video) first[key] = video[key];
      first.iso_639_1 = Lampa.Storage.field('tmdb_lang');
      first.published_at = at;
      return [first].concat(list);
    }

    // Последний вышедший сезон: { number, date } по последней вышедшей серии. cb(null) — сведений
    // нет, предупреждение с id уже в консоли. Анонсированный сезон без серий не считается.
    function lastSeason(title, cb) {
      tmdb.get('tv/' + title.id, {}, function (tv) {
        var episode = tv && tv.last_episode_to_air;
        if (!episode || !episode.season_number) {
          console.warn('kp-reactions-fix: no last episode', title.id);
          return cb(null);
        }
        cb({ number: episode.season_number, date: episode.air_date || '' });
      }, function () {
        console.warn('kp-reactions-fix: tv details failed', title.id);
        cb(null);
      }, { life: DAY });
    }

    // Самый новый Trailer сезона из TMDB тем же путём, что и у движка. cb(null) — трейлера нет,
    // причина в console.warn. Колбэк движка для сезона может не прийти (seasonFix), поэтому срок.
    function seasonTrailer(title, movie, season, cb) {
      var finished = false;
      function finish(trailer, reason) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (!trailer) console.warn('kp-reactions-fix: no season trailer', cardName(movie), 'season ' + season.number, reason);
        cb(trailer);
      }
      var timer = setTimeout(function () { finish(null, 'timeout'); }, TRAILER_TIMEOUT_MS);

      tmdb.videos({ method: title.method + '/' + title.id + '/season', id: season.number }, function (videos) {
        var list = videos && Array.isArray(videos.results) ? videos.results : [];
        var trailer = newest(list.filter(function (v) { return v.type === 'Trailer'; }));
        finish(trailer, 'no trailer among ' + list.length + ' videos');
      });
    }

    function cardName(movie) {
      return movie.title || movie.original_title || '';
    }

    function releaseDate(movie) {
      return (movie.type === 'tv' ? movie.first_air_date : movie.release_date) || '';
    }

    // Русский трейлер с YouTube от сервиса трейлеров на приставке (tools/trailer_service.py),
    // в форме видео TMDB; season — трейлер этого сезона. cb(null) — ролика нет, причина уже в
    // console.warn.
    function ruTrailer(movie, season, cb) {
      var name = cardName(movie);
      var year = releaseDate(movie).slice(0, 4);
      var url = TRAILER_SERVICE + '?title=' + encodeURIComponent(name);
      if (movie.original_title) url += '&original_title=' + encodeURIComponent(movie.original_title);
      if (year) url += '&year=' + year;
      if (season) url += '&season=' + season.number;

      function fail(reason) {
        console.warn('kp-reactions-fix: no russian trailer', name, year, season ? 'season ' + season.number : '', reason);
        cb(null);
      }

      var request = new Lampa.Reguest();
      request.timeout(TRAILER_TIMEOUT_MS);
      request.silent(url, function (found) {
        if (!found || !found.video_id) return fail((found && found.reason) || 'empty answer');
        cb({ site: 'YouTube', key: found.video_id, name: found.title, type: 'Trailer' });
      }, function (xhr) {
        var body = xhr.responseJSON || {};
        var detail = [body.error, body.detail].filter(Boolean).join(': ');
        fail(['HTTP ' + xhr.status, xhr.statusText, detail].filter(Boolean).join(' '));
      });
    }

    // Поиск тайтла по названию: тип из карточки, год строгий; с годом — первый
    // результат с совпадающим названием, без года — только единственный.
    function searchByTitle(movie, cb) {
      var tv = movie.type === 'tv';
      var method = tv ? 'tv' : 'movie';
      var year = releaseDate(movie).slice(0, 4);
      var url = 'search/' + method + '?query=' + encodeURIComponent(cardName(movie));
      if (year) url += (tv ? '&first_air_date_year=' : '&primary_release_year=') + year;

      function fail(reason) {
        console.warn('kp-reactions-fix: no title match', reason, movie.title, year);
        cb(null);
      }

      tmdb.get(url, {}, function (found) {
        var want = titles(movie.title, movie.original_title);
        var matches = ((found && found.results) || []).filter(function (r) {
          return titles(r.title || r.name, r.original_title || r.original_name).some(function (t) {
            return want.indexOf(t) !== -1;
          });
        });

        if (!matches.length) return fail('not found');
        if (!year && matches.length > 1) return fail('ambiguous without year');
        cb({ method: method, id: matches[0].id });
      }, function () {
        fail('search failed');
      }, { life: WEEK });
    }

    // TMDB-тайтл карточки: по imdb_id (find), без него или при пустом find — по
    // названию. cb(null) — тайтла нет, причина уже в console.warn.
    function resolveTitle(movie, cb) {
      if (!movie.imdb_id) return searchByTitle(movie, cb);

      tmdb.get('find/' + movie.imdb_id + '?external_source=imdb_id', {}, function (found) {
        // Бывает и фильм, и сериал (пустая запись TMDB с тем же imdb_id): берётся тип карточки.
        var film = (found.movie_results || [])[0];
        var tv = (found.tv_results || [])[0];
        if (tv && (movie.type === 'tv' || !film)) cb({ method: 'tv', id: tv.id });
        else if (film) cb({ method: 'movie', id: film.id });
        else searchByTitle(movie, cb);
      }, function () {
        console.warn('kp-reactions-fix: find failed, no reactions and trailers', movie.imdb_id);
        cb(null);
      }, { life: WEEK });
    }

    KP.full = function (params, oncomplite, onerror) {
      return orgFull.call(KP, params, function (result) {
        var movie = result && result.movie;
        if (!movie) return oncomplite(result);

        resolveTitle(movie, function (title) {
          if (title) enrich(result, title, oncomplite);
          else oncomplite(result);
        });
      }, onerror);
    };

    // Новинка (spec now-watching-new-releases): год по Кинопоиску не раньше прошлого; у сериала
    // со старым стартом — последний эпизод по TMDB за 365 дней. 'episode' — нужна дата эпизода
    // (lastEpisodeDate не передан), 'unknown' — проверить нечем.
    function isNewRelease(card, rule, lastEpisodeDate) {
      var year = parseInt(releaseDate(card).slice(0, 4), 10);
      if (!year) return 'unknown';
      if (year >= rule.minYear) return 'new';
      if (card.type !== 'tv') return 'old';
      if (lastEpisodeDate === undefined) return 'episode';
      if (!lastEpisodeDate) return 'unknown';
      return lastEpisodeDate >= rule.cutoff ? 'new' : 'old';
    }

    function noveltyRule(today) {
      function pad(n) { return (n < 10 ? '0' : '') + n; }
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 365);
      return {
        minYear: today.getFullYear() - 1,
        cutoff: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      };
    }

    // Дата последнего вышедшего эпизода сериала по TMDB. cb(null, причина) — даты нет.
    function lastEpisode(card, cb) {
      resolveTitle(card, function (title) {
        if (!title || title.method !== 'tv') return cb(null, 'no tmdb tv title');
        lastSeason(title, function (last) {
          cb((last && last.date) || null, 'no last episode date, tv/' + title.id);
        });
      });
    }

    function rowsFailed(reason) {
      console.error('kp-reactions-fix: new release rows not built', reason);
      Lampa.Noty.show('Ряды новинок не построены: ' + reason);
    }

    // Ожидание ответов одного сбора. pending() — один ожидаемый ответ: settle = pending(),
    // settle(fn) — его колбэк (успех или ошибка). done() зовётся, когда пришли все ответы, но не
    // позже ms; поздние колбэки после него не вызываются. start() — запросы
    // поставлены: ответы из кэша приходят синхронно, раньше него.
    function waiter(done, ms) {
      var finished = false;
      var waiting = 1;
      var timer = setTimeout(finish, ms);
      function finish() {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        var fn = done;
        done = null;
        fn();
      }
      function release() { if (--waiting === 0) finish(); }
      return {
        pending: function () {
          var settled = false;
          waiting++;
          return function (fn) {
            return function () {
              if (finished || settled) return;
              settled = true;
              fn.apply(null, arguments);
              release();
            };
          };
        },
        start: release
      };
    }

    // Новинки страниц коллекции first..last: страница first — known (ответ, уже полученный
    // Главной) или запрос, остальные — запросы к исходному KP.list. Возвращает build():
    // { results, gaps } — новинки и непроверенные в порядке коллекции, число недошедших страниц.
    function collectPages(spec, first, last, known, rule, pending) {
      var pages = []; // undefined — нет ответа, null — ошибка страницы

      function addPage(page, json) {
        if (json && json.total_pages) srcPages[spec.url] = json.total_pages;
        pages[page - first] = ((json && json.results) || []).map(function (card) {
          var item = { card: card, verdict: isNewRelease(card, rule), reason: 'no year' };
          if (item.verdict !== 'episode') return item;
          item.reason = 'timeout';
          lastEpisode(card, pending()(function (date, reason) {
            item.verdict = isNewRelease(card, rule, date);
            item.reason = reason;
          }));
          return item;
        });
      }

      if (known) addPage(first, known);
      for (var page = known ? first + 1 : first; page <= last; page++) (function (page) {
        var settle = pending();
        orgList.call(KP, { url: spec.url, page: page }, settle(function (json) {
          addPage(page, json);
        }), settle(function () {
          pages[page - first] = null;
        }));
      })(page);

      return function () {
        var results = [];
        var gaps = [];
        for (var i = 0; i <= last - first; i++) {
          if (!pages[i]) {
            gaps.push('page ' + (first + i) + ' ' + (pages[i] === null ? 'failed' : 'timeout'));
            continue;
          }
          pages[i].forEach(function (item) {
            if (item.verdict === 'old') return;
            if (item.verdict !== 'new') console.warn('kp-reactions-fix: new release not checked', cardName(item.card), item.reason);
            results.push(item.card);
          });
        }
        if (gaps.length) console.warn('kp-reactions-fix: new release row incomplete', spec.name, gaps.join(', '));
        return { results: results, gaps: gaps.length };
      };
    }

    // Штатный ряд с новинками вместо карточек: место, заголовок и «Ещё» штатные, total_pages —
    // страниц полного списка. Новинок нет — ряда нет.
    function filteredRow(spec, original, batch) {
      if (!batch.results.length) {
        console.warn('kp-reactions-fix: no new releases', spec.name);
        return null;
      }
      var row = {};
      for (var key in original) row[key] = original[key];
      row.results = batch.results;
      row.total_pages = Math.ceil((original.total_pages || 1) / BATCH);
      if (batch.gaps) row.title += INCOMPLETE;
      return row;
    }

    // Страница N полного списка «Ещё» — новинки страниц коллекции BATCH·(N−1)+1…BATCH·N, не
    // дальше её конца. Пустую пачку пропускает, как сама Lampa: params.page++ и следующая.
    function listBatch(spec, params, oncomplite, onerror) {
      var first = (params.page - 1) * BATCH + 1;
      var last = first + BATCH - 1;
      if (srcPages[spec.url]) last = Math.min(last, srcPages[spec.url]);
      var build;
      var wait = waiter(function () {
        var batch = build();
        var total = Math.ceil((srcPages[spec.url] || last) / BATCH);
        if (batch.gaps && batch.gaps === last - first + 1) return onerror();
        if (!batch.results.length && params.page < total) {
          params.page++;
          return listBatch(spec, params, oncomplite, onerror);
        }
        oncomplite({ results: batch.results, page: params.page, total_pages: total });
      }, ROWS_TIMEOUT_MS);
      build = collectPages(spec, first, last, null, noveltyRule(new Date()), wait.pending);
      wait.start();
    }

    function isObject(x) {
      return !!x && typeof x === 'object' && !Array.isArray(x);
    }

    // Память рядов (SEEN_KEY) копией. Не той формы — предупреждение и пустая память, т. е. первый
    // запуск.
    function readSeen() {
      var seen = Lampa.Storage.get(SEEN_KEY, '{}');
      var ok = isObject(seen) && Object.keys(seen).every(function (url) {
        var row = seen[url];
        return isObject(row) && Object.keys(row).every(function (id) { return isObject(row[id]); });
      });
      if (ok) return JSON.parse(JSON.stringify(seen));
      console.warn('kp-reactions-fix: ' + SEEN_KEY + ' corrupt, starting over', String(JSON.stringify(seen)).slice(0, 200));
      return {};
    }

    // Порядок ряда (spec now-watching-new-releases, «Новые карточки первыми», «Память ряда»): новые —
    // появившиеся за NEW_DAYS — первыми по убыванию времени появления, остальные за ними в порядке
    // коллекции. rowMemory — запись ряда в памяти или undefined; seasons — id → сезон, полученный
    // при сборке. Возвращает { results, memory }: memory — новая запись ряда, undefined — ряд не
    // запоминается (первый запуск с неполным рядом).
    function orderByNovelty(batch, rowMemory, seasons, now) {
      if (!rowMemory && batch.gaps) return { results: batch.results, memory: undefined };
      var nowMs = now.getTime();
      var today = Math.floor(nowMs / DAY_MS);
      var memory = {};
      for (var id in rowMemory) {
        var old = rowMemory[id];
        if (today - old.l <= FORGET_DAYS) memory[id] = { f: old.f, s: old.s == null ? null : old.s, l: old.l };
      }
      batch.results.forEach(function (card) {
        var season = seasons[card.id] == null ? null : seasons[card.id];
        var entry = memory[card.id];
        if (!entry) {
          memory[card.id] = { f: rowMemory ? nowMs : 0, s: season, l: today };
          return;
        }
        if (season !== null && (entry.s === null || season > entry.s)) {
          if (entry.s !== null) entry.f = nowMs;
          entry.s = season;
        }
        entry.l = today;
      });
      var order = batch.results.map(function (card, i) {
        var f = memory[card.id].f;
        return { card: card, i: i, f: f > 0 && nowMs - f < NEW_DAYS * DAY_MS ? f : 0 };
      });
      order.sort(function (a, b) { return b.f - a.f || a.i - b.i; });
      return { results: order.map(function (o) { return o.card; }), memory: memory };
    }

    // Первая порция Главной: штатные ряды NOW_WATCHING заменены отфильтрованными, новые карточки
    // первыми. Ответы ждёт pending того waiter, что отдаёт порцию. Возвращает build() — ряды порции
    // и save() — запись памяти рядов, если сборка её изменила.
    function filterRows(parts, pending) {
      var originals = NOW_WATCHING.map(function (spec) {
        return parts.filter(function (p) { return p && p.url === spec.url; })[0];
      });
      var missing = NOW_WATCHING.filter(function (spec, i) { return !originals[i]; });
      if (missing.length) {
        rowsFailed('no row ' + missing.map(function (spec) { return spec.name; }).join(', '));
        return { build: function () { return parts.slice(); }, save: function () {} };
      }

      var now = new Date();
      var rule = noveltyRule(now);
      var seen = readSeen();
      var changed = false;
      var rows = NOW_WATCHING.map(function (spec, i) {
        var original = originals[i];
        return collectPages(spec, 1, Math.min(BATCH, original.total_pages || 1), original, rule, pending);
      });
      function ordered(spec, original, batch) {
        var next = orderByNovelty(batch, seen[spec.url], {}, now);
        if (next.memory && JSON.stringify(next.memory) !== JSON.stringify(seen[spec.url])) {
          seen[spec.url] = next.memory;
          changed = true;
        }
        return filteredRow(spec, original, { results: next.results, gaps: batch.gaps });
      }
      return {
        build: function () {
          var out = [];
          parts.forEach(function (p) {
            var i = originals.indexOf(p);
            var row = i === -1 ? p : ordered(NOW_WATCHING[i], p, rows[i]());
            if (row) out.push(row);
          });
          return out;
        },
        save: function () {
          if (changed) Lampa.Storage.set(SEEN_KEY, seen);
        }
      };
    }

    function recsFailed(reason) {
      console.error('kp-reactions-fix: recommendation rows not built', reason);
      Lampa.Noty.show('Ряды рекомендаций не построены: ' + reason);
    }

    // Ряд рекомендаций ядра типа media по образцу его ряда recomend_watch (spec
    // kp-main-recommendations): «Ещё» — штатный экран recomend. Рекомендаций нет — ряда нет.
    function recsRow(media, title) {
      var all = Lampa.Recomends.get(media);
      if (!all.length) {
        console.warn('kp-reactions-fix: no recommendations', media);
        return null;
      }
      var pages = Math.ceil(all.length / REC_PAGE);
      return {
        results: Lampa.Arrays.shuffle(all).slice(0, REC_ROW_LIMIT),
        title: title,
        total_pages: pages,
        page: 1,
        params: { emit: { onlyMore: function () { Lampa.Router.call('recomend', { media: media, total_pages: pages }); } } }
      };
    }

    // Ряды рекомендаций встают перед первым рядом исходной порции за последним рядом NOW_WATCHING
    // (без них — перед первым рядом): он не из NOW_WATCHING и есть в out тем же объектом.
    function recsIndex(parts, out) {
      var last = -1;
      parts.forEach(function (p, i) {
        if (NOW_WATCHING.some(function (spec) { return p && p.url === spec.url; })) last = i;
      });
      for (var i = last + 1; i < parts.length; i++) if (parts[i]) return out.indexOf(parts[i]);
      return out.length;
    }

    function addRecs(parts, out) {
      var rows = [recsRow('movie', 'Рекомендуем посмотреть фильмы'), recsRow('tv', 'Рекомендуем посмотреть сериалы')].filter(Boolean);
      if (historyWaiting) {
        console.warn('kp-reactions-fix: recommendations: KP history not resolved before main');
        rows.forEach(function (row) { row.title += INCOMPLETE; });
      }
      out.splice.apply(out, [recsIndex(parts, out), 0].concat(rows));
    }

    // Первая порция Главной уходит, когда собраны ряды новинок и закончен проход по KP-истории
    // (рекомендации без её тайтлов), но не позже ROWS_TIMEOUT_MS.
    // Память рядов пишется после oncomplite: её сбой не задерживает Главную.
    function mainPortion(parts, oncomplite) {
      var rows;
      var wait = waiter(function () {
        var out = rows.build();
        if (recsReady) addRecs(parts, out);
        oncomplite(out);
        rows.save();
      }, ROWS_TIMEOUT_MS);
      rows = filterRows(parts, wait.pending);
      if (recsReady && historyWaiting) historyWaiting.push(wait.pending()(function () {}));
      wait.start();
    }

    // «Ещё» у ряда NOW_WATCHING: category_full зовёт KP.list с url ряда и page 1, 2, … Остальные
    // списки идут в kp_source как есть.
    var orgList = KP.list;
    var srcPages = {}; // url коллекции → число её страниц, из её ответов
    KP.list = function (params, oncomplite, onerror) {
      var spec = NOW_WATCHING.filter(function (s) { return params && s.url === params.url; })[0];
      if (!spec) return orgList.apply(KP, arguments);
      listBatch(spec, params, oncomplite, onerror);
    };

    // Главная зовёт KP.main один раз и через его oncomplite получает первую порцию рядов;
    // подгрузку при прокрутке (возвращённую функцию) обёртка не трогает.
    var orgMain = KP.main;
    if (typeof orgMain === 'function') {
      var active = Lampa.Activity.active();
      if (active && active.component === 'main' && active.source === 'KP') rowsFailed('main screen built before patch');
      var recsMissing = ['Recomends.get', 'Router.call', 'Arrays.shuffle'].filter(function (path) {
        var p = path.split('.');
        return !(Lampa[p[0]] && typeof Lampa[p[0]][p[1]] === 'function');
      });
      var recsReady = !recsMissing.length;
      if (!recsReady) recsFailed('no ' + recsMissing.map(function (path) { return 'Lampa.' + path; }).join(', '));
      KP.main = function (params, oncomplite, onerror) {
        return orgMain.call(KP, params, function (parts) {
          mainPortion(parts, oncomplite);
        }, onerror);
      };
    }

    // KP-история в ряду «Рекомендуем посмотреть» (spec kp-history-recommendations). Ядро ставит в
    // очередь recomends_scan только историю cub/tmdb и отсеивает просмотренное сравнением id с
    // историей, где у KP-тайтла id «KP_<n>». Найденные TMDB-тайтлы KP-истории встают в начало
    // очереди, а из recomends_list убираются.
    function isTv(card) {
      return !!(card.number_of_seasons || card.first_air_date);
    }

    // Тайтл очереди и списка — id и тип. Признак сериала в очереди ядра — число сезонов, search()
    // проверяет только истинность.
    function recKey(id, tv) {
      return id + ':' + (tv ? 'tv' : 'movie');
    }

    function queueKeys(queue) {
      var keys = {};
      queue.forEach(function (e) { keys[recKey(e.id, e.tv)] = true; });
      return keys;
    }

    // Убирает из списка рекомендаций на месте тайтлы watched; возвращает число убранных.
    function cleanRecs(list, watched) {
      var removed = 0;
      for (var i = list.length - 1; i >= 0; i--) {
        if (watched[recKey(list[i].id, isTv(list[i]))]) {
          list.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }

    // Чистка списка после каждой его записи ядром; на первой записи очереди ядром — проверка, что
    // вставленное в ней осталось (решение 5). Зовётся после своих записей: первая запись здесь — ядра.
    function followRecs(watched, keys) {
      var checked = false;
      Lampa.Storage.listener.follow('change', function (e) {
        if (e.name === 'recomends_list') cleanRecs(e.value, watched);
        else if (e.name === 'recomends_scan' && !checked) {
          checked = true;
          var inQueue = queueKeys(e.value);
          var kept = keys.every(function (k) { return inQueue[k]; });
          if (!kept) console.warn('kp-reactions-fix: recommendations: core rewrote recomends_scan without KP history titles');
        }
      });
    }

    // Массив очереди — тот же объект, что держит и пишет на каждом тике ядро (design.md, решение 2),
    // поэтому вставка правится на месте.
    function applyRecs(found) {
      var queue = Lampa.Storage.get('recomends_scan', '[]');
      var inQueue = queueKeys(queue);
      var watched = {};
      var missing = [];
      found.forEach(function (rec) {
        var key = recKey(rec.id, rec.tv);
        if (watched[key]) return;
        watched[key] = true;
        if (!inQueue[key]) missing.push(rec);
      });
      if (missing.length) {
        queue.unshift.apply(queue, missing);
        Lampa.Storage.set('recomends_scan', queue);
      }

      var list = Lampa.Storage.get('recomends_list', '[]');
      if (cleanRecs(list, watched)) Lampa.Storage.set('recomends_list', list);
      var keys = Object.keys(watched);
      followRecs(watched, keys);
      KP.__history_recs = keys.slice(); // только для живой проверки tests/live/kp-history-recs.sh
    }

    // Конца прохода ждут первые порции Главной, открытые во время прохода; null — проход закончен.
    var historyWaiting = [];
    function historyFinished() {
      var waiting = historyWaiting;
      historyWaiting = null;
      waiting.forEach(function (fn) { fn(); });
    }

    // KP-записи ищутся по одной (не залпом поверх рядов Главной), весь проход — не дольше
    // RECS_TIMEOUT_MS: недошедшие считаются ненайденными. Один раз за запуск.
    var recsStarted = false;
    function historyRecs() {
      if (recsStarted) return;
      recsStarted = true;
      var kp = Lampa.Favorite.get({ type: 'history' }).filter(function (e) { return e.source === 'KP'; });
      if (!kp.length) return historyFinished();
      var found = [];
      var wait = waiter(function () {
        var unresolved = kp.length - found.length;
        if (unresolved) console.warn('kp-reactions-fix: recommendations: ' + unresolved + ' of ' + kp.length + ' KP history titles unresolved');
        if (found.length) applyRecs(found);
        historyFinished();
      }, RECS_TIMEOUT_MS);
      (function next(i) {
        if (i >= kp.length) return;
        // У записи истории нет type, а resolveTitle берёт тип поиска из него.
        var card = Object.assign({}, kp[i], { type: isTv(kp[i]) ? 'tv' : 'movie' });
        resolveTitle(card, wait.pending()(function (title) {
          if (title) found.push({ id: title.id, tv: title.method === 'tv' });
          next(i + 1);
        }));
      })(0);
      wait.start();
    }

    if (window.appready) historyRecs();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') historyRecs(); });

    KP.__reactions_patched = true;
  }

  function cardButton(cls, sprite, text, onEnter) {
    return $('<div class="full-start__button selector ' + cls + '">' +
      '<svg><use xlink:href="#sprite-' + sprite + '"></use></svg><span>' + text + '</span></div>')
      .on('hover:enter', onEnter);
  }

  // «Торренты» передаёт нажатие скрытой .view--torrent движка, как меню «Смотреть» (spec
  // card-buttons). Без parser_use движок оставляет её с классом hide — тогда кнопки нет.
  function torrentButton(body) {
    var torrent = body.find('.view--torrent:not(.hide)');
    if (!torrent.length) return null;
    return cardButton('button--kp-torrent', 'torrent', 'Торренты', function () {
      torrent.trigger('hover:enter');
    });
  }

  // «Трейлер» запускает первый ролик списка «Трейлеры» с одного нажатия (spec kp-card-trailers).
  // Список собирает и ролик запускает сам движок: обработчик .view--trailer синхронно зовёт
  // Lampa.Select.show, кнопка на этот вызов его перехватывает.
  function trailerButton(body, name) {
    // Карточку без трейлеров движок оставляет без .view--trailer ещё до complite.
    var trailers = body.find('.view--trailer');
    if (!trailers.length) return null;
    return cardButton('button--kp-trailer', 'trailer', 'Трейлер', function () {
      var show = Lampa.Select.show;
      var list = null;
      Lampa.Select.show = function (params) { list = params; };
      try {
        trailers.trigger('hover:enter');
      } finally {
        Lampa.Select.show = show;
      }
      if (!list) return console.warn('kp-reactions-fix: trailer list not intercepted', name);

      var first = (list.items || []).filter(function (item) { return !item.separator; })[0];
      if (first) return list.onSelect(first);
      console.warn('kp-reactions-fix: no trailer for button', name);
      show.call(Lampa.Select, list);
    });
  }

  // «Торренты» и «Трейлер» встают на место «Смотреть», а он уходит в меню «…» (spec card-buttons).
  // «Смотреть» удаляется из DOM, а не скрывается: onGroupButtons движка снимает с него hide
  // при каждом возврате в карточку.
  function onFull(e) {
    if (e.type === 'options') {
      var link = e.link;
      return e.options.unshift({ title: 'Смотреть', onSelect: function () { link.emit('watch', {}); } });
    }
    if (e.type !== 'complite') return;
    var movie = (e.data && e.data.movie) || {};
    var name = movie.title || movie.name || '';
    var play = e.body.find('.button--play');
    if (!play.length) return console.warn('kp-reactions-fix: no play button, no card buttons', name);
    var buttons = [torrentButton(e.body), trailerButton(e.body, name)].filter(Boolean);
    play.after(buttons).remove();
  }

  function startPlugin() {
    Lampa.Listener.follow('full', onFull);
    if (Lampa.Api.sources.KP) return patch();

    // kp_source грузится отдельным тегом script — порядок завершения между
    // плагинами не гарантирован, поэтому ждём появления источника вместо
    // патча на старте.
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (Lampa.Api.sources.KP || tries > 50) {
        clearInterval(timer);
        patch();
      }
    }, 200);
  }

  if (window.Lampa && window.Lampa.Api) startPlugin();
  else Lampa.Listener.follow('app', function (e) {
    if (e.type == 'ready') startPlugin();
  });
})();
