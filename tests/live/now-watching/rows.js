(async function () {
  // Ряды новинок на Главной KP (spec now-watching-new-releases, сценарий «Ряды на приставке»).
  var PAIRS = [
    ['Сейчас смотрят фильмы', 'Сейчас смотрят: новинки (фильмы)'],
    ['Сейчас смотрят сериалы', 'Сейчас смотрят: новинки (сериалы)']
  ];
  var MORE = '.items-line__more, .card-more';
  function lines() {
    var a = Lampa.Activity.active();
    return a.component === 'main' && a.activity.component && a.activity.component.items || [];
  }
  function title(line) { return line.data.title.split(' · ')[0]; }

  var built = await Live.waitFor(function () { return lines().length >= 5; }, 20000);
  var a = Lampa.Activity.active();
  Live.check(built, 'Главная не собралась: активна ' + a.component + ', источник ' + a.source);
  Live.check(a.source === 'KP', 'источник Главной ' + a.source + ', нужен KP');

  var items = lines();
  var out = [];
  PAIRS.forEach(function (pair) {
    var at = items.findIndex(function (line) { return line.data.title === pair[0]; });
    Live.check(at !== -1, 'нет штатного ряда «' + pair[0] + '»');
    var original = items[at];
    var fresh = items[at + 1];
    Live.check(fresh && title(fresh) === pair[1], 'за «' + pair[0] + '» стоит «' + (fresh ? fresh.data.title : 'ничего') + '»');
    Live.check(original.render(true).querySelector(MORE), 'у штатного «' + pair[0] + '» нет «Ещё»');
    Live.check(!fresh.render(true).querySelector(MORE), 'у «' + fresh.data.title + '» есть «Ещё»');
    out.push(fresh.data.title + ': ' + fresh.data.results.length);
  });

  var threshold = new Date().getFullYear() - 1;
  var movies = items.find(function (line) { return title(line) === PAIRS[0][1]; });
  var old = movies.data.results.filter(function (card) {
    var year = parseInt((card.release_date || '').slice(0, 4), 10);
    return year && year < threshold;
  });
  Live.check(!old.length, 'в ряду новинок фильмов старое: ' + old.map(function (c) { return c.title + ' ' + c.release_date; }).join(', '));

  // R11: когда пришёл последний ответ коллекций Кинопоиска — от старта страницы.
  var collections = performance.getEntriesByType('resource').filter(function (e) { return e.name.indexOf('films/collections') !== -1; });
  var last = Math.max.apply(null, collections.map(function (e) { return e.responseEnd; }).concat([0]));
  return 'ok: ' + out.join('; ') + '; ответы коллекций КП: ' + collections.length + ', последний через ' + Math.round(last) + ' мс от старта';
})()
