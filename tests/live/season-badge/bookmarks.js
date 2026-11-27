(async function () {
  // Спек card-season-badge: «Карточка tmdb или cub в «Избранном»», «Сезон вышел целиком» и «Фильм».
  // Текст метки каждой tmdb/cub-карточки сериала сверяется с правилом над tv/<id> (кэш движка).
  Lampa.Activity.push({ url: '', title: Lampa.Lang.translate('title_book'), component: 'bookmarks', page: 1 });
  function core() {
    return SB.cards().filter(function (el) {
      return el.card_data.source !== 'KP' && SB.series(el.card_data) && SB.badge(el);
    });
  }
  var ok = await Live.waitFor(function () {
    return Lampa.Activity.active().component === 'bookmarks' && core().length;
  }, 15000);
  Live.check(ok, 'за 15 с в «Избранном» нет меток на сериалах tmdb/cub (активна ' + Lampa.Activity.active().component + ')');

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
  return 'ok: ' + checked.join('; ');
})()
