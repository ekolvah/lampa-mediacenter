(async function () {
  // Спек favorites-across-sources: «Один сериал из TMDB и из KP» и «KP-карточка тайтла, сохранённого
  // из TMDB». Только чтение: toggle не зовётся — это правка аккаунта пользователя.
  // Одно ожидание меньше 20 с — предела ответа tools/cdp.py.
  var ready = await Live.waitFor(function () {
    return window.Lampa && Lampa.Favorite && Lampa.Favorite.__kp_merged && Lampa.Account.Permit.sync &&
      Lampa.Favorite.get({ type: 'book' }).length;
  }, 15000);
  Live.check(ready, 'за 15 с нет обёрток плагина (Lampa.Favorite.__kp_merged: ' +
    !!(window.Lampa && Lampa.Favorite && Lampa.Favorite.__kp_merged) + '), CUB-синхронизации или закладок «book»');

  function dups(list) {
    var seen = {};
    return list.filter(function (card) {
      if (!card.imdb_id) return false;
      if (seen[card.imdb_id]) return true;
      seen[card.imdb_id] = true;
      return false;
    }).map(function (card) { return card.id + ' ' + card.imdb_id; });
  }

  var all = Lampa.Favorite.all();
  var types = Object.keys(all);
  var counts = [];
  types.forEach(function (type) {
    var list = Lampa.Favorite.get({ type: type });
    var twice = dups(list).concat(dups(all[type]));
    Live.check(!twice.length, type + ': две записи одного imdb_id: ' + twice.join(', '));
    counts.push(type + '=' + list.length);
  });

  var book = Lampa.Favorite.get({ type: 'book' }).filter(function (card) { return card.imdb_id; })[0];
  Live.check(book, 'в «book» нет записи с imdb_id');
  var found = Lampa.Favorite.check({ id: 'KP_0', source: 'KP', imdb_id: book.imdb_id });
  Live.check(found.book === true, 'KP-карточка ' + book.imdb_id + ' не видит закладку ' + book.id + ': ' + JSON.stringify(found));
  return 'ok: ' + counts.join(' ') + '; KP_0 видит ' + book.id + ' ' + book.imdb_id;
})()
