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
  // Плагин держит и Главную KP: за штатными рядами «Сейчас смотрят фильмы/сериалы» ставит
  // ряды их новинок (обёртка KP.main, тот же поиск TMDB-тайтла, что для трейлеров).

  var DAY = 60 * 24; // life кэша движка — в минутах
  var WEEK = DAY * 7;
  var TRAILER_SERVICE = 'http://127.0.0.1:9118/trailer';
  // Больше срока поиска в сервисе (8 с): при зависшем YouTube успевает прийти его 502.
  var TRAILER_TIMEOUT_MS = 10000;
  // Сколько Главная ждёт рядов новинок: дольше её экран пуст.
  var ROWS_TIMEOUT_MS = 5000;
  var LAST_PAGE = 5;
  // Штатные ряды kp_source по url, который кладёт его getList, и ряды новинок за ними.
  var NEW_ROWS = [
    { url: 'api/v2.2/films/collections?type=TOP_POPULAR_MOVIES', name: 'Сейчас смотрят фильмы', title: 'Сейчас смотрят: новинки (фильмы)' },
    { url: 'api/v2.2/films/collections?type=POPULAR_SERIES', name: 'Сейчас смотрят сериалы', title: 'Сейчас смотрят: новинки (сериалы)' },
  ];

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

    // Ряд новинок одной коллекции: страница 1 из штатного ряда, 2–5 через KP.list. pending() —
    // один ожидаемый ответ: settle = pending(), settle(fn) — его колбэк (успех или ошибка); после
    // конца сбора колбэки не вызываются. Возвращает build(): ряд или null.
    function collectRow(spec, original, rule, pending) {
      var pages = []; // undefined — нет ответа, null — ошибка страницы

      function addPage(index, results) {
        pages[index] = (results || []).map(function (card) {
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

      addPage(0, original.results);
      for (var page = 2; page <= LAST_PAGE; page++) (function (page) {
        var settle = pending();
        KP.list({ url: spec.url, page: page }, settle(function (json) {
          addPage(page - 1, json && json.results);
        }), settle(function () {
          pages[page - 1] = null;
        }));
      })(page);

      return function () {
        var results = [];
        var gaps = [];
        var unchecked = 0;
        for (var i = 0; i < LAST_PAGE; i++) {
          if (!pages[i]) {
            gaps.push('page ' + (i + 1) + ' ' + (pages[i] === null ? 'failed' : 'timeout'));
            continue;
          }
          pages[i].forEach(function (item) {
            if (item.verdict === 'old') return;
            if (item.verdict !== 'new') {
              unchecked++;
              console.warn('kp-reactions-fix: new release not checked', cardName(item.card), item.reason);
            }
            results.push(item.card);
          });
        }
        if (gaps.length) console.warn('kp-reactions-fix: new release row incomplete', spec.title, gaps.join(', '));
        if (!results.length) {
          console.warn('kp-reactions-fix: no new releases', spec.title);
          return null;
        }
        var title = spec.title + (gaps.length ? ' · неполный' : '') + (unchecked ? ' · не проверено: ' + unchecked : '');
        return { title: title, results: results, total_pages: 1 };
      };
    }

    // Первая порция Главной: за каждым штатным рядом NEW_ROWS — его ряд новинок. Порция уходит
    // Главной, когда собраны оба ряда, но не позже ROWS_TIMEOUT_MS.
    function insertRows(parts, oncomplite) {
      var originals = NEW_ROWS.map(function (spec) {
        return parts.filter(function (p) { return p && p.url === spec.url; })[0];
      });
      var missing = NEW_ROWS.filter(function (spec, i) { return !originals[i]; });
      if (missing.length) {
        rowsFailed('no row ' + missing.map(function (spec) { return spec.name; }).join(', '));
        return oncomplite(parts);
      }

      var rule = noveltyRule(new Date());
      var finished = false;
      var waiting = 1; // сам запуск: ответы из кэша приходят синхронно, до конца сборки rows
      function release() { if (--waiting === 0) finish(); }
      function pending() {
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
      }
      // После finish поздние колбэки не держат порцию и oncomplite Главной (design, решение 3).
      function finish() {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        var out = [];
        parts.forEach(function (p) {
          out.push(p);
          var i = originals.indexOf(p);
          var built = i === -1 ? null : rows[i]();
          if (built) out.push(built);
        });
        var done = oncomplite;
        parts = originals = rows = oncomplite = null;
        done(out);
      }
      var timer = setTimeout(finish, ROWS_TIMEOUT_MS);
      var rows = NEW_ROWS.map(function (spec, i) {
        return collectRow(spec, originals[i], rule, pending);
      });
      release();
    }

    // Главная зовёт KP.main один раз и через его oncomplite получает первую порцию рядов;
    // подгрузку при прокрутке (возвращённую функцию) обёртка не трогает.
    var orgMain = KP.main;
    if (typeof orgMain === 'function') {
      var active = Lampa.Activity.active();
      if (active && active.component === 'main' && active.source === 'KP') rowsFailed('main screen built before patch');
      KP.main = function (params, oncomplite, onerror) {
        return orgMain.call(KP, params, function (parts) {
          insertRows(parts, oncomplite);
        }, onerror);
      };
    }

    KP.__reactions_patched = true;
  }

  // Кнопка «Трейлер» сразу за «Смотреть» запускает первый ролик списка «Трейлеры» с одного
  // нажатия (spec kp-card-trailers). Список собирает и ролик запускает сам движок: обработчик
  // .view--trailer синхронно зовёт Lampa.Select.show, кнопка на этот вызов его перехватывает.
  function addTrailerButton(e) {
    if (e.type !== 'complite') return;
    // Карточку без трейлеров движок оставляет без .view--trailer ещё до complite.
    var trailers = e.body.find('.view--trailer');
    if (!trailers.length) return;
    var movie = (e.data && e.data.movie) || {};
    var name = movie.title || movie.name || '';
    var play = e.body.find('.button--play');
    if (!play.length) return console.warn('kp-reactions-fix: no play button, no trailer button', name);

    var button = $('<div class="full-start__button selector button--kp-trailer">' +
      '<svg><use xlink:href="#sprite-trailer"></use></svg><span>Трейлер</span></div>');
    button.on('hover:enter', function () {
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
    play.after(button);
  }

  function startPlugin() {
    Lampa.Listener.follow('full', addTrailerButton);
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
