(function () {
  // Трейлеры уходят в SmartTube (Android.openYoutube), а не во встроенный плеер: с IP приставки
  // YouTube требует от анонимного iframe войти (change trailers-external-player, design.md решение 2).
  var player = Lampa.Storage.field('player_launch_trailers');
  Live.check(player === 'youtube', '«Плеер для трейлеров» = ' + player + ', нужен youtube (SmartTube)');
  // Обёртка пишет отданный наружу id для playing.js и зовёт оригинал; живёт до перезагрузки страницы.
  var open = Lampa.Android.openYoutube;
  Live.check(typeof open === 'function', 'нет Lampa.Android.openYoutube');
  Lampa.Android.openYoutube = function (id) {
    window.__kpOpenedYoutube = id;
    return open.apply(this, arguments);
  };
  return 'ok: плеер трейлеров youtube, openYoutube под наблюдением';
})()
