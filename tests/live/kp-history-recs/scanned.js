(async function () {
  // Шаг 2: на тике ядра отсканирован первый неотсканированный KP-тайтл; в списке нет KP-истории.
  var first = window.__recsFirst;
  var done = await Live.waitFor(function () {
    return first ? queued(scanQueue(), first).scan : window.__recsTicks > 0;
  }, 15000);
  if (!done) return 'wait: тика ядра ещё не было, записей очереди ' + window.__recsTicks;

  var rewrote = window.__recsWarns.filter(function (w) { return w.indexOf('core rewrote recomends_scan') !== -1; });
  Live.check(!rewrote.length, 'ядро подменило очередь: ' + rewrote.join('; '));
  var watched = kpKeys();
  var shown = Lampa.Storage.get('recomends_list', '[]').filter(function (e) {
    return watched.indexOf(recKey(e.id, isTv(e))) !== -1;
  });
  Live.check(!shown.length, 'в recomends_list тайтлы KP-истории: ' + shown.map(function (e) { return e.title || e.name; }).join(', '));
  return 'ok: scanned ' + (first || '-') + ', записей очереди ядром ' + window.__recsTicks;
})()
