(async function () {
  // Шаг 4: скрыть оставшиеся — заголовок на месте, в ряду только «Ещё», фокус на ней.
  var line = HC.owned();
  var guard = 10;
  while (HC.cards(line).length && guard--) {
    await HC.hide(line, HC.focusedCard(line));
  }
  HC.check(line.render(true).isConnected, 'ряд «' + line.data.title + '» пропал с экрана');
  HC.check(line.render(true).querySelector('.items-line__title'), 'у ряда нет заголовка');
  HC.check(line.items.length === 1 && line.items[0] === line.more, 'в ряду не только «Ещё»: ' + line.items.length);
  var f = HC.focused();
  HC.check(f && f === line.more.render(true), 'фокус не на «Ещё»: ' + (f ? f.className : 'нигде') +
    '; last=' + (line.last && line.last.className) + '; ctrl=' + Lampa.Controller.enabled().name);
  return 'ok: «' + line.data.title + '» только Ещё, фокус на ней';
})()
