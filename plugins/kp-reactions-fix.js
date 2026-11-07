(function () {
  'use strict';

  // На источнике KP (плагин kp_source) карточки несут id вида "KP_<kinopoisk_id>",
  // а движок берёт реакции (cub.red) и трейлеры (TMDB videos) по TMDB id — у
  // KP-карточек его нет, поэтому блок реакций пуст, а кнопки «Трейлеры» нет.
  // Патч дорезолвливает TMDB-тайтл через imdb_id (который KP отдаёт) и
  // подставляет в ответ KP.full() reactions и videos тем же способом, каким их
  // получает штатный источник tmdb — см. docs/lampa-config-review.md.

  var WEEK = 60 * 24 * 7; // life кэша движка — в минутах

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

    KP.full = function (params, oncomplite, onerror) {
      return orgFull.call(KP, params, function (result) {
        var movie = result && result.movie;

        if (!movie || !movie.imdb_id) return oncomplite(result);

        tmdb.get('find/' + movie.imdb_id + '?external_source=imdb_id', {}, function (found) {
          var title = null;
          if (found.movie_results && found.movie_results[0]) title = { method: 'movie', id: found.movie_results[0].id };
          else if (found.tv_results && found.tv_results[0]) title = { method: 'tv', id: found.tv_results[0].id };

          if (title) enrich(result, title, oncomplite);
          else oncomplite(result);
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
