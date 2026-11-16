(function () {
  // После trailer_plays (kp-trailers.sh: SmartTube играл, BACK вернул Lampa): какой id Lampa отдала
  // в Android.openYoutube (обёртка preflight.js). Обнуляем, чтобы следующий запуск не прошёл на этом.
  var id = window.__kpOpenedYoutube;
  window.__kpOpenedYoutube = null;
  Live.check(id, 'Lampa не вызвала Android.openYoutube: трейлер ушёл не в SmartTube');
  // Ролик сервиса из open-card-no-imdb.js, если шаг его задал: наружу отдан именно он.
  var want = window.__kpRuTrailer;
  if (want) Live.check(id === want.key, 'отдан ' + id + ', а не ролик сервиса ' + want.key);
  return 'ok: отдан ' + id + (want ? ' (ролик сервиса)' : '');
})()
