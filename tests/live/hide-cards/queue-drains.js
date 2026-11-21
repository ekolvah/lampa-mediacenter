(async function () {
  // После queue-cold и rebuild-main у каждой TMDB-карточки рядов на экране есть
  // вердикт: очередь не встала. Ждём до 15 с — сокет cdp.py держит запрос до 20 с,
  // поэтому hide-cards.sh повторяет шаг до четырёх раз.
  var p = HC.plugin();
  var missing = [];
  var total = 0;
  await HC.until(function () {
    var cache = Lampa.Storage.get('torrent_filter_badge_cache', {});
    missing = [];
    total = 0;
    HC.rows().forEach(function (line) {
      HC.cards(line).forEach(function (it) {
        if (it.data.source !== 'tmdb') return;
        total++;
        if (!cache[p.verdictKey(it.data)]) missing.push(it.data.title || it.data.name);
      });
    });
    return total >= 3 && !missing.length;
  }, 60, 250);
  HC.check(total >= 3, 'на Главной меньше трёх TMDB-карточек (' + total + ')');
  HC.check(!missing.length, 'очередь не дошла, нет вердикта у ' + missing.length + ' из ' + total + ': ' + missing.join(', '));
  return 'ok: вердикты у всех ' + total + ' TMDB-карточек';
})()
