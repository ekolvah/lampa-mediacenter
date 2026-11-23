// Помощники шагов now-watching; tests/live/lib.sh (step) подклеивает файл к каждому шагу.

var SEEN_KEY = 'kp_now_watching_seen';

// Ряд Главной по url коллекции, как его ищет плагин, а не по заголовку.
function rowOf(url) {
  return lines().filter(function (l) { return l.data.url === url; })[0];
}
