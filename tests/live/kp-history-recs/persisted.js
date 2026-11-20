(async function () {
  // Шаг 3 (после рестарта): отсканированный на шаге 2 KP-тайтл сохранён на диске с отметкой
  // скана. Потерянную запись проход плагина вставил бы заново, но без scan.
  var exp = await kpExpected();
  var disk = JSON.parse(localStorage.getItem('recomends_scan') || '[]');
  var missing = exp.keys.filter(function (k) { return !queued(disk, k); });
  Live.check(!missing.length, 'после рестарта нет в recomends_scan: ' + missing.join(', '));
  if (SCANNED !== '-') {
    var entry = queued(disk, SCANNED);
    Live.check(entry.scan, 'после рестарта у ' + SCANNED + ' нет отметки скана: запись потерялась');
  }
  return 'ok: ' + exp.keys.length + ' KP-тайтлов в очереди после рестарта, ' + SCANNED + ' отсканирован';
})()
