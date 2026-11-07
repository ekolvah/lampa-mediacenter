(async function () {
  // Шаг 10: полная сетка Избранного (favorite) — плагин к ней не подключается.
  Lampa.Activity.push({ url: '', title: Lampa.Lang.translate('title_book'), component: 'favorite', type: 'book', page: 1 });
  for (var i = 0; i < 40 && Lampa.Activity.active().component !== 'favorite'; i++) await HC.sleep(250);
  var a = Lampa.Activity.active();
  HC.check(a.component === 'favorite', 'Избранное (favorite) не открылось, активна ' + a.component);
  HC.check(a.activity.component.torrent_badge_kind === undefined, 'плагин подключился к сетке Избранного');
  Lampa.Activity.backward();
  return 'ok: у favorite нет torrent_badge_kind';
})()
