// Помощники шагов kp-trailers; tests/live/lib.sh (step) подклеивает файл к каждому шагу.

// Параметры KP-карточки — для Lampa.Api.full и для Activity карточки.
function kpCard(id) {
  return sourceCard('KP', 'movie', id);
}

// Параметры карточки источника ядра (tmdb, cub): id — TMDB id, method — movie или tv.
function sourceCard(source, method, id) {
  return { id: id, method: method, card: { id: id, source: source }, source: source };
}

// Ответ full карточки через диспетчер движка (с видео от plugins/kp-reactions-fix.js).
function cardFull(params) {
  return new Promise(function (ok, fail) {
    Lampa.Api.full(params, ok, function () {
      fail(new Error('full ' + params.source + ' ' + params.id + ' вернул ошибку'));
    });
  });
}

// Ответ сервиса трейлеров на тот же запрос, что делает плагин; season — номер сезона или null.
// Сериал — по методу карточки (tmdb, cub) или типу KP-карточки; у сериала TMDB name, а не title.
function askService(params, movie, season) {
  var tv = params.method === 'tv' || movie.type === 'tv';
  var date = (tv ? movie.first_air_date : movie.release_date) || '';
  var url = 'http://127.0.0.1:9118/trailer?title=' + encodeURIComponent(movie.title || movie.name)
    + '&original_title=' + encodeURIComponent(movie.original_title || movie.original_name)
    + '&year=' + date.slice(0, 4) + (season ? '&season=' + season : '');
  return new Promise(function (ok, fail) {
    var request = new Lampa.Reguest();
    request.timeout(10000);
    request.silent(url, ok, function (xhr) {
      fail(new Error('сервис трейлеров: HTTP ' + xhr.status + ' ' + xhr.statusText + ' ' + url));
    });
  });
}

// Первым в «Трейлерах» карточки стоит русский ролик сервиса; возвращает этот ролик.
async function serviceFirst(params, full) {
  var name = params.source + ' ' + params.id;
  var videos = (full.videos && full.videos.results) || [];
  Live.check(videos.length, 'нет видео для ' + name);
  var pick = await askService(params, full.movie, null);
  Live.check(pick.video_id, 'сервис трейлеров не дал ролик для ' + name + ': ' + pick.reason);
  var first = videos[0];
  Live.check(first.iso_639_1 === 'ru' && first.key === pick.video_id,
    'первым не ролик сервиса ' + pick.video_id + ': ' + first.key + ' (' + first.iso_639_1 + ')');
  return first;
}

// Открыть карточку (params — kpCard или sourceCard), дождаться в ней кнопки «Трейлеры» и фокуса пульта на «Торренты».
// «Торренты» — первая кнопка строки (plugins/kp-reactions-fix.js, spec card-buttons): нет фокуса
// на ней — движок сменил .view--torrent или кнопок плагина нет.
// Сбрасывает ролик сервиса прошлой карточки (Activity.push страницу не перезагружает): шаг,
// которому нужен window.__kpRuTrailer, задаёт его после openCard.
// Открытую карточку запоминает в window.__kpCard (её сверяет torrents-open.js).
async function openCard(params) {
  window.__kpRuTrailer = null;
  window.__kpCard = params.id;
  Lampa.Activity.push(Object.assign({ url: '', component: 'full' }, params));
  var opened = await Live.waitFor(function () { return Lampa.Activity.active().component === 'full'; }, 10000);
  Live.check(opened, 'карточка не открылась: ' + Lampa.Activity.active().component);
  var shown = await Live.waitFor(function () { return document.querySelector('.view--trailer'); }, 20000);
  Live.check(shown, 'в карточке ' + params.source + ' ' + params.id + ' нет кнопки «Трейлеры» (.view--trailer)');
  // В full-start-new «Трейлеры» живут в скрытом контейнере и открываются меню «Смотреть»; ui.py в
  // kp-trailers.sh считает нажатия от первой кнопки, поэтому важен фокус, а не видимость кнопки.
  var torrent = await Live.waitFor(function () { return document.querySelector('.full-start__button.button--kp-torrent.focus'); }, 5000);
  Live.check(torrent, 'фокус не на «Торренты»: ' + ((document.querySelector('.focus') || {}).className));
}
