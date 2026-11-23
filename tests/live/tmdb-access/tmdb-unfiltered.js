(async function () {
  // Спек tmdb-access. Адреса печатаются без query: в нём токен и email аккаунта.
  // Фикстура: «Вот это драма!» — тайтл, который прокси Lampac вырезает (#73).
  var IMDB = 'tt33071426', TMDB_ID = 1325734, FIND = 'find/' + IMDB;
  var bare = function (url) { return url.split('?')[0]; };
  await waitLampa();
  Live.check(await Live.waitFor(function () { return window.alcopac_plugin_list; }, 10000),
    'бандл Lampac не загрузился за 10 с');
  // Модуль tmdbproxy грузится асинхронно: если он в бандле, дождаться его подмены, иначе шаг
  // проскочит раньше неё.
  if ((window.alcopac_loaded_plugins || {}).tmdbproxy) {
    await Live.waitFor(function () { return /l-vid/.test(Lampa.TMDB.api('')); }, 10000);
  }
  var api = Lampa.TMDB.api(FIND);
  var image = Lampa.TMDB.image('t/p/w200/x.jpg');
  // Сценарий «Адреса TMDB не ведут на прокси Lampac».
  [api, image].forEach(function (url) {
    Live.check(url.indexOf('beta.l-vid.online') < 0, 'TMDB через прокси Lampac: ' + bare(url));
  });
  // Сценарий «Тайтл, скрытый прокси Lampac, находится» — тот же вызов, что resolveTitle плагина.
  var found = await call(FIND, function (ok, err) {
    Lampa.Api.sources.tmdb.get(FIND + '?external_source=imdb_id', {}, ok, err);
  });
  var ids = (found.movie_results || []).map(function (m) { return m.id; });
  Live.check(ids.indexOf(TMDB_ID) >= 0, FIND + ': movie_results ' + JSON.stringify(ids));
  return 'ok: api ' + bare(api) + ', image ' + bare(image) + ', find -> ' + TMDB_ID;
})()
