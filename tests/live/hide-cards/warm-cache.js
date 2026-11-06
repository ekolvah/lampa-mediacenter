(async function () {
  // Шаг 1: очередь плагина сама применила вердикты из кэша — в рядах нет ни одной
  // карточки с miss: true, хотя бы у одной miss: false, серых (запасной путь) нет.
  var p = HC.plugin();
  var cache = Lampa.Storage.get('torrent_filter_badge_cache', {});
  var hit = 0;
  HC.rows().forEach(function (line) {
    HC.cards(line).forEach(function (it) {
      var v = cache[p.verdictKey(it.data)];
      HC.check(!(v && v.miss), 'в ряду «' + line.data.title + '» осталась карточка без раздач: ' + (it.data.title || it.data.name));
      if (v && v.miss === false) hit++;
    });
  });
  HC.check(hit > 0, 'ни у одной карточки нет вердикта miss: false — кэш холодный или фильтр пуст');
  HC.check(!document.querySelector('.card--quality-miss'), 'есть серые карточки: плагин ушёл в запасной путь (console.warn)');
  return 'ok: ' + hit + ' карточек с раздачами';
})()
