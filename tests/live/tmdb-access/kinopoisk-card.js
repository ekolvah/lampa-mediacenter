(async function () {
  // Спек tmdb-access, «Без списка «Смотреть на Кинопоиске»». Фикстура: «Беспринципные» (tv/105276)
  // из списка CUB <cub_domain>/api/kinopoisk/list (#110).
  var ID = 105276, METHOD = 'tv';
  await waitLampa();
  Live.check(Lampa.Utils && Lampa.Utils.protocol, 'нет Lampa.Utils.protocol');
  Live.check(Lampa.Manifest && Lampa.Manifest.cub_domain, 'нет Lampa.Manifest.cub_domain');
  // Фикстура ещё в списке: иначе шаг прошёл бы и без плагина.
  var url = Lampa.Utils.protocol() + Lampa.Manifest.cub_domain + '/api/kinopoisk/list';
  var list = await call(url, function (ok, err) {
    var request = new Lampa.Reguest();
    request.timeout(10000);
    request.silent(url, ok, err);
  });
  Live.check(Array.isArray(list), url + ': не массив, ' + JSON.stringify(list).slice(0, 200));
  Live.check(list.some(function (e) { return e.id == ID && e.cat === METHOD; }),
    'фикстура устарела: ' + METHOD + '/' + ID + ' нет в ' + url);
  // Сценарий «Карточка из списка Кинопоиска с кнопками плагина»: кнопки плагина ставятся по событию
  // full, которого ядро для карточки из списка не шлёт.
  Lampa.Activity.push({ url: '', component: 'full', source: 'tmdb', method: METHOD, id: ID });
  Live.check(await Live.waitFor(function () {
    return Lampa.Activity.active().component === 'full';
  }, 10000), 'карточка не открылась: ' + Lampa.Activity.active().component);
  var found = await Live.waitFor(function () {
    return document.querySelector('.button--kp-torrent') && document.querySelector('.button--kp-trailer');
  }, 20000);
  Live.check(found, 'в карточке tmdb ' + METHOD + '/' + ID + ' нет кнопок плагина, .button--kinopoisk: ' +
    !!document.querySelector('.button--kinopoisk'));
  return 'ok: ' + list.length + ' в kinopoisk/list, карточка ' + METHOD + '/' + ID + ' с кнопками плагина';
})()
