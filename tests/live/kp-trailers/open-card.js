(async function () {
  // Шаг 1: KP-карточка с imdb_id («1+1», tt1675434, наблюдение 2 design.md) показывает «Трейлеры».
  // Activity.push страницу не перезагружает: ролик «Зверя» из open-card-no-imdb.js сбрасывается,
  // и playing.js проверяет только, что играет.
  window.__kpRuTrailer = null;
  await openCard('KP_535341');
  return 'ok: «Трейлеры» есть, контроллер ' + Lampa.Controller.enabled().name;
})()
