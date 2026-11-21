(async function () {
  // Новинки в штатных рядах Главной KP (spec now-watching-new-releases, сценарий «Ряды на приставке»).
  var MORE = '.items-line__more, .card-more';
  var threshold = new Date().getFullYear() - 1;
  function oldMovies(cards) {
    return cards.filter(function (card) {
      var year = parseInt((card.release_date || '').slice(0, 4), 10);
      return year && year < threshold;
    }).map(function (c) { return c.title + ' ' + c.release_date; });
  }

  // R11: Главная собрана не позже этого момента от старта страницы.
  var builtAt = await waitHome();

  var extra = lines().filter(function (line) { return /^Сейчас смотрят: новинки/.test(line.data.title); });
  Live.check(!extra.length, 'остались отдельные ряды: ' + extra.map(function (l) { return l.data.title; }).join(', '));
  var rows = URLS.map(function (url) {
    var line = rowOf(url);
    Live.check(line, 'нет штатного ряда ' + url);
    Live.check(line.render(true).querySelector(MORE), 'у «' + line.data.title + '» нет «Ещё»');
    return line;
  });
  var old = oldMovies(rows[0].data.results);
  Live.check(!old.length, 'в ряду фильмов старое: ' + old.join(', '));

  // Полный список по «Ещё»: 2-я страница через тот же KP.list, что зовёт category_full.
  var page2 = await new Promise(function (resolve) {
    Lampa.Api.sources.KP.list({ url: URLS[0], page: 2 }, resolve, function () { resolve(null); });
  });
  Live.check(page2, '2-я страница полного списка фильмов: ошибка');
  Live.check(page2.results.length, '2-я страница полного списка фильмов пуста');
  old = oldMovies(page2.results);
  Live.check(!old.length, 'на 2-й странице полного списка старое: ' + old.join(', '));

  return 'ok: ' + rows.map(function (line) {
    return line.data.title + ': ' + line.data.results.length + ', страниц ' + line.data.total_pages;
  }).join('; ') + '; полный список фильмов, стр. ' + page2.page + ': ' + page2.results.length +
    '; Главная собрана не позже ' + builtAt + ' мс от старта';
})()
