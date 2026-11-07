(async function () {
  // Шаг 5, до открытия: слушатель событий ряда, затем Избранное.
  window.__hc_bookmark_events = [];
  window.__hc_listener = function (e) { window.__hc_bookmark_events.push(e.type); };
  Lampa.Listener.follow('line', window.__hc_listener);
  Lampa.Activity.push({ url: '', title: Lampa.Lang.translate('title_book'), component: 'bookmarks', page: 1 });
  await HC.sleep(4000);
  HC.check(Lampa.Activity.active().component === 'bookmarks', 'Избранное не открылось');
  return 'ok: ' + document.querySelectorAll('.card').length + ' карточек';
})()
