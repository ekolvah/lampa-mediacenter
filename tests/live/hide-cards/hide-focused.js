(async function () {
  // Шаг 2: скрыть карточку под фокусом — карточек в ряду столько же (добор),
  // фокус на соседней карточке этого ряда.
  var line = HC.owned();
  var before = HC.cards(line).length;
  var item = HC.cards(line).find(function (it) { return it.render(true) === line.last; }) || HC.cards(line)[0];
  HC.check(line.data.results.length > before, 'в ряду «' + line.data.title + '» нет запаса результатов для добора');
  await HC.hide(line, item);
  HC.check(HC.cards(line).length === before, 'карточек было ' + before + ', стало ' + HC.cards(line).length);
  HC.check(line.items.indexOf(item) < 0 && !item.render(true).isConnected, 'скрытая карточка осталась в ряду');
  var f = HC.focused();
  HC.check(f && line.render(true).contains(f), 'фокус не в ряду «' + line.data.title + '»');
  window.__hc_row = line;
  return 'ok: ' + before + ' карточек, фокус на ' + f.className;
})()
