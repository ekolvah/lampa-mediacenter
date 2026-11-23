// Помощники шагов tmdb-access; tests/live/lib.sh (step) подклеивает файл к каждому шагу.

// Дождаться ядра Lampa: шаг может начаться сразу после рестарта.
async function waitLampa() {
  Live.check(await Live.waitFor(function () {
    return window.Lampa && Lampa.TMDB && Lampa.Api;
  }, 10000), 'Lampa не загрузилась за 10 с');
}

// Вызов API движка в стиле (ok, err) не дольше 10 с; what — имя вызова для сообщений.
function call(what, run) {
  return Promise.race([
    new Promise(function (ok, fail) {
      run(ok, function () { fail(new Error(what + ' вернул ошибку')); });
    }),
    Live.sleep(10000).then(function () { throw new Error(what + ' не ответил за 10 с'); })
  ]);
}
