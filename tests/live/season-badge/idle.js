(async function () {
  // Спек card-season-badge: «Повторный показ» — за 10 с простоя «Избранного» нет новых tv/<id>.
  Live.check(typeof window.__sb_tv === 'number', 'нет счётчика tv/<id>: шаг home не прошёл');
  var before = window.__sb_tv;
  await Live.sleep(10000);
  var after = window.__sb_tv;
  Live.check(after === before, 'за 10 с простоя ' + (after - before) + ' запросов tv/<id>');
  return 'ok: tv/<id> за простой — 0, всего ' + after;
})()
