(async function () {
  // Шаг 1: KP-карточка с imdb_id («1+1», tt1675434, наблюдение 2 design.md) показывает «Трейлеры».
  var ID = 'KP_535341';
  Lampa.Activity.push({ url: '', component: 'full', id: ID, method: 'movie', card: { id: ID, source: 'KP' }, source: 'KP' });
  var shown = await Live.waitFor(function () { return document.querySelector('.view--trailer'); }, 20000);
  Live.check(Lampa.Activity.active().component === 'full', 'карточка не открылась: ' + Lampa.Activity.active().component);
  Live.check(shown, 'в KP-карточке ' + ID + ' нет кнопки «Трейлеры» (.view--trailer)');
  // В full-start-new «Трейлеры» живут в скрытом контейнере и открываются меню «Смотреть»
  // (ui.py в kp-trailers.sh начинает с него), поэтому важен фокус, а не видимость кнопки.
  var play = await Live.waitFor(function () { return document.querySelector('.full-start__button.button--play.focus'); }, 5000);
  Live.check(play, 'фокус не на «Смотреть»: ' + ((document.querySelector('.focus') || {}).className));
  return 'ok: «Трейлеры» есть, контроллер ' + Lampa.Controller.enabled().name;
})()
