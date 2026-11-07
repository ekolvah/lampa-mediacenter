(async function () {
  // Шаг 3: YouTube-мост встроенного плеера играет. Движок снимает .player-video__youtube-needclick
  // и при playing, и при ошибке; при ошибке он же открывает .player-video__youtube-noplayed.
  var playing = function () {
    return document.querySelector('.player.youtube .player-video__youtube-bridge-frame')
      && !document.querySelector('.player-video__youtube-needclick')
      && document.querySelector('.player-video__youtube-noplayed.hide');
  };
  var ok = await Live.waitFor(playing, 20000);
  var noplayed = document.querySelector('.player-video__youtube-noplayed:not(.hide)');
  Lampa.Player.close();
  Live.check(!noplayed, 'YouTube: видео недоступно (.player-video__youtube-noplayed)');
  Live.check(ok, 'за 20 с трейлер не заиграл: плеер ' + (document.querySelector('.player') ? 'открыт' : 'не открыт'));
  return 'ok: трейлер играет';
})()
