// Помощники шагов kp-trailers; tests/live/lib.sh (step) подклеивает файл к каждому шагу.

// Открыть KP-карточку и дождаться в ней кнопки «Трейлеры».
async function openCard(id) {
  Lampa.Activity.push({ url: '', component: 'full', id: id, method: 'movie', card: { id: id, source: 'KP' }, source: 'KP' });
  var opened = await Live.waitFor(function () { return Lampa.Activity.active().component === 'full'; }, 10000);
  Live.check(opened, 'карточка не открылась: ' + Lampa.Activity.active().component);
  var shown = await Live.waitFor(function () { return document.querySelector('.view--trailer'); }, 20000);
  Live.check(shown, 'в KP-карточке ' + id + ' нет кнопки «Трейлеры» (.view--trailer)');
}
