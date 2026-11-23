// Помощники шагов now-watching; tests/live/lib.sh (step) подклеивает файл к каждому шагу.

// Штатные ряды Главной KP по url коллекции, как NOW_WATCHING в plugins/kp-reactions-fix.js.
var URLS = ['api/v2.2/films/collections?type=TOP_POPULAR_MOVIES', 'api/v2.2/films/collections?type=POPULAR_SERIES'];
var SEEN_KEY = 'kp_now_watching_seen';

// Ряд Главной по url коллекции, как его ищет плагин, а не по заголовку.
function rowOf(url) {
  return lines().filter(function (l) { return l.data.url === url; })[0];
}
