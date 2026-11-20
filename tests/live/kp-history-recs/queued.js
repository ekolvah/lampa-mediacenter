(async function () {
  // Шаг 1: проход плагина закончен, найденные им тайтлы KP-истории — в начале recomends_scan.
  var keys;
  if (!await Live.waitFor(function () { return (keys = kpKeys()); }, 15000)) return 'wait: проход плагина по KP-истории ещё идёт';
  var q = scanQueue();
  var missing = keys.filter(function (k) { return !queued(q, k); });
  Live.check(!missing.length, 'нет в recomends_scan: ' + missing.join(', '));
  // Недостающие плагин ставит в начало; бывшие в очереди ядра остаются на своих местах.
  var lead = 0;
  while (lead < q.length && keys.indexOf(recKey(q[lead].id, q[lead].tv)) !== -1) lead++;
  var allScanned = keys.every(function (k) { return queued(q, k).scan; });
  Live.check(lead || allScanned, 'в начале recomends_scan нет KP-тайтлов, первая запись ' + JSON.stringify(q[0]));
  var first = keys.filter(function (k) { return !queued(q, k).scan; })[0];
  window.__recsFirst = first || null;
  return 'ok: ' + keys.length + ' KP-тайтлов в очереди из ' + q.length + ', первые ' + lead +
    ' записей — KP-тайтлы; ждём скана ' + (first || 'любой записи (все отсканированы)');
})()
