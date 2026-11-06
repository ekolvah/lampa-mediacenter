(async function () {
  // Шаг 2, после настоящих нажатий пульта: фокус на карточке того же ряда.
  var line = window.__hc_row;
  var f = HC.focused();
  HC.check(line && f && line.render(true).contains(f), 'после DPAD фокус ушёл из ряда');
  HC.check(HC.cards(line).some(function (it) { return it.render(true) === f; }), 'фокус не на карточке ряда: ' + (f && f.className));
  return 'ok: ' + f.className;
})()
