(function () {
  'use strict';

  // На источнике KP (плагин kp_source) карточки несут id вида "KP_<kinopoisk_id>",
  // а блок реакций (эмодзи-счётчики под жанрами) в движке жёстко ходит в
  // cub.red по TMDB id — у KP-карточек его нет, поэтому блок всегда пуст
  // ("Нет реакций"). Патч дорезолвливает TMDB id через imdb_id (который KP
  // отдаёт) и подставляет реакции в ответ KP.full() тем же способом, каким их
  // получает штатный источник tmdb — см. docs/lampa-config-review.md.

  function patch() {
    var KP = Lampa.Api.sources.KP;
    var cub = Lampa.Api.sources.cub;
    var tmdb = Lampa.Api.sources.tmdb;

    if (!KP || !cub || !tmdb || KP.__reactions_patched) return;

    var orgFull = KP.full;

    KP.full = function (params, oncomplite, onerror) {
      return orgFull.call(KP, params, function (result) {
        var movie = result && result.movie;

        if (!movie || !movie.imdb_id) return oncomplite(result);

        tmdb.get('find/' + movie.imdb_id + '?external_source=imdb_id', {}, function (found) {
          var matches = (found.movie_results && found.movie_results.length) ? found.movie_results : found.tv_results;

          if (matches && matches[0]) {
            cub.reactionsGet({ method: movie.type, id: matches[0].id }, function (reactions) {
              result.reactions = reactions;
              oncomplite(result);
            });
          } else {
            oncomplite(result);
          }
        }, function () {
          oncomplite(result);
        });
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
