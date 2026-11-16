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

  var DAY = 60 * 24; // life кэша движка — в минутах
  var WEEK = DAY * 7;
  var TRAILER_SERVICE = 'http://127.0.0.1:9118/trailer';
  // Больше срока поиска в сервисе (8 с): при зависшем YouTube успевает прийти его 502.
  var TRAILER_TIMEOUT_MS = 10000;

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
      var season = null;
      var waiting = title.method === 'tv' ? 2 : 1;
      function ready() {
        if (--waiting === 0) trailers(result, title, videos, season, done);
      }

      if (title.method === 'tv') {
        lastSeason(title, function (last) {
          season = last;
          ready();
        });
      }
      // Сбой запроса движок отдаёт как пустой список — не отличить от «видео нет».
      tmdb.videos(title, function (answer) {
        videos = answer;
        ready();
      });
    }

    // Список «Трейлеры»: видео TMDB, первым — русский трейлер сервиса; у сериала с последним
    // сезоном N ≥ 2 — трейлер сезона N, при отказе сервиса — из видео сезона в TMDB.
    function trailers(result, title, videos, last, done) {
      var list = (videos && videos.results) || [];
      if (!list.length) {
        console.warn('kp-reactions-fix: no videos', title.method, title.id);
      }
      result.videos = videos;
      var season = last && last.number >= 2 ? last : null;
      var hasRu = list.some(function (v) { return v.iso_639_1 === 'ru'; });
      // Русский ролик TMDB не говорит, какого он сезона, поэтому у сериала сервис спрашивают всегда.
      if (hasRu && !season) return done();

      var movie = result.movie;
      ruTrailer(movie, season, function (video) {
        if (video) {
          result.videos = { results: putFirst(video, season ? season.date : releaseDate(movie), list) };
          return done();
        }
        if (!season) return done();
        seasonTrailer(title, movie, season, function (trailer) {
          if (trailer) result.videos = { results: putFirst(trailer, season.date, list) };
          done();
        });
      });
    }

    function time(video) {
      return new Date(video.published_at).getTime();
    }

    // Ролик первым в списке «Трейлеры» по ключам сортировки движка: язык tmdb_lang (до «Ещё»)
    // и published_at строго позже самого нового в списке — при равных датах порядок не задан.
    function putFirst(video, date, list) {
      var newest = list.reduce(function (max, v) { return time(v) > max ? time(v) : max; }, -Infinity);
      var at = date;
      if (newest > -Infinity && !(new Date(date).getTime() > newest)) at = new Date(newest + 1000).toISOString();
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
          console.warn('kp-reactions-fix: no last episode, trailer not by season', title.id);
          return cb(null);
        }
        cb({ number: episode.season_number, date: episode.air_date || '' });
      }, function () {
        console.warn('kp-reactions-fix: tv details failed, trailer not by season', title.id);
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
        if (!trailer) console.warn('kp-reactions-fix: no season trailer', movie.title || movie.original_title || '', 'season ' + season.number, reason);
        cb(trailer);
      }
      var timer = setTimeout(function () { finish(null, 'timeout'); }, TRAILER_TIMEOUT_MS);

      tmdb.videos({ method: title.method + '/' + title.id + '/season', id: season.number }, function (videos) {
        var list = videos && Array.isArray(videos.results) ? videos.results : [];
        var newest = null;
        list.forEach(function (v) {
          if (v.type === 'Trailer' && (!newest || time(v) > time(newest))) newest = v;
        });
        finish(newest, 'no trailer among ' + list.length + ' videos');
      });
    }

    function releaseDate(movie) {
      return (movie.type === 'tv' ? movie.first_air_date : movie.release_date) || '';
    }

    // Русский трейлер с YouTube от сервиса трейлеров на приставке (tools/trailer_service.py),
    // в форме видео TMDB; season — трейлер этого сезона. cb(null) — ролика нет, причина уже в
    // console.warn.
    function ruTrailer(movie, season, cb) {
      var name = movie.title || movie.original_title || '';
      var year = releaseDate(movie).slice(0, 4);
      var url = TRAILER_SERVICE + '?title=' + encodeURIComponent(name);
      if (movie.original_title) url += '&original_title=' + encodeURIComponent(movie.original_title);
      if (year) url += '&year=' + year;
      if (season) url += '&season=' + season.number;
      var where = [name, year].concat(season ? ['season ' + season.number] : []);

      function fail(reason) {
        console.warn.apply(console, ['kp-reactions-fix: no russian trailer'].concat(where, [reason]));
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
      var url = 'search/' + method + '?query=' + encodeURIComponent(movie.title || movie.original_title || '');
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
