(async function () {
  // Шаг 1: проход плагина закончен, найденные им тайтлы KP-истории — в начале recomends_scan.
  var keys;
  if (!await Live.waitFor(function () { return (keys = kpKeys()); }, 15000)) return 'wait: проход плагина по KP-истории ещё идёт';
  var q = scanQueue();
  var missing = keys.filter(function (k) { return !queued(q, k); });
  Live.check(!missing.length, 'нет в recomends_scan: ' + missing.join(', '));
  // Плагин ставит не больше записей, чем KP-записей в истории, все — в начало очереди.
  var kp = Lampa.Favorite.get({ type: 'history' }).filter(function (e) { return e.source === 'KP'; }).length;
  var last = Math.max.apply(null, keys.map(function (k) { return q.indexOf(queued(q, k)); }));
  Live.check(last < kp, 'KP-тайтлы не в начале очереди: последний на ' + last + ', KP-записей ' + kp);
  var first = keys.filter(function (k) { return !queued(q, k).scan; })[0];
  window.__recsFirst = first || null;
  return 'ok: ' + keys.length + ' KP-тайтлов в первых ' + (last + 1) + ' из ' + q.length +
    ' записей очереди; ждём скана ' + (first || 'любой записи (все отсканированы)');
})()
