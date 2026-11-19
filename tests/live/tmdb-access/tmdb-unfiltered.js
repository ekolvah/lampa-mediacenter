(async function () {
  // Спек tmdb-access. Адреса печатаются без query: в нём токен и email аккаунта.
  var bare = function (url) { return url.split('?')[0]; };
  Live.check(await Live.waitFor(function () {
    return window.Lampa && Lampa.TMDB && Lampa.Api && window.alcopac_plugin_list;
  }, 10000), 'Lampa или бандл Lampac не загрузились за 10 с');
  // Модуль tmdbproxy грузится асинхронно: если он в бандле, дождаться его подмены, иначе шаг
  // проскочит раньше неё.
  if ((window.alcopac_loaded_plugins || {}).tmdbproxy) {
    await Live.waitFor(function () { return /l-vid/.test(Lampa.TMDB.api('')); }, 10000);
  }
  var api = Lampa.TMDB.api('find/tt33071426');
  var image = Lampa.TMDB.image('t/p/w200/x.jpg');
  // Сценарий «Адреса TMDB не ведут на прокси Lampac».
  [api, image].forEach(function (url) {
    Live.check(url.indexOf('beta.l-vid.online') < 0, 'TMDB через прокси Lampac: ' + bare(url));
  });
  // Сценарий «Тайтл, скрытый прокси Lampac, находится» — тот же вызов, что resolveTitle плагина.
  var found = await Promise.race([
    new Promise(function (ok, fail) {
      Lampa.Api.sources.tmdb.get('find/tt33071426?external_source=imdb_id', {}, ok, function () {
        fail(new Error('find/tt33071426 вернул ошибку'));
      });
    }),
    Live.sleep(10000).then(function () { throw new Error('find/tt33071426 не ответил за 10 с'); })
  ]);
  var ids = (found.movie_results || []).map(function (m) { return m.id; });
  Live.check(ids.indexOf(1325734) >= 0, 'find/tt33071426: movie_results ' + JSON.stringify(ids));
  return 'ok: api ' + bare(api) + ', image ' + bare(image) + ', find -> 1325734';
})()
