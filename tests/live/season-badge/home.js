(async function () {
  // Спек card-season-badge: «KP-карточка сериала» на Главной KP и «Фильм». Одно ожидание меньше 20 с —
  // предела ответа tools/cdp.py. Счётчик tv/<id> для шага idle: обёртка tmdb.get до рестарта.
  var a = Lampa.Activity.active();
  Live.check(a.component === 'main' && a.source === 'KP', 'активна не Главная KP: ' + a.component + ', ' + a.source);
  var tmdb = Lampa.Api.sources.tmdb;
  if (!window.__sb_tv) {
    window.__sb_tv = 0;
    var get = tmdb.get;
    tmdb.get = function (url) {
      if (/^tv\/\d+$/.test(url)) window.__sb_tv++;
      return get.apply(this, arguments);
    };
  }

  function kpSeries() {
    return SB.cards().filter(function (el) { return el.card_data.source === 'KP' && SB.series(el.card_data); });
  }
  var ok = await Live.waitFor(function () { return kpSeries().some(SB.badge); }, 15000);
  Live.check(ok, 'за 15 с ни одной метки на ' + kpSeries().length + ' KP-сериалах Главной');
  var movies = SB.moviesWithBadge();
  Live.check(!movies.length, 'метки на фильмах: ' + movies.join(', '));
  return 'ok: метки ' + kpSeries().filter(SB.badge).map(SB.badge).join(', ');
})()
