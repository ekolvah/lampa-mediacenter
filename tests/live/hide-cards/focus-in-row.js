(async function () {
  // Шаги 2 и 7, после настоящих нажатий пульта: фокус на карточке того же владельца.
  var owner = window.__hc_row;
  var f = HC.focused();
  HC.check(owner && f && owner.render(true).contains(f), 'после DPAD фокус ушёл из «' + (owner ? HC.title(owner) : '?') + '»');
  HC.check(HC.cards(owner).some(function (it) { return it.render(true) === f; }), 'фокус не на карточке: ' + (f && f.className));
  return 'ok: ' + f.className;
})()
