// Общие помощники JS-шагов живых проверок; tests/live/lib.sh (step) склеивает этот
// файл с lib.js сценария и шагом.
var Live = {
  sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },
  check: function (ok, msg) { if (!ok) throw new Error(msg); },
  // Опрашивать fn каждые 250 мс до ms; истина — дождались.
  waitFor: async function (fn, ms) {
    var end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) return true;
      await Live.sleep(250);
    }
    return !!fn();
  }
};

// Штатные ряды Главной KP по url коллекции, как NOW_WATCHING в plugins/kp-reactions-fix.js.
var URLS = ['api/v2.2/films/collections?type=TOP_POPULAR_MOVIES', 'api/v2.2/films/collections?type=POPULAR_SERIES'];

// Ряды активной Главной (компонент main), пусто — Главная не активна.
function lines() {
  var a = Lampa.Activity.active();
  return a.component === 'main' && a.activity.component && a.activity.component.items || [];
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
