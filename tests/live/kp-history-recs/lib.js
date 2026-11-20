// Помощники шагов kp-history-recs; tests/live/lib.sh (step) подклеивает файл к каждому шагу.

function isTv(card) { return !!(card.number_of_seasons || card.first_air_date); }
function recKey(id, tv) { return id + ':' + (tv ? 'tv' : 'movie'); }
function scanQueue() { return Lampa.Storage.get('recomends_scan', '[]'); }
function queued(queue, key) {
  return queue.filter(function (e) { return recKey(e.id, e.tv) === key; })[0];
}

// TMDB-тайтлы KP-истории с imdb_id — тем же find, что у плагина (ответ из кэша движка), с тем же
// выбором типа. Записи без imdb_id плагин ищет по названию: здесь они не проверяются.
function kpExpected() {
  var kp = Lampa.Favorite.get({ type: 'history' }).filter(function (e) { return e.source === 'KP'; });
  return Promise.all(kp.filter(function (e) { return e.imdb_id; }).map(function (e) {
    return new Promise(function (ok) {
      Lampa.Api.sources.tmdb.get('find/' + e.imdb_id + '?external_source=imdb_id', {}, function (found) {
        var film = (found.movie_results || [])[0];
        var tv = (found.tv_results || [])[0];
        if (tv && (isTv(e) || !film)) ok(recKey(tv.id, true));
        else ok(film ? recKey(film.id, false) : null);
      }, function () { ok(null); }, { life: 60 * 24 * 7 });
    });
  })).then(function (keys) {
    return { kp: kp.length, keys: keys.filter(Boolean) };
  });
}
