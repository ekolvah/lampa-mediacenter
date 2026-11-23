(async function () {
  // Спек tmdb-access, «Без DMCA-блокировки клиента». Фикстура: «Слово пацана. Кровь на асфальте»
  // (tv/234763) из DMCA-списка CUB (#106).
  var ID = 234763, METHOD = 'tv', NAME = 'Слово пацана';
  await waitLampa();
  Live.check(Lampa.Utils && Lampa.Utils.protocol, 'нет Lampa.Utils.protocol');
  Live.check(Lampa.Manifest && Lampa.Manifest.cub_domain, 'нет Lampa.Manifest.cub_domain');
  // Фикстура ещё в списке: иначе шаг прошёл бы и без плагина.
  var url = Lampa.Utils.protocol() + 'tmdb.' + Lampa.Manifest.cub_domain + '/blocked';
  var blocked = await call(url, function (ok, err) {
    var request = new Lampa.Reguest();
    request.timeout(10000);
    request.silent(url, ok, err);
  });
  Live.check(Array.isArray(blocked), url + ': не массив, ' + JSON.stringify(blocked).slice(0, 200));
  Live.check(blocked.some(function (e) { return e.id == ID && e.cat === METHOD; }),
    'фикстура устарела: ' + METHOD + '/' + ID + ' нет в ' + url);
  // Плагин мог ещё не стартовать сразу после рестарта.
  Live.check(await Live.waitFor(function () {
    return window.lampa_settings && window.lampa_settings.dcma === false;
  }, 10000), 'lampa_settings.dcma не false за 10 с: ' + JSON.stringify((window.lampa_settings || {}).dcma).slice(0, 200));
  // Сценарий «Тайтл из DMCA-списка открывается карточками tmdb и cub».
  var names = [];
  for (var source of ['tmdb', 'cub']) {
    var what = source + '.full ' + METHOD + '/' + ID;
    var card = await call(what, function (ok, err) {
      Lampa.Api.sources[source].full({ method: METHOD, id: ID }, ok, err);
    });
    var name = card && card.movie && (card.movie.name || card.movie.title);
    Live.check(name && name.indexOf(NAME) === 0, what + ': карточка ' + JSON.stringify(name));
    names.push(source + ' -> ' + name);
  }
  return 'ok: ' + blocked.length + ' в /blocked, ' + names.join(', ');
})()
