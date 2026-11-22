(async function () {
  // KP-карточка без TMDB-тайтла («Буду рядом», KP 14897335): ни find, ни поиск по названию тайтл
  // не находят, реакций нет, а «Трейлеры» — один русский трейлер сервиса (change
  // kp-trailer-without-title).
  var card = kpCard('KP_14897335');
  var full = await cardFull(card);
  // enrich присваивает reactions при любом ответе reactionsGet: ключ есть — тайтл найден.
  Live.check(!('reactions' in full), 'у ' + card.id + ' нашёлся TMDB-тайтл: выбрать другую карточку из `no title match`');
  var first = await serviceFirst(card, full);
  await openCard(card);
  // Для playing.js: кнопкой «Трейлер» наружу отдаётся этот ролик.
  window.__kpRuTrailer = first;
  return 'ok: ' + card.id + ' без TMDB-тайтла, видео ' + full.videos.results.length + ', первым ' + first.key;
})()
