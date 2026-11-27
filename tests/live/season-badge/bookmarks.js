(async function () {
  // Спек card-season-badge: «Карточка tmdb или cub в «Избранном»», «KP-карточка сериала без type»,
  // «Сезон вышел целиком» и «Фильм». Текст метки каждой tmdb/cub-карточки сериала сверяется с правилом
  // над tv/<id> (кэш движка); у KP-сериала метка только есть: текст требует поиска тайтла.
  // SB.series повторяет правило плагина, поэтому его ошибку ловит инвариант: у KP-карточки без type
  // original_name есть ровно тогда, когда есть признаки сериала (number_of_seasons или first_air_date).
  Lampa.Activity.push({ url: '', title: Lampa.Lang.translate('title_book'), component: 'bookmarks', page: 1 });
  function core() {
    return SB.cards().filter(function (el) {
      return el.card_data.source !== 'KP' && SB.series(el.card_data) && SB.badge(el);
    });
  }
  var ok = await Live.waitFor(function () {
    return Lampa.Activity.active().component === 'bookmarks' && core().length && SB.kpSeries().every(SB.badge);
  }, 15000);
  var kpCards = SB.kpSeries();
  var bare = kpCards.filter(function (el) { return !SB.badge(el); });
  Live.check(ok, 'за 15 с в «Избранном» нет меток на сериалах tmdb/cub или на KP-сериалах ' +
    bare.map(function (el) { return el.card_data.id; }).join(', ') + ' (активна ' + Lampa.Activity.active().component + ')');

  SB.cards().forEach(function (el) {
    var d = el.card_data;
    if (d.source !== 'KP' || d.type) return;
    var tvSigns = !!(d.number_of_seasons || d.first_air_date);
    Live.check(!!d.original_name === tvSigns, d.id + ' ' + d.title + ': original_name ' + !!d.original_name + ', признаки сериала ' + tvSigns);
  });
  var kp = kpCards.map(function (el) { return el.card_data.title + ' ' + SB.badge(el); });

  function expected(tv) {
    var last = tv.last_episode_to_air;
    if (!last || !last.season_number) return null;
    var season = (tv.seasons || []).filter(function (s) { return s.season_number === last.season_number; })[0];
    var total = (season && season.episode_count) || 0;
    var next = tv.next_episode_to_air;
    var more = !!next && next.season_number === last.season_number;
    if (total > 0 && last.episode_number >= total && !more) return 'S' + last.season_number + ' ✓';
    return 'S' + last.season_number + ' ' + (total > 0 ? last.episode_number + '/' + total : last.episode_number);
  }

  function details(id) {
    return new Promise(function (resolve) {
      Lampa.Api.sources.tmdb.get('tv/' + id, {}, resolve, function () { resolve(null); }, { life: 60 * 24 });
    });
  }

  var checked = [];
  for (var el of core()) {
    var d = el.card_data;
    var tv = await details(d.id);
    var want = tv ? expected(tv) : 'S ?';
    Live.check(SB.badge(el) === want, d.id + ' ' + d.original_name + ': метка ' + SB.badge(el) + ', по TMDB ' + want);
    checked.push(d.original_name + ' ' + want);
  }
  var movies = SB.moviesWithBadge();
  Live.check(!movies.length, 'метки на фильмах: ' + movies.join(', '));
  return 'ok: ' + checked.join('; ') + '; KP: ' + kp.join('; ');
})()
