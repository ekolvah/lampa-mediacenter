(async function () {
  // Шаг 5, после DPAD_RIGHT x8: ни одного create/append — плагин Избранное не видит.
  Lampa.Listener.remove('line', window.__hc_listener);
  var seen = window.__hc_bookmark_events.filter(function (t) { return t === 'create' || t === 'append'; });
  HC.check(seen.length === 0, 'Избранное шлёт события ряда (' + seen.length + ' create/append): карточки там начнут скрываться');
  Lampa.Activity.backward();
  return 'ok: событий create/append нет';
})()
