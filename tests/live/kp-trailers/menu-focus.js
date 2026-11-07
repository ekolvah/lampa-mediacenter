(function () {
  // Шаг 2: в меню «Смотреть» фокус пульта на «Трейлеры» — порядок пунктов задают плагины.
  var item = document.querySelector('.selectbox-item.focus');
  Live.check(item, 'в меню нет пункта под фокусом, контроллер ' + Lampa.Controller.enabled().name);
  var text = item.textContent.trim();
  Live.check(text === 'Трейлеры', 'под фокусом «' + text + '», а не «Трейлеры»');
  return 'ok: фокус на «Трейлеры»';
})()
