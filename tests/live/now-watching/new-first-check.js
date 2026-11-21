(async function () {
  // Новые карточки первыми (spec now-watching-new-releases): ID — карточка, забытая шагом
  // new-first. OPENED false — «Новая карточка первой»: она первая в ряду фильмов, затем её карточка
  // открывается тем же KP.full, что зовёт ядро. OPENED true — «Открытая карточка»: она уже не первая,
  // в памяти не новая.
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
  Lampa.Api.sources.KP.full({ card: row.data.results[0] }, function () {}, function () {});
  entry = Lampa.Storage.get(SEEN_KEY, '{}')[URLS[0]][ID];
  Live.check(entry.f === 0, 'после открытия ' + ID + ' в памяти новая: f ' + entry.f);
  return 'ok: ' + ID + ' первая, карточка открыта';
})()
