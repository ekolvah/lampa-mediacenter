(async function () {
  // Шаги 1 и 6: очередь плагина сама применила вердикты из кэша — у владельцев на
  // экране (ряды Главной или сетка) нет ни одной карточки с miss: true, хотя бы у
  // одной miss: false, серых (запасной путь) нет. На сетке ждём, пока вердикт есть
  // у каждой карточки: её страницы на холодном кэше проверяются при открытии.
  var p = HC.plugin();
  var grid = HC.grid();
  var cache;
  for (var i = 0; i < 60; i++) {
    cache = Lampa.Storage.get('torrent_filter_badge_cache', {});
    if (!grid || HC.cards(grid).every(function (it) { return cache[p.verdictKey(it.data)]; })) break;
    await HC.sleep(250);
  }
  var hit = 0;
  HC.owners().forEach(function (owner) {
    HC.cards(owner).forEach(function (it) {
      var v = cache[p.verdictKey(it.data)];
      HC.check(!grid || v, 'в сетке у карточки нет вердикта (очередь не дошла): ' + (it.data.title || it.data.name));
      HC.check(!(v && v.miss), 'в «' + HC.title(owner) + '» осталась карточка без раздач: ' + (it.data.title || it.data.name));
      if (v && v.miss === false) hit++;
    });
  });
  HC.check(hit > 0, 'ни у одной карточки нет вердикта miss: false — кэш холодный или фильтр пуст');
  HC.check(!document.querySelector('.card--quality-miss'), 'есть серые карточки: плагин ушёл в запасной путь (console.warn)');
  return 'ok: ' + hit + ' карточек с раздачами';
})()
