(async function () {
  // Шаг 9: на заново открытой сетке скрыть все карточки разом — сетка не пустеет,
  // приходит следующая страница, ни одной скрытой в DOM, фокус на карточке сетки.
  Lampa.Activity.backward();
  for (var i = 0; i < 40 && Lampa.Activity.active().component !== 'main'; i++) await HC.sleep(250);
  var grid = await HC.openGrid();
  var page = grid.object.page;
  HC.check(page < grid.total_pages, 'у категории одна страница — догружать нечего');
  var all = HC.cards(grid);
  all.forEach(function (it) { HC.plugin().applyVerdict(grid, it, true); });
  for (var j = 0; j < 25; j++) {
    await HC.sleep(200);
    if (grid.object.page > page && all.every(function (it) { return !it.render(true).isConnected; })) break;
  }
  HC.check(grid.object.page > page, 'следующая страница не пришла: страница ' + grid.object.page);
  var left = all.filter(function (it) { return it.render(true).isConnected; });
  HC.check(!left.length, 'в DOM остались скрытые карточки: ' + left.length);
  HC.check(grid.items.length > 0, 'сетка пуста');
  var f = HC.focused();
  HC.check(HC.cards(grid).some(function (it) { return it.render(true) === f; }), 'фокус не на карточке сетки: ' + (f && f.className));
  return 'ok: скрыто ' + all.length + ', страница ' + page + ' → ' + grid.object.page + ', карточек ' + grid.items.length;
})()
