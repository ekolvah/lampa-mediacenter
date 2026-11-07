(async function () {
  // Шаг 8: скрывать последние карточки сетки, пока видимая часть не станет неполной
  // и плагин не запросит следующую страницу; затем она приходит без нажатий пульта.
  var grid = HC.grid();
  HC.check(grid, 'сетка не открыта');
  var page = grid.object.page;
  HC.check(page < grid.total_pages, 'у категории одна страница — догружать нечего');
  for (var i = 0; i < 60 && grid.object.page === page; i++) {
    await HC.hide(grid, grid.items[grid.items.length - 1]);
  }
  HC.check(grid.object.page > page, 'скрыто ' + i + ' карточек, а следующая страница не запрошена');
  var visible = 0;
  for (var j = 0; j < 25; j++) {
    await HC.sleep(200);
    visible = HC.cards(grid).filter(function (it) {
      var r = it.render(true).getBoundingClientRect();
      return it.render(true).isConnected && r.top >= 0 && r.bottom <= window.innerHeight;
    }).length;
    if (!HC.short(grid) && visible >= 12) break;
  }
  HC.check(!HC.short(grid), 'страница ' + grid.object.page + ' пришла, а видимая часть неполна: ' + grid.items.length + ' карточек');
  HC.check(visible >= 12, 'видно ' + visible + ' карточек вместо 12');
  return 'ok: страница ' + page + ' → ' + grid.object.page + ', видно ' + visible;
})()
