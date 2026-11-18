(async function () {
  // Ряды новинок на Главной KP (spec now-watching-new-releases, сценарий «Ряды на приставке»).
  // Штатный ряд ищем по url коллекции, как плагин (design, решение 2), а не по заголовку.
  var PAIRS = [
    ['api/v2.2/films/collections?type=TOP_POPULAR_MOVIES', 'Сейчас смотрят: новинки (фильмы)'],
    ['api/v2.2/films/collections?type=POPULAR_SERIES', 'Сейчас смотрят: новинки (сериалы)']
  ];
  var MORE = '.items-line__more, .card-more';
  function lines() {
    var a = Lampa.Activity.active();
    return a.component === 'main' && a.activity.component && a.activity.component.items || [];
  }
  function title(line) { return line.data.title.split(' · ')[0]; }

  // R11: Главная собрана не позже этого момента от старта страницы (опрос раз в 250 мс).
  var built = await Live.waitFor(function () { return lines().length >= 5; }, 20000);
  var builtAt = Math.round(performance.now());
  var a = Lampa.Activity.active();
  Live.check(built, 'Главная не собралась: активна ' + a.component + ', источник ' + a.source);
  Live.check(a.source === 'KP', 'источник Главной ' + a.source + ', нужен KP');

  var items = lines();
  var fresh = PAIRS.map(function (pair) {
    var at = items.findIndex(function (line) { return line.data.url === pair[0]; });
    Live.check(at !== -1, 'нет штатного ряда ' + pair[0]);
    var original = items[at];
    var next = items[at + 1];
    Live.check(next && title(next) === pair[1], 'за «' + original.data.title + '» стоит «' + (next ? next.data.title : 'ничего') + '»');
    Live.check(original.render(true).querySelector(MORE), 'у штатного «' + original.data.title + '» нет «Ещё»');
    Live.check(!next.render(true).querySelector(MORE), 'у «' + next.data.title + '» есть «Ещё»');
    return next;
  });

  var threshold = new Date().getFullYear() - 1;
  var old = fresh[0].data.results.filter(function (card) {
    var year = parseInt((card.release_date || '').slice(0, 4), 10);
    return year && year < threshold;
  });
  Live.check(!old.length, 'в ряду новинок фильмов старое: ' + old.map(function (c) { return c.title + ' ' + c.release_date; }).join(', '));

  return 'ok: ' + fresh.map(function (line) { return line.data.title + ': ' + line.data.results.length; }).join('; ') +
    '; Главная собрана не позже ' + builtAt + ' мс от старта';
})()
