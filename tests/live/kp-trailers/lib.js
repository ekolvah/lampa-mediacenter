// Помощники шагов kp-trailers; tests/live/lib.sh (step) подклеивает файл к каждому шагу.

// Параметры KP-карточки — для KP.full и для Activity карточки.
function kpCard(id) {
  return { id: id, method: 'movie', card: { id: id, source: 'KP' }, source: 'KP' };
}

// Открыть KP-карточку, дождаться в ней кнопки «Трейлеры» и фокуса пульта на «Смотреть».
// Сбрасывает ролик сервиса прошлой карточки (Activity.push страницу не перезагружает): шаг,
// которому нужен window.__kpRuTrailer, задаёт его после openCard.
async function openCard(id) {
  window.__kpRuTrailer = null;
  Lampa.Activity.push(Object.assign({ url: '', component: 'full' }, kpCard(id)));
  var opened = await Live.waitFor(function () { return Lampa.Activity.active().component === 'full'; }, 10000);
  Live.check(opened, 'карточка не открылась: ' + Lampa.Activity.active().component);
  var shown = await Live.waitFor(function () { return document.querySelector('.view--trailer'); }, 20000);
  Live.check(shown, 'в KP-карточке ' + id + ' нет кнопки «Трейлеры» (.view--trailer)');
  // В full-start-new «Трейлеры» живут в скрытом контейнере и открываются меню «Смотреть»
  // (ui.py в kp-trailers.sh начинает с него), поэтому важен фокус, а не видимость кнопки.
  var play = await Live.waitFor(function () { return document.querySelector('.full-start__button.button--play.focus'); }, 5000);
  Live.check(play, 'фокус не на «Смотреть»: ' + ((document.querySelector('.focus') || {}).className));
}
