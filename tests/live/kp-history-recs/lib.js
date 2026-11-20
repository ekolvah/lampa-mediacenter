// Помощники шагов kp-history-recs; tests/live/lib.sh (step) подклеивает файл к каждому шагу.

// Признак сериала и ключ тайтла — как isTv и recKey в plugins/kp-reactions-fix.js.
function isTv(card) { return !!(card.number_of_seasons || card.first_air_date); }
function recKey(id, tv) { return id + ':' + (tv ? 'tv' : 'movie'); }
function scanQueue() { return Lampa.Storage.get('recomends_scan', '[]'); }
function queued(queue, key) {
  return queue.filter(function (e) { return recKey(e.id, e.tv) === key; })[0];
}

// Ключи TMDB-тайтлов, которые нашёл проход плагина по KP-истории; undefined, пока проход идёт.
function kpKeys() { return Lampa.Api.sources.KP.__history_recs; }
