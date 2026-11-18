// Помощники шагов kp-trailers; tests/live/lib.sh (step) подклеивает файл к каждому шагу.

// Параметры KP-карточки — для KP.full и для Activity карточки.
function kpCard(id) {
  return { id: id, method: 'movie', card: { id: id, source: 'KP' }, source: 'KP' };
}

// Ответ KP.full карточки (с видео и реакциями от plugins/kp-reactions-fix.js).
function kpFull(id) {
  return new Promise(function (ok, fail) {
    Lampa.Api.sources.KP.full(kpCard(id), ok, function () {
      fail(new Error('KP.full ' + id + ' вернул ошибку'));
    });
  });
}

// Ответ сервиса трейлеров на тот же запрос, что делает плагин; season — номер сезона или null.
function askService(movie, season) {
  var date = (movie.type === 'tv' ? movie.first_air_date : movie.release_date) || '';
  var url = 'http://127.0.0.1:9118/trailer?title=' + encodeURIComponent(movie.title)
    + '&original_title=' + encodeURIComponent(movie.original_title)
    + '&year=' + date.slice(0, 4) + (season ? '&season=' + season : '');
  return new Promise(function (ok, fail) {
    var request = new Lampa.Reguest();
    request.timeout(10000);
    request.silent(url, ok, function (xhr) {
      fail(new Error('сервис трейлеров: HTTP ' + xhr.status + ' ' + xhr.statusText + ' ' + url));
    });
  });
}

// Открыть KP-карточку, дождаться в ней кнопки «Трейлеры» и фокуса пульта на «Торренты».
// «Торренты» — первая кнопка строки (plugins/kp-reactions-fix.js, spec card-buttons): нет фокуса
// на ней — движок сменил .view--torrent или кнопок плагина нет.
// Сбрасывает ролик сервиса прошлой карточки (Activity.push страницу не перезагружает): шаг,
// которому нужен window.__kpRuTrailer, задаёт его после openCard.
// Открытую карточку запоминает в window.__kpCard (её сверяет torrents-open.js).
async function openCard(id) {
  window.__kpRuTrailer = null;
  window.__kpCard = id;
  Lampa.Activity.push(Object.assign({ url: '', component: 'full' }, kpCard(id)));
  var opened = await Live.waitFor(function () { return Lampa.Activity.active().component === 'full'; }, 10000);
  Live.check(opened, 'карточка не открылась: ' + Lampa.Activity.active().component);
  var shown = await Live.waitFor(function () { return document.querySelector('.view--trailer'); }, 20000);
  Live.check(shown, 'в KP-карточке ' + id + ' нет кнопки «Трейлеры» (.view--trailer)');
  // В full-start-new «Трейлеры» живут в скрытом контейнере и открываются меню «Смотреть»; ui.py в
  // kp-trailers.sh считает нажатия от первой кнопки, поэтому важен фокус, а не видимость кнопки.
  var torrent = await Live.waitFor(function () { return document.querySelector('.full-start__button.button--kp-torrent.focus'); }, 5000);
  Live.check(torrent, 'фокус не на «Торренты»: ' + ((document.querySelector('.focus') || {}).className));
}
