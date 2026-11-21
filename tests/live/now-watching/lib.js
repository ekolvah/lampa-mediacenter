// Помощники шагов now-watching; tests/live/lib.sh (step) подклеивает файл к каждому шагу.

// Штатные ряды Главной KP по url коллекции, как NOW_WATCHING в plugins/kp-reactions-fix.js.
var URLS = ['api/v2.2/films/collections?type=TOP_POPULAR_MOVIES', 'api/v2.2/films/collections?type=POPULAR_SERIES'];
var SEEN_KEY = 'kp_now_watching_seen';

function lines() {
  var a = Lampa.Activity.active();
  return a.component === 'main' && a.activity.component && a.activity.component.items || [];
}

// Ряд Главной по url коллекции, как его ищет плагин, а не по заголовку.
function rowOf(url) {
  return lines().filter(function (l) { return l.data.url === url; })[0];
}

// Ждёт Главную KP (опрос раз в 250 мс, до 20 с). Возвращает момент сборки от старта страницы, мс.
async function waitHome() {
  var built = await Live.waitFor(function () { return lines().length >= 3; }, 20000);
  var builtAt = Math.round(performance.now());
  var a = Lampa.Activity.active();
  Live.check(built, 'Главная не собралась: активна ' + a.component + ', источник ' + a.source);
  Live.check(a.source === 'KP', 'источник Главной ' + a.source + ', нужен KP');
  return builtAt;
}
