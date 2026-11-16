(function () {
  // В открытом списке «Трейлеры» под фокусом пульта — ролик сервиса из open-card-no-imdb.js:
  // DPAD_CENTER играет именно его, а не любой трейлер (playing.js проверяет только, что играет).
  var want = window.__kpRuTrailer && window.__kpRuTrailer.name;
  Live.check(want, 'нет имени ролика сервиса: сначала шаг open-card-no-imdb');
  var item = document.querySelector('.selectbox-item.focus');
  Live.check(item, 'в списке трейлеров нет пункта под фокусом, контроллер ' + Lampa.Controller.enabled().name);
  var title = item.querySelector('.selectbox-item__title');
  var text = (title || item).textContent.trim();
  Live.check(text === want, 'под фокусом «' + text + '», а не ролик сервиса «' + want + '»');
  return 'ok: под фокусом ролик сервиса';
})()
