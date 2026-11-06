(async function () {
  // Шаг 3: скрывать по одной (под фокусом), пока в результатах не останется 3:
  // ряд добирает каскадом, в конце — 3 карточки подряд и «Ещё».
  var line = HC.owned();
  var guard = 40;
  while (line.data.results.length > 3 && guard--) {
    await HC.hide(line, HC.focusedCard(line));
  }
  var cards = HC.cards(line);
  HC.check(cards.length === 3, '«' + line.data.title + '»: карточек ' + cards.length + ' вместо 3');
  cards.forEach(function (it, i) { HC.check(it.data === line.data.results[i], 'карточки не по порядку результатов'); });
  HC.check(line.more && line.items[line.items.length - 1] === line.more, 'в конце ряда нет «Ещё»');
  return 'ok: «' + line.data.title + '» 3 карточки + Ещё';
})()
