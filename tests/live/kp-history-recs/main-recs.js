(async function () {
  // Ряды рекомендаций ядра на Главной KP (spec kp-main-recommendations, сценарий «Ряды на приставке»).
  var NOW_WATCHING = ['api/v2.2/films/collections?type=TOP_POPULAR_MOVIES', 'api/v2.2/films/collections?type=POPULAR_SERIES'];
  var TITLES = ['Рекомендуем посмотреть фильмы', 'Рекомендуем посмотреть сериалы'];
  var MORE = '.items-line__more, .card-more';
  function lines() {
    var a = Lampa.Activity.active();
    return a.component === 'main' && a.activity.component && a.activity.component.items || [];
  }

  // cdp.py ждёт ответа шага не дольше 20 с: Главная — до 12 с, экран «Ещё» — до 5 с.
  var built = await Live.waitFor(function () { return lines().length >= 3; }, 12000);
  var a = Lampa.Activity.active();
  Live.check(built, 'Главная не собралась: активна ' + a.component + ', источник ' + a.source);
  Live.check(a.source === 'KP', 'источник Главной ' + a.source + ', нужен KP');

  var items = lines();
  var titles = items.map(function (l) { return l.data.title; });
  var incomplete = titles.filter(function (t) { return /^Рекомендуем посмотреть.* · неполный$/.test(t); });
  if (incomplete.length) return 'wait: ряды рекомендаций собраны до конца прохода по KP-истории: ' + incomplete.join(', ');

  // 1. Сразу за последним рядом «Сейчас смотрят» — оба ряда рекомендаций с «Ещё».
  var last = -1;
  items.forEach(function (l, i) { if (NOW_WATCHING.indexOf(l.data.url) !== -1) last = i; });
  var recs = TITLES.map(function (title, k) {
    var line = items[last + 1 + k];
    Live.check(line && line.data.title === title, 'за «Сейчас смотрят» нет «' + title + '», ряды: ' + titles.join(' | '));
    Live.check(line.render(true).querySelector(MORE), 'у «' + title + '» нет «Ещё»');
    return line;
  });

  // 2. Карточки — TMDB, без тайтлов истории: ни по id записей не из KP (их ядро сравнивает с id
  // рекомендаций), ни по найденным плагином TMDB-тайтлам KP-записей.
  var watched = {};
  Lampa.Favorite.get({ type: 'history' }).forEach(function (h) { if (h.source !== 'KP') watched[h.id] = true; });
  var kp = kpKeys() || [];
  recs.forEach(function (line) {
    line.data.results.forEach(function (card) {
      var name = '«' + line.data.title + '»: ' + (card.title || card.name) + ' ' + card.id;
      Live.check(card.source === 'tmdb', name + ', источник ' + card.source);
      Live.check(!watched[card.id], name + ' есть в истории');
      Live.check(kp.indexOf(recKey(card.id, isTv(card))) === -1, name + ' — тайтл KP-истории');
    });
  });

  // 3. «Ещё» сериалов — штатный экран рекомендаций ядра для сериалов.
  recs[1].data.params.emit.onlyMore();
  var opened = await Live.waitFor(function () { return Lampa.Activity.active().component === 'recomend'; }, 5000);
  var more = Lampa.Activity.active();
  Live.check(opened && more.media === 'tv', '«Ещё» сериалов открыл ' + more.component + ', media ' + more.media);
  Lampa.Activity.backward();

  return 'ok: ' + recs.map(function (line) {
    return line.data.title + ': ' + line.data.results.length + ', страниц ' + line.data.total_pages;
  }).join('; ') + '; KP-тайтлов истории ' + kp.length + '; «Ещё» сериалов — recomend tv';
})()
