(async function () {
  // Память рядов (spec now-watching-new-releases, «Первый запуск»): после сборки Главной в
  // kp_now_watching_seen есть оба ряда. Из памяти ряда фильмов забывается карточка не с первого
  // места: на следующей сборке она снова «появилась» и должна встать первой.
  await waitHome();
  var seen = Lampa.Storage.get(SEEN_KEY, '{}');
  URLS.forEach(function (url) {
    Live.check(seen[url] && typeof seen[url] === 'object', 'в ' + SEEN_KEY + ' нет ряда ' + url);
  });
  var row = rowOf(URLS[0]);
  Live.check(row && row.data.results.length >= 2, 'в ряду фильмов меньше двух карточек');
  var card = row.data.results[1];
  Live.check(seen[URLS[0]][card.id], 'карточки ' + card.id + ' нет в памяти ряда фильмов');
  delete seen[URLS[0]][card.id];
  Lampa.Storage.set(SEEN_KEY, seen);
  return 'ok: id ' + card.id + ' (' + card.title + ') забыт';
})()
