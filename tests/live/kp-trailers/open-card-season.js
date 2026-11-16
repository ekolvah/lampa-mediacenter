(async function () {
  // KP-сериал «Джентльмены» (KP 1435343): последний вышедший сезон — 2-й, в TMDB есть русский
  // трейлер 1-го. Первым в «Трейлерах» стоит ролик 2-го сезона: от сервиса, а если сервис не дал —
  // Trailer 2-го сезона из TMDB (change series-last-season-trailer).
  var ID = 'KP_1435343';
  var full = await kpFull(ID);
  Live.check(full.movie.type === 'tv', ID + ' не сериал: type ' + full.movie.type);
  var videos = (full.videos && full.videos.results) || [];
  Live.check(videos.length, 'нет видео для ' + ID);

  var pick = await askService(full.movie, 2);
  var first = videos[0];
  if (pick.video_id) {
    Live.check(first.key === pick.video_id, 'первым не ролик сервиса ' + pick.video_id + ': ' + first.key + ' «' + first.name + '»');
  } else {
    Live.check(first.type === 'Trailer', 'сервис не дал ролик (' + pick.reason + '), первым не трейлер: ' + first.type + ' «' + first.name + '»');
  }
  // Ловит и смену текста замены сезона в trailer-search: ролик 1-го сезона прошёл бы как найденный.
  Live.check(/2\s*сезон|сезон\s*2|season\s*2/i.test(first.name || ''), 'первым не ролик 2-го сезона: «' + first.name + '»');
  await openCard(ID);
  // Для playing.js: кнопкой «Трейлер» наружу отдаётся этот ролик.
  window.__kpRuTrailer = first;
  return 'ok: ' + ID + ', первым ' + first.key + ' «' + first.name + '»' + (pick.video_id ? '' : ' (TMDB; сервис: ' + pick.reason + ')');
})()
