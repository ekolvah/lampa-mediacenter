(function () {
  'use strict';

  // На источнике KP (плагин kp_source) карточки несут id вида "KP_<kinopoisk_id>",
  // а движок берёт реакции (cub.red) и трейлеры (TMDB videos) по TMDB id — у
  // KP-карточек его нет, поэтому блок реакций пуст, а кнопки «Трейлеры» нет.
  // Патч дорезолвливает TMDB-тайтл через imdb_id (который KP отдаёт), а без
  // imdb_id или при пустом find — поиском TMDB по названию и году со сверкой
  // названия, и подставляет в ответ KP.full() reactions и videos тем же способом,
  // каким их получает штатный источник tmdb — см. docs/lampa-config-review.md.

  var WEEK = 60 * 24 * 7; // life кэша движка — в минутах

  // normalizeTitle/cleanTitle — копия из kp_source.js (наружу не экспортированы):
  // регистр, виды дефиса, «ё»/«е» и пунктуация при сравнении не важны.
  function cleanTitle(str) {
    return str.replace(/[\s.,:;\u2019'`!?]+/g, ' ').trim();
  }

  function normalizeTitle(str) {
    return cleanTitle(str.toLowerCase().replace(/[\-\u2010-\u2015\u2E3A\u2E3B\uFE58\uFE63\uFF0D]+/g, '-').replace(/ё/g, 'е'));
  }

  function titleSet(a, b) {
    var set = {};
    [a, b].forEach(function (t) { if (typeof t === 'string' && t) set[normalizeTitle(t)] = true; });
    return set;
  }

  function patch() {
    var KP = Lampa.Api.sources.KP;
    var cub = Lampa.Api.sources.cub;
    var tmdb = Lampa.Api.sources.tmdb;

    if (!KP || !cub || !tmdb || KP.__reactions_patched) return;

    var orgFull = KP.full;

    // Реакции и видео одного тайтла параллельно; oncomplite — когда пришли оба.
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

      // Сбой запроса движок отдаёт как пустой список — не отличить от «видео нет».
      tmdb.videos(title, function (videos) {
        if (!videos || !videos.results || !videos.results.length) {
          console.warn('kp-reactions-fix: no videos', title.method, title.id);
        }
        result.videos = videos;
        done();
      });
    }

    // Поиск тайтла по названию: тип из карточки, год строгий; с годом — первый
    // результат с совпадающим названием, без года — только единственный.
    function searchByTitle(result, movie, oncomplite) {
      var method = movie.type === 'tv' ? 'tv' : 'movie';
      var year = ((method === 'tv' ? movie.first_air_date : movie.release_date) || '').slice(0, 4);
      var yearKey = method === 'tv' ? 'first_air_date_year' : 'primary_release_year';
      var url = 'search/' + method + '?query=' + encodeURIComponent(movie.title || movie.original_title || '');
      if (year) url += '&' + yearKey + '=' + year;

      function fail(reason) {
        console.warn('kp-reactions-fix: no title match', reason, movie.title, year);
        oncomplite(result);
      }

      tmdb.get(url, {}, function (found) {
        var want = titleSet(movie.title, movie.original_title);
        var matches = ((found && found.results) || []).filter(function (r) {
          var have = titleSet(r.title || r.name, r.original_title || r.original_name);
          return Object.keys(have).some(function (t) { return want[t]; });
        });

        if (!matches.length) return fail('not found');
        if (!year && matches.length > 1) return fail('ambiguous without year');
        enrich(result, { method: method, id: matches[0].id }, oncomplite);
      }, function () {
        fail('search failed');
      }, { life: WEEK });
    }

    KP.full = function (params, oncomplite, onerror) {
      return orgFull.call(KP, params, function (result) {
        var movie = result && result.movie;

        if (!movie) return oncomplite(result);
        if (!movie.imdb_id) return searchByTitle(result, movie, oncomplite);

        tmdb.get('find/' + movie.imdb_id + '?external_source=imdb_id', {}, function (found) {
          var title = null;
          if (found.movie_results && found.movie_results[0]) title = { method: 'movie', id: found.movie_results[0].id };
          else if (found.tv_results && found.tv_results[0]) title = { method: 'tv', id: found.tv_results[0].id };

          if (title) enrich(result, title, oncomplite);
          else searchByTitle(result, movie, oncomplite);
        }, function () {
          console.warn('kp-reactions-fix: find failed, no reactions and trailers', movie.imdb_id);
          oncomplite(result);
        }, { life: WEEK });
      }, onerror);
    };

    KP.__reactions_patched = true;
  }

  function startPlugin() {
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
