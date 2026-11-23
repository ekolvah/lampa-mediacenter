(async function () {
  // Главная KP без рядов kp_source (spec kp-main-new-release-rows, сценарий «Главная на приставке»).
  // cdp.py ждёт ответа шага не дольше 20 с: Главная — до 20 с от рестарта, сам шаг ответит раньше.
  await waitHome();
  var titles = lines().map(function (l) { return l.data.title; });
  var stale = titles.filter(function (t) { return /^(Топ фильмы|Топ сериалы|Популярные )/.test(t); });
  Live.check(!stale.length, 'на Главной ряды kp_source: ' + stale.join(', '));
  return 'ok: ' + titles.join(' | ');
})()
