(async function () {
  // Шаг 1: в начале recomends_scan — TMDB-тайтлы KP-истории.
  var exp = await kpExpected();
  Live.check(exp.keys.length, 'в KP-истории нет записей с imdb_id, которые нашёл TMDB find');
  var all = await Live.waitFor(function () {
    var q = scanQueue();
    return exp.keys.every(function (k) { return queued(q, k); });
  }, 15000);
  var q = scanQueue();
  var missing = exp.keys.filter(function (k) { return !queued(q, k); });
  Live.check(all, 'нет в recomends_scan: ' + missing.join(', '));
  // Плагин ставит не больше exp.kp записей, все — в начало очереди.
  var last = Math.max.apply(null, exp.keys.map(function (k) { return q.indexOf(queued(q, k)); }));
  Live.check(last < exp.kp, 'KP-тайтлы не в начале очереди: последний на ' + last + ', KP-записей ' + exp.kp);
  var first = exp.keys.filter(function (k) { return !queued(q, k).scan; })[0];
  window.__recsExpected = exp.keys;
  window.__recsFirst = first || null;
  return 'ok: ' + exp.keys.length + ' KP-тайтлов в первых ' + (last + 1) + ' из ' + q.length +
    ' записей очереди; ждём скана ' + (first || 'любой записи (все отсканированы)');
})()
