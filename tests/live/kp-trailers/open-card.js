(async function () {
  // Шаг 1: KP-карточка с imdb_id («1+1», tt1675434, наблюдение 2 design.md) показывает «Трейлеры».
  await openCard('KP_535341');
  return 'ok: «Трейлеры» есть, контроллер ' + Lampa.Controller.enabled().name;
})()
