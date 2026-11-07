(async function () {
  // KP-карточка без imdb_id («Зверь», KP 5512124): тайтл находится поиском по названию
  // (change kp-trailers-by-title, design 9) и карточка показывает «Трейлеры».
  var ID = 'KP_5512124';
  var full = await new Promise(function (ok, fail) {
    Lampa.Api.sources.KP.full(kpCard(ID), ok, function () {
      fail(new Error('KP.full ' + ID + ' вернул ошибку'));
    });
  });
  Live.check(!full.movie.imdb_id, 'у ' + ID + ' появился imdb_id ' + full.movie.imdb_id + ': выбрать другую карточку без imdb_id');
  Live.check(full.videos && full.videos.results && full.videos.results.length, 'поиск по названию не дал видео для ' + ID);
  await openCard(ID);
  return 'ok: ' + ID + ' без imdb_id, видео ' + full.videos.results.length;
})()
