(async function () {
  // Шаг 1: KP-карточка с imdb_id («1+1», tt1675434, наблюдение 2 design.md) показывает «Трейлеры».
  await openCard('KP_535341');
  // В full-start-new «Трейлеры» живут в скрытом контейнере и открываются меню «Смотреть»
  // (ui.py в kp-trailers.sh начинает с него), поэтому важен фокус, а не видимость кнопки.
  var play = await Live.waitFor(function () { return document.querySelector('.full-start__button.button--play.focus'); }, 5000);
  Live.check(play, 'фокус не на «Смотреть»: ' + ((document.querySelector('.focus') || {}).className));
  return 'ok: «Трейлеры» есть, контроллер ' + Lampa.Controller.enabled().name;
})()
