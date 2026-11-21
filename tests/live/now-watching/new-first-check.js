(async function () {
  // Новые карточки первыми (spec now-watching-new-releases): ID — карточка, забытая шагом
  // new-first. OPENED false — «Новая карточка первой»: она первая в ряду фильмов; затем, как только
  // в памяти появился её TMDB-тайтл t, открывается карточка этого тайтла тем же tmdb.full, что зовёт
  // ядро для истории и «Рекомендуем посмотреть» («Открыта карточка TMDB»). OPENED true — она уже не
  // первая, в памяти не новая.
  await waitHome();
  var row = rowOf(URLS[0]);
  Live.check(row, 'нет ряда фильмов');
  var ids = row.data.results.map(function (c) { return c.id; });
  var at = ids.indexOf(ID);
  Live.check(at !== -1, ID + ' нет в ряду фильмов');
  var entry = (Lampa.Storage.get(SEEN_KEY, '{}')[URLS[0]] || {})[ID];
  Live.check(entry, ID + ' нет в памяти ряда фильмов');

  if (OPENED) {
    Live.check(at > 0, 'открытая ' + ID + ' всё ещё первая в ряду');
    Live.check(entry.f === 0, 'открытая ' + ID + ' в памяти новая: f ' + entry.f);
    return 'ok: открытая ' + ID + ' на месте ' + at;
  }

  Live.check(at === 0, ID + ' не первая в ряду, а на месте ' + at);
  Live.check(entry.f > 0, ID + ' в памяти не новая');
  var titled = await Live.waitFor(function () {
    entry = Lampa.Storage.get(SEEN_KEY, '{}')[URLS[0]][ID];
    return entry && entry.t;
  }, 15000);
  Live.check(titled, 'у ' + ID + ' (' + row.data.results[0].title + ') нет TMDB-тайтла t за 15 с');
  var title = entry.t.split('/');
  Lampa.Api.sources.tmdb.full({ method: title[0], id: +title[1] }, function () {}, function () {});
  entry = Lampa.Storage.get(SEEN_KEY, '{}')[URLS[0]][ID];
  Live.check(entry.f === 0, 'после открытия tmdb ' + entry.t + ' ' + ID + ' в памяти новая: f ' + entry.f);
  return 'ok: ' + ID + ' первая, карточка tmdb ' + entry.t + ' открыта';
})()
