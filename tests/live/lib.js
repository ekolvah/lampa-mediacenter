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
