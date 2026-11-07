(async function () {
  // Шаг 9: на заново открытой сетке скрыть все карточки разом — сетка не пустеет,
  // приходит следующая страница, ни одной скрытой в DOM, фокус на карточке сетки.
  Lampa.Activity.backward();
  await HC.activeIs('main');
  var grid = await HC.openGrid();
  var page = grid.object.page;
  HC.check(page < grid.total_pages, 'у категории одна страница — догружать нечего');
  var all = HC.cards(grid);
  all.forEach(function (it) { HC.plugin().applyVerdict(grid, it, true); });
  await HC.until(function () {
    return grid.object.page > page && all.every(function (it) { return !it.render(true).isConnected; });
  }, 25, 200);
  HC.check(grid.object.page > page, 'следующая страница не пришла: страница ' + grid.object.page);
  var left = all.filter(function (it) { return it.render(true).isConnected; });
  HC.check(!left.length, 'в DOM остались скрытые карточки: ' + left.length);
  HC.check(grid.items.length > 0, 'сетка пуста');
  var f = HC.focused();
  HC.check(HC.cards(grid).some(function (it) { return it.render(true) === f; }), 'фокус не на карточке сетки: ' + (f && f.className));
  return 'ok: скрыто ' + all.length + ', страница ' + page + ' → ' + grid.object.page + ', карточек ' + grid.items.length;
})()
