(async function () {
  // Карточка источника tmdb «Бегущий по лезвию: Чёрный лотос» (tv/84553, один сезон): у TMDB видео
  // только на en, первым стоит русский трейлер сервиса (change card-trailers-any-source).
  var card = sourceCard('tmdb', 'tv', 84553);
  var full = await cardFull(card);
  var first = await serviceFirst(card, full);
  await openCard(card);
  // Для playing.js: кнопкой «Трейлер» наружу отдаётся этот ролик.
  window.__kpRuTrailer = first;
  return 'ok: tmdb tv/84553, видео ' + full.videos.results.length + ', первым ' + first.key + ' «' + first.name + '»';
})()
