(function () {
  // Кнопка «Трейлер» (plugins/kp-reactions-fix.js) под фокусом пульта в строке кнопок карточки:
  // DPAD_RIGHT со «Смотреть» переводит фокус на неё.
  var button = document.querySelector('.full-start__button.focus');
  Live.check(button, 'в строке кнопок нет кнопки под фокусом, контроллер ' + Lampa.Controller.enabled().name);
  var text = button.textContent.trim();
  Live.check(text === 'Трейлер', 'под фокусом «' + text + '», а не «Трейлер»');
  return 'ok: фокус на «Трейлер»';
})()
