(async function () {
  // Ряды новинок Главной KP (spec kp-main-new-release-rows, сценарий «Главная на приставке»): первая
  // порция KP.main и его подгрузка до reject. Каждая порция ждёт не дольше 5 с — шаг укладывается в
  // 20 с cdp.py, пока Кинопоиск отвечает.
  var TABLE = ['Топ новинок: фильмы', 'Топ новинок: сериалы', 'Топ новинок: мини-сериалы',
    'Новые комедии', 'Новые ужасы', 'Новая фантастика', 'Новые боевики', 'Новые триллеры',
    'Новые мультфильмы', 'Новые семейные фильмы', 'Новые детективные сериалы',
    'Новые комедийные сериалы', 'Новые драматические сериалы'];
  var NOW_WATCHING = ['api/v2.2/films/collections?type=TOP_POPULAR_MOVIES', 'api/v2.2/films/collections?type=POPULAR_SERIES'];
  var minYear = new Date().getFullYear() - 1;
  var KP = Lampa.Api.sources.KP;

  var next;
  var first = await new Promise(function (resolve, reject) {
    next = KP.main({}, resolve, function () { reject(new Error('KP.main: onerror')); });
  });
  var loaded = [];
  for (;;) {
    var portion = await new Promise(function (resolve) { next(resolve, function () { resolve(null); }); });
    if (!portion) break;
    Live.check(portion.length <= 5, 'порция подгрузки из ' + portion.length + ' рядов');
    loaded = loaded.concat(portion);
  }
  var rows = first.filter(function (r) { return TABLE.indexOf(r.title) !== -1; }).concat(loaded);
  Live.check(rows.length, 'нет ни одного ряда новинок');

  var order = rows.map(function (r) { return TABLE.indexOf(r.title); });
  Live.check(order.every(function (k, i) { return k !== -1 && (!i || k > order[i - 1]); }),
    'ряды новинок не по таблице: ' + rows.map(function (r) { return r.title; }).join(' | '));

  var old = [];
  rows.forEach(function (r) {
    r.results.forEach(function (c) {
      var year = parseInt((c.release_date || c.first_air_date || '').slice(0, 4), 10);
      if (year && year < minYear) old.push(r.title + ': ' + (c.title || c.name) + ' ' + year);
    });
  });
  Live.check(!old.length, 'в рядах новинок старое: ' + old.join(', '));

  var seen = {};
  var repeats = [];
  first.filter(function (r) { return NOW_WATCHING.indexOf(r.url) !== -1; }).concat(rows).forEach(function (r) {
    r.results.forEach(function (c) {
      if (seen[c.id]) repeats.push(r.title + ': ' + (c.title || c.name) + ' (уже в ' + seen[c.id] + ')');
      else seen[c.id] = r.title;
    });
  });
  Live.check(!repeats.length, 'повторы между рядами Кинопоиска: ' + repeats.join(', '));

  var top = rows.filter(function (r) { return r.title === TABLE[0]; })[0];
  Live.check(top, 'нет ряда «' + TABLE[0] + '»');
  var page2 = await new Promise(function (resolve) {
    KP.list({ url: top.url, page: 2 }, resolve, function () { resolve(null); });
  });
  Live.check(page2 && page2.results && page2.results.length, '«Ещё» у «' + TABLE[0] + '»: 2-я страница пуста или ошибка');

  return 'ok: первая порция ' + first.length + ' рядов; ряды новинок: ' + rows.map(function (r) {
    return r.title + ' ' + r.results.length;
  }).join(', ') + '; «' + TABLE[0] + '», стр. 2: ' + page2.results.length;
})()
