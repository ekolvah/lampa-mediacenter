(async function () {
  // Новинки в штатных рядах Главной KP (spec now-watching-new-releases, сценарий «Ряды на приставке»).
  // Штатный ряд ищем по url коллекции, как плагин, а не по заголовку.
  var URLS = ['api/v2.2/films/collections?type=TOP_POPULAR_MOVIES', 'api/v2.2/films/collections?type=POPULAR_SERIES'];
  var MORE = '.items-line__more, .card-more';
  var threshold = new Date().getFullYear() - 1;
  function lines() {
    var a = Lampa.Activity.active();
    return a.component === 'main' && a.activity.component && a.activity.component.items || [];
  }
  function oldMovies(cards) {
    return cards.filter(function (card) {
      var year = parseInt((card.release_date || '').slice(0, 4), 10);
      return year && year < threshold;
    }).map(function (c) { return c.title + ' ' + c.release_date; });
  }

  // R11: Главная собрана не позже этого момента от старта страницы (опрос раз в 250 мс).
  var built = await Live.waitFor(function () { return lines().length >= 3; }, 20000);
  var builtAt = Math.round(performance.now());
  var a = Lampa.Activity.active();
  Live.check(built, 'Главная не собралась: активна ' + a.component + ', источник ' + a.source);
  Live.check(a.source === 'KP', 'источник Главной ' + a.source + ', нужен KP');

  var items = lines();
  var extra = items.filter(function (line) { return /^Сейчас смотрят: новинки/.test(line.data.title); });
  Live.check(!extra.length, 'остались отдельные ряды: ' + extra.map(function (l) { return l.data.title; }).join(', '));
  var rows = URLS.map(function (url) {
    var line = items.filter(function (l) { return l.data.url === url; })[0];
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
