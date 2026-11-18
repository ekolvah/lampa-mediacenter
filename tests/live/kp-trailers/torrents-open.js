(async function () {
  // После OK на «Торренты» (plugins/kp-reactions-fix.js, spec card-buttons) открыт список
  // торрентов этой карточки: активный компонент torrents, его карточка — «1+1» (KP 535341).
  var ID = 'KP_535341';
  var opened = await Live.waitFor(function () { return Lampa.Activity.active().component === 'torrents'; }, 10000);
  var active = Lampa.Activity.active();
  Live.check(opened, 'список торрентов не открылся: ' + active.component);
  var movie = active.movie || {};
  Live.check(movie.id === ID, 'торренты открыты для ' + movie.id + ', а не ' + ID);
  return 'ok: торренты ' + ID;
})()
