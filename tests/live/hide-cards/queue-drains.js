(async function () {
  // После queue-cold и rebuild-main у каждой TMDB-карточки рядов на экране есть
  // вердикт: очередь не встала. Ждём до 15 с — сокет cdp.py держит запрос до 20 с,
  // поэтому hide-cards.sh повторяет шаг до четырёх раз.
  var p = HC.plugin();
  var cards = [];
  var missing = [];
  await HC.until(function () {
    var cache = Lampa.Storage.get('torrent_filter_badge_cache', {});
    cards = HC.tmdbCards();
    missing = cards.filter(function (it) { return !cache[p.verdictKey(it.data)]; });
    return cards.length >= 3 && !missing.length;
  }, 60, 250);
  HC.check(cards.length >= 3, 'на Главной меньше трёх TMDB-карточек (' + cards.length + ')');
  HC.check(!missing.length, 'очередь не дошла, нет вердикта у ' + missing.length + ' из ' + cards.length + ': ' +
    missing.map(function (it) { return it.data.title || it.data.name; }).join(', '));
  return 'ok: вердикты у всех ' + cards.length + ' TMDB-карточек';
})()
