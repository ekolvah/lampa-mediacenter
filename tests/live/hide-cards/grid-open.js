(async function () {
  // Шаг 6: «Ещё» ряда Главной открывает сетку category_full, плагин к ней подключился.
  var grid = await HC.openGrid();
  HC.check(grid.torrent_badge_kind, 'у сетки нет torrent_badge_kind: плагин не подключился к category_full');
  return 'ok: ' + grid.items.length + ' карточек, страница ' + grid.object.page + '/' + grid.total_pages;
})()
