(async function () {
  // KP-карточка без imdb_id («Зверь», KP 5512124): тайтл находится поиском по названию
  // (change kp-trailers-by-title, design 9) и карточка показывает «Трейлеры». У TMDB видео
  // только на en, поэтому первым стоит русский трейлер сервиса (change kp-trailers-ru-youtube).
  var ID = 'KP_5512124';
  var full = await new Promise(function (ok, fail) {
    Lampa.Api.sources.KP.full(kpCard(ID), ok, function () {
      fail(new Error('KP.full ' + ID + ' вернул ошибку'));
    });
  });
  Live.check(!full.movie.imdb_id, 'у ' + ID + ' появился imdb_id ' + full.movie.imdb_id + ': выбрать другую карточку без imdb_id');
  var videos = (full.videos && full.videos.results) || [];
  Live.check(videos.length, 'поиск по названию не дал видео для ' + ID);

  var url = 'http://127.0.0.1:9118/trailer?title=' + encodeURIComponent(full.movie.title)
    + '&original_title=' + encodeURIComponent(full.movie.original_title)
    + '&year=' + (full.movie.release_date || '').slice(0, 4);
  var pick = await new Promise(function (ok, fail) {
    var request = new Lampa.Reguest();
    request.timeout(10000);
    request.silent(url, ok, function (xhr) {
      fail(new Error('сервис трейлеров: HTTP ' + xhr.status + ' ' + xhr.statusText + ' ' + url));
    });
  });
  Live.check(pick.video_id, 'сервис трейлеров не дал ролик: ' + pick.reason);
  var first = videos[0];
  Live.check(first.iso_639_1 === 'ru' && first.key === pick.video_id,
    'первым не ролик сервиса ' + pick.video_id + ': ' + first.key + ' (' + first.iso_639_1 + ')');
  await openCard(ID);
  // Для playing.js: и кнопкой, и первым в списке «Трейлеры» наружу отдаётся этот ролик.
  window.__kpRuTrailer = first;
  return 'ok: ' + ID + ' без imdb_id, видео ' + videos.length + ', первым ' + first.key;
})()
