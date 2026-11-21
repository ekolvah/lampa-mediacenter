(async function () {
  // Очередь на TMDB-карточках (change badge-queue-tmdb-cards, design 3): снять из
  // кэша вердикты TMDB-карточек рядов на экране, чтобы после rebuild-main они
  // снова пошли через парсер. Меньше трёх — шаг ничего не докажет при MAX_CONCURRENT = 2.
  var p = HC.plugin();
  var cache = Lampa.Storage.get('torrent_filter_badge_cache', {});
  var cards = [];
  HC.rows().forEach(function (line) {
    HC.cards(line).forEach(function (it) { if (it.data.source === 'tmdb') cards.push(it); });
  });
  HC.check(cards.length >= 3, 'на Главной меньше трёх TMDB-карточек (' + cards.length +
    '): нет рядов «Рекомендуем посмотреть» или источник не KP');
  cards.forEach(function (it) { delete cache[p.verdictKey(it.data)]; });
  Lampa.Storage.set('torrent_filter_badge_cache', cache);
  return 'ok: сброшено ' + cards.length + ' вердиктов TMDB-карточек';
})()
