(function () {
  'use strict';

  // Фильтр качества («Смотреть → Торренты → Фильтр») применяется только внутри
  // экрана одного фильма — на карточках в списках (Главная/Избранное/подборки)
  // не видно, что у фильма вообще нет раздач нужного качества. Плагин докидывает
  // на такие карточки метку и лёгкое затемнение.
  //
  // Источник раздач — Lampa.Parser.get, тот же метод, которым пользуется штатный
  // экран «Торренты» (см. src/components/torrents.js в зеркале движка): это даёт
  // тот же бэкенд (jackett/prowlarr/torrserver — какой у пользователя настроен) и
  // тот же формат ответа без необходимости повторять сборку запроса вручную.
  //
  // Раздачи запрашиваются только по глобальному фильтру torrents_filter — если у
  // конкретного фильма выставлен персональный оверрайд (torrents_filter_data),
  // он игнорируется: у списочных карточек KP нет number_of_seasons, из-за чего
  // локально посчитанный cardID может не совпасть с тем, что вычислит сам экран
  // «Торренты» для сериала. Оверрайды — редкий кейс, глобальный фильтр покрывает
  // основной сценарий.

  var CACHE_KEY = 'torrent_quality_badge_cache';
  var CACHE_MAX_ENTRIES = 500;
  var CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  var MAX_CONCURRENT = 2;

  var QUALITY_TESTS = {
    '4k': /(4k|uhd)[ |\]|,|$]|2160[pр]|ultrahd/,
    '1080p': /fullhd|1080[pр]/,
    '720p': /720[pр]/
  };

  var QUALITY_LABELS = { '4k': '4K', '1080p': '1080p', '720p': '720p' };

  function toArray(v) {
    if (v === undefined || v === null || v === '') return [];
    return Array.isArray(v) ? v : [v];
  }

  var processed = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  var processedFallback = [];

  function alreadyProcessed(item) {
    if (processed) return processed.has(item);
    return processedFallback.indexOf(item) >= 0;
  }

  function markProcessed(item) {
    if (processed) processed.add(item);
    else processedFallback.push(item);
  }

  function injectStyle() {
    if (document.getElementById('torrent-quality-badge-style')) return;

    var style = document.createElement('style');
    style.id = 'torrent-quality-badge-style';
    style.textContent =
      '.card__marker--quality-miss::before{background-color:#ff8a3d;}' +
      '.card__marker--quality-miss>span{max-width:9.5em;}';
    document.head.appendChild(style);
  }

  function movieTypeFlag(movie) {
    if (movie.type) return movie.type;
    return movie.name || movie.original_name ? 'tv' : 'movie';
  }

  function buildSearch(movie) {
    var year = ((movie.first_air_date || movie.release_date || '0000') + '').slice(0, 4);
    var title = movie.title || '';
    var original = movie.original_title || '';
    var combos = {
      df: original,
      df_year: original + ' ' + year,
      df_lg: original + ' ' + title,
      df_lg_year: original + ' ' + title + ' ' + year,
      lg: title,
      lg_year: title + ' ' + year,
      lg_df: title + ' ' + original,
      lg_df_year: title + ' ' + original + ' ' + year
    };
    return combos[Lampa.Storage.field('parse_lang')] || title;
  }

  function qualityMatches(results, qualities) {
    for (var i = 0; i < results.length; i++) {
      var title = (results[i].Title || '').toLowerCase();
      for (var j = 0; j < qualities.length; j++) {
        var re = QUALITY_TESTS[qualities[j]];
        if (re && re.test(title)) return true;
      }
    }
    return false;
  }

  function applyBadge(item, miss, qualityLabel) {
    var root = item.render ? item.render(true) : null;
    if (!root) return;

    root.classList.toggle('card--disabled', !!miss);

    if (!miss || root.querySelector('.card__marker--quality-miss')) return;

    var view = root.querySelector('.card__view');
    if (!view) return;

    var marker = document.createElement('div');
    marker.className = 'card__marker card__marker--quality-miss';

    var span = document.createElement('span');
    span.textContent = 'нет ' + qualityLabel;

    marker.appendChild(span);
    view.appendChild(marker);
  }

  var queue = [];
  var active = 0;
  var inFlight = Object.create(null);

  function pump() {
    while (active < MAX_CONCURRENT && queue.length) {
      var task = queue.shift();
      active++;

      Lampa.Parser.get(
        {
          search: buildSearch(task.movie),
          movie: task.movie,
          from_search: false,
          clarification: false,
          global: true,
          other: false
        },
        function (key) {
          return function (data) {
            finishTask(key, ((data && data.Results) || []));
          };
        }(task.key),
        function (key) {
          return function () {
            finishTask(key, null);
          };
        }(task.key)
      );
    }
  }

  function finishTask(key, results) {
    var callbacks = inFlight[key] || [];
    delete inFlight[key];
    active--;

    if (results !== null) {
      var miss = !qualityMatches(results, key.split(':')[2].split(','));

      var cache = Lampa.Storage.cache(CACHE_KEY, CACHE_MAX_ENTRIES, {});
      cache[key] = { ts: Date.now(), miss: miss };
      Lampa.Storage.set(CACHE_KEY, cache);

      callbacks.forEach(function (cb) {
        cb(miss);
      });
    }

    pump();
  }

  function enqueue(item, movie, quality) {
    var key = movie.id + ':' + movieTypeFlag(movie) + ':' + quality.slice().sort().join(',');
    var label = quality.map(function (q) {
      return QUALITY_LABELS[q] || q;
    }).join('/');

    var cache = Lampa.Storage.cache(CACHE_KEY, CACHE_MAX_ENTRIES, {});
    var cached = cache[key];

    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      applyBadge(item, cached.miss, label);
      return;
    }

    if (inFlight[key]) {
      inFlight[key].push(function (miss) {
        applyBadge(item, miss, label);
      });
      return;
    }

    inFlight[key] = [
      function (miss) {
        applyBadge(item, miss, label);
      }
    ];

    queue.push({ key: key, movie: movie });
    pump();
  }

  function onLineEvent(e) {
    if (!e.items || !e.items.length) return;

    var filter = Lampa.Storage.get('torrents_filter', {});
    var quality = toArray(filter.quality);
    if (!quality.length) return;

    e.items.forEach(function (item) {
      if (alreadyProcessed(item)) return;
      if (!item.data || !item.data.id) return;

      markProcessed(item);
      enqueue(item, item.data, quality);
    });
  }

  function startPlugin() {
    if (window.torrent_quality_badge_plugin) return;
    window.torrent_quality_badge_plugin = true;

    injectStyle();
    Lampa.Listener.follow('line', onLineEvent);
  }

  if (window.Lampa && window.Lampa.Api) startPlugin();
  else Lampa.Listener.follow('app', function (e) {
    if (e.type == 'ready') startPlugin();
  });
})();
