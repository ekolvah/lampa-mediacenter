(async function () {
  // KP-карточка без imdb_id («Зверь», KP 5512124): тайтл находится поиском по названию
  // (change kp-trailers-by-title, design 9) и карточка показывает «Трейлеры». У TMDB видео
  // только на en, поэтому первым стоит русский трейлер сервиса (change kp-trailers-ru-youtube).
  var card = kpCard('KP_5512124');
  var full = await cardFull(card);
  Live.check(!full.movie.imdb_id, 'у ' + card.id + ' появился imdb_id ' + full.movie.imdb_id + ': выбрать другую карточку без imdb_id');
  var first = await serviceFirst(card, full);
  await openCard(card);
  // Для playing.js: и кнопкой, и первым в списке «Трейлеры» наружу отдаётся этот ролик.
  window.__kpRuTrailer = first;
  return 'ok: ' + card.id + ' без imdb_id, видео ' + full.videos.results.length + ', первым ' + first.key;
})()
