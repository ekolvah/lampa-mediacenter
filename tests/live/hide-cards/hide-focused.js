(async function () {
  // Шаги 2 и 7: скрыть карточку под фокусом — фокус на соседней карточке того же
  // владельца. В ряду карточек столько же (добор из results); в сетке добор — шаг 8.
  var owner = HC.owner();
  var isGrid = owner === HC.grid();
  var before = HC.cards(owner).length;
  var item = HC.focusedCard(owner);
  HC.check(isGrid || owner.data.results.length > before, 'в ряду «' + HC.title(owner) + '» нет запаса результатов для добора');
  await HC.hide(owner, item);
  HC.check(isGrid || HC.cards(owner).length === before, 'карточек было ' + before + ', стало ' + HC.cards(owner).length);
  HC.check(owner.items.indexOf(item) < 0 && !item.render(true).isConnected, 'скрытая карточка осталась в «' + HC.title(owner) + '»');
  var f = HC.focused();
  HC.check(f && owner.render(true).contains(f), 'фокус не в «' + HC.title(owner) + '»');
  window.__hc_row = owner;
  return 'ok: ' + before + ' карточек, фокус на ' + f.className;
})()
