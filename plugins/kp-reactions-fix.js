(function () {
  'use strict';

  // Карточка. На источнике KP (плагин kp_source) карточки несут id вида "KP_<kinopoisk_id>",
  // а движок берёт реакции (cub.red) и трейлеры (TMDB videos) по TMDB id — у
  // KP-карточек его нет, поэтому блок реакций пуст, а кнопки «Трейлеры» нет.
  // Патч дорезолвливает TMDB-тайтл через imdb_id (который KP отдаёт), а без
  // imdb_id или при пустом find — поиском TMDB по названию и году со сверкой
  // названия, и подставляет в ответ KP.full() reactions и videos тем же способом,
  // каким их получает штатный источник tmdb — см. docs/lampa-config-review.md. Тайтл не найден —
  // реакций нет, а в «Трейлеры» идёт русский трейлер сервиса без season, если он есть.
  // Если русского видео у TMDB нет, первым в список ставится русский трейлер с
  // YouTube от сервиса трейлеров на приставке (docs/jacred-on-ugoos.md). У сериала,
  // чей последний вышедший сезон N ≥ 2, первым ставится трейлер сезона N: от сервиса,
  // иначе из видео сезона в TMDB. Русский трейлер и трейлер сезона получают и карточки источников
  // tmdb и cub: обёртка их full, тайтл — id карточки, видео и реакции даёт сам источник. Кнопка
  // «Трейлер» в строке кнопок карточки запускает первый ролик этого списка.
  //
  // Источник KP. Главную KP строит плагин (KP.main kp_source не зовётся): ряды «Сейчас смотрят
  // фильмы/сериалы», за ними рекомендации, при прокрутке — ряды новинок порциями по 5 («Топ
  // новинок», жанровые по id жанра из KP.menu), карточка на Главной не повторяется (spec
  // kp-main-new-release-rows). Ряды «Сейчас смотрят» и их полный список по «Ещё» показывают только
  // новинки (обёртки KP.main и KP.list, тот же поиск TMDB-тайтла, что для трейлеров). Карточка,
  // которой раньше в ряду не было, или сериал с новым сезоном 5 дней стоят в начале ряда, пока их не
  // открыли — карточкой KP или карточкой tmdb/cub того же TMDB-тайтла (его новая карточка ищет после
  // сборки); память рядов — ключ kp_now_watching_seen.
  // Тем же поиском KP-история попадает в ряд ядра «Рекомендуем посмотреть»:
  // её TMDB-тайтлы встают в очередь recomends_scan, а из recomends_list убираются (spec
  // kp-history-recommendations). Рекомендации ядра плагин копит в отдельных списках типа
  // kp_recs_movie/kp_recs_tv, и Lampa.Recomends.get/page отдают их (spec kp-main-recommendations).
  //
  // DMCA. Ядро кладёт список CUB tmdb.<cub_domain>/blocked в lampa_settings.dcma, и по нему
  // карточки tmdb/cub таких тайтлов не открываются, а поиск их убирает. Плагин делает поле всегда
  // false — умолчанием ядра, запись ядра игнорируется (spec tmdb-access). Не удалось — Noty и
  // console.error. Карточку cub это не открывает: такие тайтлы режет сам сервер CUB (blocked: true).
  //
  // Кинопоиск. По списку CUB <cub_domain>/api/kinopoisk/list ядро ставит в карточке «Смотреть на
  // Кинопоиске» вместо своих кнопок и не шлёт плагинам события full, так что «Торренты» и «Трейлер»
  // плагина не появляются. Плагин до старта приложения включает выключатель ядра
  // lampa_settings.disable_features.kinopoisk (spec tmdb-access). Не удалось или приложение уже
  // стартовало — Noty и console.error.
  //
  // Закладки. Ядро сравнивает закладки по id, поэтому тайтл, добавленный из KP и из TMDB, лежит в
  // списке двумя карточками. Плагин сводит записи по imdb_id (spec favorites-across-sources): при
  // чтении (обёртка Account.Bookmarks.get) — одна карточка на тайтл, tmdb/cub в приоритете; метка и
  // кнопка закладки (обёртки Favorite.check/toggle) видят запись тайтла другого источника, нажатие
  // снимает все записи тайтла в списке. Аккаунт CUB не правится. Нет функции ядра — Noty и
  // console.error; без синхронизации — ядро как есть и console.warn.
  //
  // Метка сезона. На видимой карточке сериала (tmdb, cub, KP; любой экран — обёртка Card.onVisible
  // ядра) в правом верхнем углу: «S4 6/10» — сезон последней вышедшей серии выходит, «S2 ✓» — вышел
  // целиком, серая «S ?» — сведений TMDB нет (spec card-season-badge). Тайтл KP — тем же поиском, что
  // для трейлеров; поиск и tv/<id> — не больше раза на карточку (источник + id) за сессию, сбой тоже.
  // Нет хука ядра — Noty и console.error.

  // ---- Общее: константы, сравнение названий, источники движка, помощники TMDB ----

  var DAY = 60 * 24; // life кэша движка — в минутах
  var WEEK = DAY * 7;
  var TRAILER_SERVICE = 'http://127.0.0.1:9118/trailer';
  // Больше срока поиска в сервисе (8 с): при зависшем YouTube успевает прийти его 502.
  var TRAILER_TIMEOUT_MS = 10000;
  // Сколько Главная или страница полного списка ждёт новинок: дольше экран пуст.
  var ROWS_TIMEOUT_MS = 5000;
  // Предел прохода по KP-истории для рекомендаций: меньше первого тика ядра (120 с).
  var RECS_TIMEOUT_MS = 60000;
  // Страниц коллекции на ряд Главной и на одну страницу полного списка.
  var BATCH = 5;
  // Карточек в ряду рекомендаций Главной (у ядра 20) и карточек на странице его экрана «Ещё».
  var REC_ROW_LIMIT = 40;
  var REC_PAGE = 20;
  // Тайтлов в списке рекомендаций одного типа: весь круг сканов ядра по истории (design.md
  // kp-split-recommendations, решение 4); у ядра 100 на оба типа — рекомендации 5–7 последних сканов.
  var REC_TYPE_LIMIT = 500;
  // Добавка к заголовку ряда, собранного не до конца.
  var INCOMPLETE = ' · неполный';
  // Штатные ряды kp_source по url, который кладёт его getList.
  var NOW_WATCHING = [
    { url: 'api/v2.2/films/collections?type=TOP_POPULAR_MOVIES', name: 'Сейчас смотрят фильмы' },
    { url: 'api/v2.2/films/collections?type=POPULAR_SERIES', name: 'Сейчас смотрят сериалы' },
  ];
  // Ряды подгрузки Главной KP (spec kp-main-new-release-rows): заголовок, type и жанр Кинопоиска —
  // название из списка KP.menu.
  var NEW_ROWS = [
    { title: 'Топ новинок: фильмы', type: 'FILM' },
    { title: 'Топ новинок: сериалы', type: 'TV_SERIES' },
    { title: 'Топ новинок: мини-сериалы', type: 'MINI_SERIES' },
    { title: 'Новые комедии', type: 'FILM', genre: 'комедия' },
    { title: 'Новые ужасы', type: 'FILM', genre: 'ужасы' },
    { title: 'Новая фантастика', type: 'FILM', genre: 'фантастика' },
    { title: 'Новые боевики', type: 'FILM', genre: 'боевик' },
    { title: 'Новые триллеры', type: 'FILM', genre: 'триллер' },
    { title: 'Новые мультфильмы', type: 'FILM', genre: 'мультфильм' },
    { title: 'Новые семейные фильмы', type: 'FILM', genre: 'семейный' },
    { title: 'Новые детективные сериалы', type: 'TV_SERIES', genre: 'детектив' },
    { title: 'Новые комедийные сериалы', type: 'TV_SERIES', genre: 'комедия' },
    { title: 'Новые драматические сериалы', type: 'TV_SERIES', genre: 'драма' },
  ];
  // Рядов в порции подгрузки — как parts_limit у kp_source; меньше MIN_FIRST рядов в первой порции —
  // она дописывается подгрузкой, как partNext ядра.
  var PORTION = 5;
  var MIN_FIRST = 3;
  // Память рядов NOW_WATCHING в Lampa.Storage: { <url ряда>: { <id карточки>: { f, s, l, t } } };
  // f — мс появления (0 — не новая), s — сезон сериала или null, l — день последней сборки с ней,
  // t — TMDB-тайтл новой карточки titleKey(), если найден: по нему её снимает открытие карточки tmdb/cub.
  var SEEN_KEY = 'kp_now_watching_seen';
  var DAY_MS = 24 * 60 * 60 * 1000;
  // Сколько дней карточка стоит в начале ряда и через сколько дней отсутствия её забывают.
  var NEW_DAYS = 5;
  var FORGET_DAYS = 30;

  // normalizeTitle/cleanTitle — копия из kp_source.js (наружу не экспортированы):
  // регистр, виды дефиса, «ё»/«е» и пунктуация при сравнении не важны.
  function cleanTitle(str) {
    return str.replace(/[\s.,:;\u2019'`!?]+/g, ' ').trim();
  }

  function normalizeTitle(str) {
    return cleanTitle(str.toLowerCase().replace(/[\-\u2010-\u2015\u2E3A\u2E3B\uFE58\uFE63\uFF0D]+/g, '-').replace(/ё/g, 'е'));
  }

  // Нормализованные непустые названия.
  function titles(a, b) {
    return [a, b].filter(function (t) { return typeof t === 'string' && t; }).map(normalizeTitle);
  }

  // Источники движка: cub — реакции карточки, tmdb — оба модуля. Присваивает startPlugin(), код
  // ниже зовётся только после него.
  var cub, tmdb;

  // Поля фильма и сериала: у сериала TMDB name/original_name, у KP-карточки и фильма — title.
  function cardName(movie) {
    return movie.title || movie.name || originalName(movie);
  }

  function originalName(movie) {
    return movie.original_title || movie.original_name || '';
  }

  // tv — признак сериала от вызывающего: type сериала TMDB — его тип (Scripted…), а не 'tv'.
  function releaseDate(movie, tv) {
    return (tv ? movie.first_air_date : movie.release_date) || '';
  }

  // Поиск тайтла по названию: тип из карточки; с годом — первый результат этого года с совпадающим
  // названием, иначе второй поиск без года и первый совпавший результат с годом ±1 (год Кинопоиска
  // бывает на год раньше TMDB, design.md season-complete-badge, решение 3); без года — только
  // единственный. После сбоя поиска второго нет.
  function searchByTitle(movie, cb) {
    var tv = isTvCard(movie);
    var method = tv ? 'tv' : 'movie';
    var year = releaseDate(movie, tv).slice(0, 4);
    var url = 'search/' + method + '?query=' + encodeURIComponent(cardName(movie));
    var want = titles(movie.title, movie.original_title);

    function fail(reason) {
      console.warn('kp-reactions-fix: no title match', reason, movie.title, year);
      cb(null);
    }

    function found(r) {
      cb({ method: method, id: r.id });
    }

    function search(query, done) {
      tmdb.get(query, {}, function (answer) {
        done(((answer && answer.results) || []).filter(function (r) {
          return titles(r.title || r.name, originalName(r)).some(function (t) {
            return want.indexOf(t) !== -1;
          });
        }));
      }, function () {
        fail('search failed');
      }, { life: WEEK });
    }

    if (!year) {
      return search(url, function (matches) {
        if (!matches.length) return fail('not found');
        if (matches.length > 1) return fail('ambiguous without year');
        found(matches[0]);
      });
    }

    search(url + (tv ? '&first_air_date_year=' : '&primary_release_year=') + year, function (matches) {
      if (matches.length) return found(matches[0]);
      search(url, function (all) {
        var near = all.filter(function (r) {
          var y = releaseDate(r, tv).slice(0, 4);
          return y && Math.abs(y - year) <= 1;
        });
        if (near.length) found(near[0]);
        else fail('not found');
      });
    });
  }

  // Сериал ли KP-карточка: решает type, а без него (закладки «Избранного») — original_name, который
  // kp_source.js даёт только сериалам.
  function isTvCard(movie) {
    return movie.type ? movie.type === 'tv' : !!movie.original_name;
  }

  // TMDB-тайтл карточки: по imdb_id (find), без него или при пустом find — по
  // названию. cb(null) — тайтла нет, причина уже в console.warn.
  function resolveTitle(movie, cb) {
    if (!movie.imdb_id) return searchByTitle(movie, cb);

    tmdb.get('find/' + movie.imdb_id + '?external_source=imdb_id', {}, function (found) {
      // Бывает и фильм, и сериал (пустая запись TMDB с тем же imdb_id): берётся тип карточки.
      var film = (found.movie_results || [])[0];
      var tv = (found.tv_results || [])[0];
      if (tv && (isTvCard(movie) || !film)) cb({ method: 'tv', id: tv.id });
      else if (film) cb({ method: 'movie', id: film.id });
      else searchByTitle(movie, cb);
    }, function () {
      console.warn('kp-reactions-fix: find failed, no reactions', cardName(movie), movie.imdb_id);
      cb(null);
    }, { life: WEEK });
  }

  // Последний вышедший сезон по последней вышедшей серии: { number, date, episode — её номер,
  // total — серий сезона по TMDB (0 — неизвестно), more — следующая объявленная серия из этого же
  // сезона }. cb(null) — вышедших серий нет, cb(null, 'error') — запрос не удался; предупреждение с id
  // уже в консоли. Анонсированный сезон без серий не считается.
  function lastSeason(title, cb) {
    tmdb.get('tv/' + title.id, {}, function (tv) {
      var episode = tv && tv.last_episode_to_air;
      if (!episode || !episode.season_number) {
        console.warn('kp-reactions-fix: no last episode', title.id);
        return cb(null);
      }
      var number = episode.season_number;
      var season = (tv.seasons || []).filter(function (s) { return s.season_number === number; })[0];
      var next = tv.next_episode_to_air;
      cb({
        number: number,
        date: episode.air_date || '',
        episode: episode.episode_number,
        total: (season && season.episode_count) || 0,
        more: !!next && next.season_number === number,
      });
    }, function () {
      console.warn('kp-reactions-fix: tv details failed', title.id);
      cb(null, 'error');
    }, { life: DAY });
  }

  function isObject(x) {
    return !!x && typeof x === 'object' && !Array.isArray(x);
  }

  // Причина сбоя «no Lampa.<путь>, …» для путей от Lampa ('Account.Bookmarks.get'), где нет функции;
  // '' — все на месте.
  function missingFns(paths) {
    var missing = paths.filter(function (path) {
      var fn = path.split('.').reduce(function (obj, key) { return obj && obj[key]; }, Lampa);
      return typeof fn !== 'function';
    });
    return missing.length ? 'no ' + missing.map(function (path) { return 'Lampa.' + path; }).join(', ') : '';
  }

  function isCoreSource(card) {
    return card.source === 'tmdb' || card.source === 'cub';
  }

  // Ключ TMDB-тайтла в памяти рядов: id фильма и сериала в TMDB из разных пространств.
  function titleKey(title) {
    return title.method + '/' + title.id;
  }

  // Память рядов (SEEN_KEY) копией. Не той формы — предупреждение и пустая память, т. е. первый
  // запуск.
  function readSeen() {
    var seen = Lampa.Storage.get(SEEN_KEY, '{}');
    var ok = isObject(seen) && Object.keys(seen).every(function (url) {
      var row = seen[url];
      return isObject(row) && Object.keys(row).every(function (id) { return isObject(row[id]); });
    });
    if (ok) return JSON.parse(JSON.stringify(seen));
    console.warn('kp-reactions-fix: ' + SEEN_KEY + ' corrupt, starting over', String(JSON.stringify(seen)).slice(0, 200));
    return {};
  }

  // Правка памяти рядов: fn(seen) меняет копию и возвращает true, если что-то изменила.
  function editSeen(fn) {
    var seen = readSeen();
    if (fn(seen)) Lampa.Storage.set(SEEN_KEY, seen);
  }

  // Открытая карточка больше не новая в рядах NOW_WATCHING — со следующей сборки Главной. key — id
  // карточки ряда (KP_<n>, его же отдаёт KP.full) или titleKey() её TMDB-тайтла (карточки tmdb/cub).
  function markOpened(key) {
    editSeen(function (seen) {
      var changed = false;
      for (var url in seen) {
        for (var id in seen[url]) {
          var entry = seen[url][id];
          if ((id === key || entry.t === key) && entry.f !== 0) {
            entry.f = 0;
            changed = true;
          }
        }
      }
      return changed;
    });
  }

  // ---- Карточка: реакции, трейлеры, кнопки ----

  // Реакции и трейлеры одного тайтла параллельно; oncomplite — когда готовы оба.
  function enrich(result, title, oncomplite) {
    var pending = 2;
    function done() { if (--pending === 0) oncomplite(result); }

    cub.reactionsGet(title, function (reactions) {
      result.reactions = reactions;
      done();
    });

    if (typeof tmdb.videos !== 'function') {
      console.warn('kp-reactions-fix: tmdb.videos is not a function, no trailers', title.method, title.id);
      return done();
    }

    // Видео и, у сериала, его последний сезон — параллельно; решение о трейлере — когда пришли оба.
    var videos;
    var season;
    var waiting = 2;
    function ready() {
      if (--waiting === 0) trailers(result, title, videos, season, done);
    }

    trailerSeason(title, function (last) {
      season = last;
      ready();
    });
    // Сбой запроса движок отдаёт как пустой список — не отличить от «видео нет».
    tmdb.videos(title, function (answer) {
      videos = answer;
      ready();
    });
  }

  // Сезон для трейлера: последний вышедший сезон сериала, если он второй или дальше; иначе null.
  function trailerSeason(title, cb) {
    if (title.method !== 'tv') return cb(null);
    lastSeason(title, function (last) { cb(last && last.number >= 2 ? last : null); });
  }

  // Список «Трейлеры»: видео TMDB, первым — русский трейлер сервиса; у сериала с последним
  // сезоном N ≥ 2 — трейлер сезона N, при отказе сервиса — из видео сезона в TMDB.
  // title null — TMDB-тайтла нет (причина уже в console.warn), videos — из ответа источника.
  function trailers(result, title, videos, season, done) {
    var list = (videos && videos.results) || [];
    if (!list.length && title) {
      console.warn('kp-reactions-fix: no videos', title.method, title.id);
    }
    result.videos = videos;
    var hasRu = list.some(function (v) { return v.iso_639_1 === 'ru'; });
    // Русский ролик TMDB не говорит, какого он сезона, поэтому у сериала сервис спрашивают всегда.
    if (hasRu && !season) return done();

    var movie = result.movie;
    var tv = title ? title.method === 'tv' : movie.type === 'tv';
    var date = season ? season.date : releaseDate(movie, tv);
    ruTrailer(movie, tv, season, function (video) {
      if (video) {
        result.videos = { results: putFirst(video, date, list) };
        return done();
      }
      if (!season) return done();
      seasonTrailer(title, movie, season, function (trailer) {
        if (trailer) result.videos = { results: putFirst(trailer, date, list) };
        done();
      });
    });
  }

  function time(video) {
    return new Date(video.published_at).getTime();
  }

  // Самое новое видео по published_at; без даты не считается. null — датированных нет.
  function newest(list) {
    return list.reduce(function (max, v) { return time(v) > (max ? time(max) : -Infinity) ? v : max; }, null);
  }

  // Ролик первым в списке «Трейлеры» по ключам сортировки движка: язык tmdb_lang (до «Ещё»)
  // и published_at строго позже самого нового в списке — при равных датах порядок не задан.
  function putFirst(video, date, list) {
    var last = newest(list);
    var at = date;
    if (last && !(new Date(date).getTime() > time(last))) at = new Date(time(last) + 1000).toISOString();
    var first = {};
    for (var key in video) first[key] = video[key];
    first.iso_639_1 = Lampa.Storage.field('tmdb_lang');
    first.published_at = at;
    return [first].concat(list);
  }

  // Самый новый Trailer сезона из TMDB тем же путём, что и у движка. cb(null) — трейлера нет,
  // причина в console.warn. Колбэк движка для сезона может не прийти (seasonFix), поэтому срок.
  function seasonTrailer(title, movie, season, cb) {
    var finished = false;
    function finish(trailer, reason) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (!trailer) console.warn('kp-reactions-fix: no season trailer', cardName(movie), 'season ' + season.number, reason);
      cb(trailer);
    }
    var timer = setTimeout(function () { finish(null, 'timeout'); }, TRAILER_TIMEOUT_MS);

    tmdb.videos({ method: title.method + '/' + title.id + '/season', id: season.number }, function (videos) {
      var list = videos && Array.isArray(videos.results) ? videos.results : [];
      var trailer = newest(list.filter(function (v) { return v.type === 'Trailer'; }));
      finish(trailer, 'no trailer among ' + list.length + ' videos');
    });
  }

  // Русский трейлер с YouTube от сервиса трейлеров на приставке (tools/trailer_service.py),
  // в форме видео TMDB; season — трейлер этого сезона, tv — тип карточки (series=1|0), чтобы
  // сериалу не достался трейлер одноимённого фильма. cb(null) — ролика нет, причина уже в
  // console.warn.
  function ruTrailer(movie, tv, season, cb) {
    var name = cardName(movie);
    var original = originalName(movie);
    var year = releaseDate(movie, tv).slice(0, 4);
    var url = TRAILER_SERVICE + '?title=' + encodeURIComponent(name);
    if (original) url += '&original_title=' + encodeURIComponent(original);
    if (year) url += '&year=' + year;
    if (season) url += '&season=' + season.number;
    url += '&series=' + (tv ? 1 : 0);

    function fail(reason) {
      console.warn('kp-reactions-fix: no russian trailer', name, year, season ? 'season ' + season.number : '', reason);
      cb(null);
    }

    var request = new Lampa.Reguest();
    request.timeout(TRAILER_TIMEOUT_MS);
    request.silent(url, function (found) {
      if (!found || !found.video_id) return fail((found && found.reason) || 'empty answer');
      cb({ site: 'YouTube', key: found.video_id, name: found.title, type: 'Trailer' });
    }, function (xhr) {
      var body = xhr.responseJSON || {};
      var detail = [body.error, body.detail].filter(Boolean).join(': ');
      fail(['HTTP ' + xhr.status, xhr.statusText, detail].filter(Boolean).join(' '));
    });
  }

  function cardButton(cls, sprite, text, onEnter) {
    return $('<div class="full-start__button selector ' + cls + '">' +
      '<svg><use xlink:href="#sprite-' + sprite + '"></use></svg><span>' + text + '</span></div>')
      .on('hover:enter', onEnter);
  }

  // «Торренты» передаёт нажатие скрытой .view--torrent движка, как меню «Смотреть» (spec
  // card-buttons). Без parser_use движок оставляет её с классом hide — тогда кнопки нет.
  function torrentButton(body) {
    var torrent = body.find('.view--torrent:not(.hide)');
    if (!torrent.length) return null;
    return cardButton('button--kp-torrent', 'torrent', 'Торренты', function () {
      torrent.trigger('hover:enter');
    });
  }

  // «Трейлер» запускает первый ролик списка «Трейлеры» с одного нажатия (spec kp-card-trailers).
  // Список собирает и ролик запускает сам движок: обработчик .view--trailer синхронно зовёт
  // Lampa.Select.show, кнопка на этот вызов его перехватывает.
  function trailerButton(body, name) {
    // Карточку без трейлеров движок оставляет без .view--trailer ещё до complite.
    var trailers = body.find('.view--trailer');
    if (!trailers.length) return null;
    return cardButton('button--kp-trailer', 'trailer', 'Трейлер', function () {
      var show = Lampa.Select.show;
      var list = null;
      Lampa.Select.show = function (params) { list = params; };
      try {
        trailers.trigger('hover:enter');
      } finally {
        Lampa.Select.show = show;
      }
      if (!list) return console.warn('kp-reactions-fix: trailer list not intercepted', name);

      var first = (list.items || []).filter(function (item) { return !item.separator; })[0];
      if (first) return list.onSelect(first);
      console.warn('kp-reactions-fix: no trailer for button', name);
      show.call(Lampa.Select, list);
    });
  }

  // «Торренты» и «Трейлер» встают на место «Смотреть», а он уходит в меню «…» (spec card-buttons).
  // «Смотреть» удаляется из DOM, а не скрывается: onGroupButtons движка снимает с него hide
  // при каждом возврате в карточку.
  function onFull(e) {
    if (e.type === 'options') {
      var link = e.link;
      return e.options.unshift({ title: 'Смотреть', onSelect: function () { link.emit('watch', {}); } });
    }
    if (e.type !== 'complite') return;
    var movie = (e.data && e.data.movie) || {};
    var name = movie.title || movie.name || '';
    var play = e.body.find('.button--play');
    if (!play.length) return console.warn('kp-reactions-fix: no play button, no card buttons', name);
    var buttons = [torrentButton(e.body), trailerButton(e.body, name)].filter(Boolean);
    play.after(buttons).remove();
  }

  // Карточки источников ядра tmdb и cub (spec kp-card-trailers, «Трейлеры карточки TMDB»): id
  // карточки — TMDB id, видео и реакции уже в ответе full, трейлеры ставятся до отрисовки.
  function patchSourceCards() {
    var missing = [['tmdb.full', tmdb && tmdb.full], ['cub.full', cub && cub.full],
      ['tmdb.videos', tmdb && tmdb.videos], ['tmdb.get', tmdb && tmdb.get]]
      .filter(function (f) { return typeof f[1] !== 'function'; })
      .map(function (f) { return f[0]; });
    if (missing.length) {
      return console.error('kp-reactions-fix: no trailers for tmdb and cub cards, opening does not clear new mark, missing', missing.join(', '));
    }

    [tmdb, cub].forEach(function (source) {
      var orgFull = source.full;
      source.full = function (params, oncomplite, onerror) {
        // Сезон — параллельно с ответом источника, как в enrich; решение — когда пришли оба.
        var title = { method: params.method, id: params.id };
        var result;
        var season;
        var waiting = 2;
        function ready() {
          if (--waiting) return;
          if (!result || !result.movie) return oncomplite(result);
          trailers(result, title, result.videos, season, function () { oncomplite(result); });
        }

        markOpened(titleKey(title));
        trailerSeason(title, function (last) {
          season = last;
          ready();
        });
        return orgFull.call(source, params, function (answer) {
          result = answer;
          ready();
        }, onerror);
      };
    });
  }

  // ---- Источник KP: KP.full, Главная, «Ещё», KP-история в рекомендациях ----

  function patch() {
    var KP = Lampa.Api.sources.KP;

    if (!KP || !cub || !tmdb || KP.__reactions_patched) return;

    var orgFull = KP.full;

    KP.full = function (params, oncomplite, onerror) {
      var answer = orgFull.call(KP, params, function (result) {
        var movie = result && result.movie;
        if (!movie) return oncomplite(result);

        resolveTitle(movie, function (title) {
          if (title) enrich(result, title, oncomplite);
          else trailers(result, null, result.videos, null, function () { oncomplite(result); });
        });
      }, onerror);
      if (params && params.card) markOpened(params.card.id);
      return answer;
    };

    // Новинка (spec now-watching-new-releases): год по Кинопоиску не раньше прошлого; у сериала
    // со старым стартом — последний эпизод по TMDB за 365 дней. 'episode' — нужна дата эпизода
    // (lastEpisodeDate не передан), 'unknown' — проверить нечем.
    function isNewRelease(card, rule, lastEpisodeDate) {
      var year = parseInt(releaseDate(card, card.type === 'tv').slice(0, 4), 10);
      if (!year) return 'unknown';
      if (year >= rule.minYear) return 'new';
      if (card.type !== 'tv') return 'old';
      if (lastEpisodeDate === undefined) return 'episode';
      if (!lastEpisodeDate) return 'unknown';
      return lastEpisodeDate >= rule.cutoff ? 'new' : 'old';
    }

    function noveltyRule(today) {
      function pad(n) { return (n < 10 ? '0' : '') + n; }
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 365);
      return {
        minYear: today.getFullYear() - 1,
        cutoff: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      };
    }

    // Последний вышедший сезон сериала по TMDB: { number, date }. cb(null, причина) — сведений нет;
    // причина годится и для пустой date.
    function lastEpisode(card, cb) {
      resolveTitle(card, function (title) {
        if (!title || title.method !== 'tv') return cb(null, 'no tmdb tv title');
        lastSeason(title, function (last) {
          cb(last, 'no last episode date, tv/' + title.id);
        });
      });
    }

    function rowsFailed(reason) {
      console.error('kp-reactions-fix: new release rows not built', reason);
      Lampa.Noty.show('Ряды новинок не построены: ' + reason);
    }

    // Ожидание ответов одного сбора. pending() — один ожидаемый ответ: settle = pending(),
    // settle(fn) — его колбэк (успех или ошибка). done() зовётся, когда пришли все ответы, но не
    // позже ms; поздние колбэки после него не вызываются. start() — запросы
    // поставлены: ответы из кэша приходят синхронно, раньше него.
    function waiter(done, ms) {
      var finished = false;
      var waiting = 1;
      var timer = setTimeout(finish, ms);
      function finish() {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        var fn = done;
        done = null;
        fn();
      }
      function release() { if (--waiting === 0) finish(); }
      return {
        pending: function () {
          var settled = false;
          waiting++;
          return function (fn) {
            return function () {
              if (finished || settled) return;
              settled = true;
              fn.apply(null, arguments);
              release();
            };
          };
        },
        start: release
      };
    }

    // Страница page списка url у исходного KP.list; ответ ждёт pending того waiter, что его собирает.
    function fetchPage(url, page, pending, ok, fail) {
      var settle = pending();
      orgList.call(KP, { url: url, page: page }, settle(ok), settle(fail));
    }

    // Новинки страниц коллекции first..last: страница first — known (ответ, уже полученный
    // Главной) или запрос, остальные — запросы к исходному KP.list. needSeason(card) — нужен ли
    // сезон сериала-новинки (у сериала со старым стартом он приходит с датой эпизода); без него сезон
    // новинке не нужен. Возвращает build(): { results, gaps, seasons } — новинки и непроверенные в
    // порядке коллекции, число недошедших страниц, id → полученный сезон.
    function collectPages(spec, first, last, known, rule, pending, needSeason) {
      var pages = []; // undefined — нет ответа, null — ошибка страницы

      function addPage(page, json) {
        if (json && json.total_pages) srcPages[spec.url] = json.total_pages;
        pages[page - first] = ((json && json.results) || []).map(function (card) {
          var item = { card: card, verdict: isNewRelease(card, rule), reason: 'no year', season: null };
          var episode = item.verdict === 'episode';
          item.asked = card.type === 'tv' && !!needSeason && needSeason(card);
          if (!episode && !(item.asked && item.verdict === 'new')) return item;
          item.reason = 'timeout';
          lastEpisode(card, pending()(function (last, reason) {
            if (episode) item.verdict = isNewRelease(card, rule, (last && last.date) || null);
            item.season = last ? last.number : null;
            item.reason = reason;
          }));
          return item;
        });
      }

      if (known) addPage(first, known);
      for (var page = known ? first + 1 : first; page <= last; page++) (function (page) {
        fetchPage(spec.url, page, pending, function (json) {
          addPage(page, json);
        }, function () {
          pages[page - first] = null;
        });
      })(page);

      return function () {
        var results = [];
        var gaps = [];
        var seasons = {};
        for (var i = 0; i <= last - first; i++) {
          if (!pages[i]) {
            gaps.push('page ' + (first + i) + ' ' + (pages[i] === null ? 'failed' : 'timeout'));
            continue;
          }
          pages[i].forEach(function (item) {
            if (item.verdict === 'old') return;
            if (item.verdict !== 'new') console.warn('kp-reactions-fix: new release not checked', cardName(item.card), item.reason);
            if (item.season !== null) seasons[item.card.id] = item.season;
            else if (item.asked) console.warn('kp-reactions-fix: season unknown', cardName(item.card), item.reason);
            results.push(item.card);
          });
        }
        if (gaps.length) console.warn('kp-reactions-fix: new release row incomplete', spec.name, gaps.join(', '));
        return { results: results, gaps: gaps.length, seasons: seasons };
      };
    }

    // Штатный ряд с новинками вместо карточек: место, заголовок и «Ещё» штатные, total_pages —
    // страниц полного списка. Новинок нет — ряда нет.
    function filteredRow(spec, original, batch) {
      if (!batch.results.length) {
        console.warn('kp-reactions-fix: no new releases', spec.name);
        return null;
      }
      var row = {};
      for (var key in original) row[key] = original[key];
      row.results = batch.results;
      row.total_pages = Math.ceil((original.total_pages || 1) / BATCH);
      if (batch.gaps) row.title += INCOMPLETE;
      return row;
    }

    // Страница N полного списка «Ещё» — новинки страниц коллекции BATCH·(N−1)+1…BATCH·N, не
    // дальше её конца. Пустую пачку пропускает, как сама Lampa: params.page++ и следующая.
    function listBatch(spec, params, oncomplite, onerror) {
      var first = (params.page - 1) * BATCH + 1;
      var last = first + BATCH - 1;
      if (srcPages[spec.url]) last = Math.min(last, srcPages[spec.url]);
      var build;
      var wait = waiter(function () {
        var batch = build();
        var total = Math.ceil((srcPages[spec.url] || last) / BATCH);
        if (batch.gaps && batch.gaps === last - first + 1) return onerror();
        if (!batch.results.length && params.page < total) {
          params.page++;
          return listBatch(spec, params, oncomplite, onerror);
        }
        oncomplite({ results: batch.results, page: params.page, total_pages: total });
      }, ROWS_TIMEOUT_MS);
      build = collectPages(spec, first, last, null, noveltyRule(new Date()), wait.pending);
      wait.start();
    }

    // Порядок ряда (spec now-watching-new-releases, «Новые карточки первыми», «Память ряда»): новые —
    // появившиеся за NEW_DAYS — первыми по убыванию времени появления, остальные за ними в порядке
    // коллекции. batch — build() collectPages; rowMemory — запись ряда в памяти или undefined.
    // Возвращает { results, memory, fresh }: memory — новая запись ряда, undefined — ряд не
    // запоминается (первый запуск с неполным рядом); fresh — новые сейчас карточки ряда без тайтла t.
    function orderByNovelty(batch, rowMemory, now) {
      if (!rowMemory && batch.gaps) return { results: batch.results, memory: undefined, fresh: [] };
      var nowMs = now.getTime();
      var today = Math.floor(nowMs / DAY_MS);
      var memory = {};
      for (var id in rowMemory) {
        var old = rowMemory[id];
        if (today - old.l <= FORGET_DAYS) memory[id] = Object.assign({}, old, { s: old.s == null ? null : old.s });
      }
      batch.results.forEach(function (card) {
        var season = card.id in batch.seasons ? batch.seasons[card.id] : null;
        var entry = memory[card.id];
        if (!entry) {
          memory[card.id] = { f: rowMemory ? nowMs : 0, s: season, l: today };
          return;
        }
        if (season !== null && (entry.s === null || season > entry.s)) {
          if (entry.s !== null) entry.f = nowMs;
          entry.s = season;
        }
        entry.l = today;
      });
      var order = batch.results.map(function (card, i) {
        var f = memory[card.id].f;
        return { card: card, i: i, f: f > 0 && nowMs - f < NEW_DAYS * DAY_MS ? f : 0 };
      });
      order.sort(function (a, b) { return b.f - a.f || a.i - b.i; });
      var fresh = order.filter(function (o) { return o.f && !memory[o.card.id].t; }).map(function (o) { return o.card; });
      return { results: order.map(function (o) { return o.card; }), memory: memory, fresh: fresh };
    }

    // Ряды NOW_WATCHING первой порции Главной: 1-я страница коллекции, как ряд kp_source, затем только
    // новинки, новые карточки первыми. Ответы ждёт pending того waiter, что отдаёт порцию. Возвращает
    // build() — ряды и save() — запись памяти рядов, если сборка её изменила, и поиск TMDB-тайтлов новых
    // карточек без t: каждый ответ пишется в память сам, Главную он не держит.
    function filterRows(pending) {
      var now = new Date();
      var rule = noveltyRule(now);
      var seen = readSeen();
      var changed = false;
      var fresh = [];
      var rows = NOW_WATCHING.map(function (spec) {
        var slot = { reason: 'timeout' };
        var remembered = function (card) { return !!(seen[spec.url] && seen[spec.url][card.id]); };
        fetchPage(spec.url, 1, pending, function (json) {
          json.title = spec.name;
          slot.original = json;
          slot.batch = collectPages(spec, 1, Math.min(BATCH, json.total_pages || 1), json, rule, pending, remembered);
        }, function () {
          slot.reason = 'failed';
        });
        return slot;
      });
      function ordered(spec, original, batch) {
        var next = orderByNovelty(batch, seen[spec.url], now);
        if (next.memory && JSON.stringify(next.memory) !== JSON.stringify(seen[spec.url])) {
          seen[spec.url] = next.memory;
          changed = true;
        }
        next.fresh.forEach(function (card) { fresh.push({ url: spec.url, card: card }); });
        return filteredRow(spec, original, { results: next.results, gaps: batch.gaps });
      }
      return {
        build: function () {
          var out = [];
          rows.forEach(function (slot, i) {
            var spec = NOW_WATCHING[i];
            if (!slot.original) return console.warn('kp-reactions-fix: now watching row not loaded', spec.name, 'page 1 ' + slot.reason);
            var row = ordered(spec, slot.original, slot.batch());
            if (row) out.push(row);
          });
          if (rows.every(function (slot) { return !slot.original; })) {
            rowsFailed('page 1 not loaded: ' + NOW_WATCHING.map(function (spec, i) { return spec.name + ' ' + rows[i].reason; }).join(', '));
          }
          return out;
        },
        save: function () {
          if (changed) Lampa.Storage.set(SEEN_KEY, seen);
          fresh.forEach(function (item) {
            resolveTitle(item.card, function (title) {
              if (!title) return;
              editSeen(function (mem) {
                var entry = mem[item.url] && mem[item.url][item.card.id];
                if (!entry) return false;
                entry.t = titleKey(title);
                return true;
              });
            });
          });
        }
      };
    }

    function recsFailed(reason) {
      console.error('kp-reactions-fix: recommendation rows not built', reason);
      Lampa.Noty.show('Ряды рекомендаций не построены: ' + reason);
    }

    // Ряд рекомендаций ядра типа media по образцу его ряда recomend_watch (spec
    // kp-main-recommendations): «Ещё» — штатный экран recomend. Рекомендаций нет — ряда нет.
    function recsRow(media, title) {
      var all = Lampa.Recomends.get(media);
      if (!all.length) {
        console.warn('kp-reactions-fix: no recommendations', media);
        return null;
      }
      var pages = Math.ceil(all.length / REC_PAGE);
      return {
        results: Lampa.Arrays.shuffle(all).slice(0, REC_ROW_LIMIT),
        title: title,
        total_pages: pages,
        page: 1,
        params: { emit: { onlyMore: function () { Lampa.Router.call('recomend', { media: media, total_pages: pages }); } } }
      };
    }

    function addRecs(out) {
      var rows = [recsRow('movie', 'Рекомендуем посмотреть фильмы'), recsRow('tv', 'Рекомендуем посмотреть сериалы')].filter(Boolean);
      if (historyWaiting) {
        console.warn('kp-reactions-fix: recommendations: KP history not resolved before main');
        rows.forEach(function (row) { row.title += INCOMPLETE; });
      }
      out.push.apply(out, rows);
    }

    // Ряды подгрузки с url (spec kp-main-new-release-rows, «Запрос ряда»): окно — годы новинки, id
    // жанра — по названию из списка KP.menu (design.md, решение 3). genres — этот список, null — его
    // нет; failed — причина, по которой его нет.
    function newRows(genres, failed) {
      var ids = {};
      (genres || []).forEach(function (g) { if (g && g.title) ids[g.title] = g.id; });
      var found = NEW_ROWS.some(function (spec) { return spec.genre && ids[spec.genre] !== undefined; });
      if (!failed && !found) failed = 'KP.menu: no genres of new release rows';
      if (failed) rowsFailed(failed);
      var year = noveltyRule(new Date()).minYear;
      return NEW_ROWS.filter(function (spec) {
        if (!spec.genre) return true;
        if (failed) return false;
        if (ids[spec.genre] !== undefined) return true;
        console.warn('kp-reactions-fix: new release row dropped, no genre', spec.title, spec.genre);
        return false;
      }).map(function (spec) {
        var url = 'api/v2.2/films?order=NUM_VOTE&type=' + spec.type + '&yearFrom=' + year + '&yearTo=' + (year + 1);
        return { title: spec.title, url: spec.genre ? url + '&genres=' + ids[spec.genre] : url };
      });
    }

    // Порция подгрузки Главной (design.md, решение 4): следующие PORTION рядов queue разом; отдаёт их,
    // когда пришли все ответы, но не позже ROWS_TIMEOUT_MS, в порядке очереди, без карточек shown
    // (решение 5). Пустая порция — сразу следующая; очередь кончилась — reject.
    function loadRows(queue, shown, resolve, reject) {
      if (!queue.length) return reject();
      var specs = queue.splice(0, PORTION);
      var answers = specs.map(function () { return 'timeout'; });
      var wait = waiter(function () {
        var out = [];
        specs.forEach(function (spec, i) {
          var json = answers[i];
          if (typeof json === 'string') return console.warn('kp-reactions-fix: new release row not loaded', spec.title, json);
          json.title = spec.title;
          json.results = (json.results || []).filter(function (card) {
            if (shown[card.id]) return false;
            shown[card.id] = true;
            return true;
          });
          if (json.results.length) out.push(json);
        });
        if (out.length) resolve(out);
        else loadRows(queue, shown, resolve, reject);
      }, ROWS_TIMEOUT_MS);
      specs.forEach(function (spec, i) {
        fetchPage(spec.url, 1, wait.pending, function (json) {
          answers[i] = json;
        }, function () {
          answers[i] = 'failed';
        });
      });
      wait.start();
    }

    // Короткая первая порция (spec kp-main-new-release-rows): дописывается порциями подгрузки.
    function fill(out, next, done) {
      if (out.length >= MIN_FIRST) return done(out);
      next(function (more) { fill(out.concat(more), next, done); }, function () { done(out); });
    }

    // Первая порция Главной (design.md, решение 1): ряды NOW_WATCHING и рекомендации. Уходит, когда
    // собраны ряды, пришёл список жанров KP.menu и закончен проход по KP-истории (рекомендации без её
    // тайтлов), но не позже ROWS_TIMEOUT_MS. done(out, queue) — ряды и очередь рядов подгрузки; карточки
    // рядов NOW_WATCHING — в shown. Память рядов пишется после done: её сбой не задерживает Главную.
    function mainPortion(shown, done) {
      var rows;
      var genres = null;
      var menuMissing = missingFns(['Api.sources.KP.menu']);
      var wait = waiter(function () {
        var out = rows.build();
        out.forEach(function (row) { row.results.forEach(function (card) { shown[card.id] = true; }); });
        if (recsReady) addRecs(out);
        done(out, newRows(genres, menuMissing || (genres ? '' : 'KP.menu: no answer')));
        rows.save();
      }, ROWS_TIMEOUT_MS);
      rows = filterRows(wait.pending);
      if (!menuMissing) {
        KP.menu({}, wait.pending()(function (list) { genres = Array.isArray(list) ? list : []; }));
      }
      if (recsReady && historyWaiting) historyWaiting.push(wait.pending()(function () {}));
      wait.start();
    }

    // «Ещё» у ряда NOW_WATCHING: category_full зовёт KP.list с url ряда и page 1, 2, … Остальные
    // списки идут в kp_source как есть.
    var orgList = KP.list;
    var srcPages = {}; // url коллекции → число её страниц, из её ответов
    KP.list = function (params, oncomplite, onerror) {
      var spec = NOW_WATCHING.filter(function (s) { return params && s.url === params.url; })[0];
      if (!spec) return orgList.apply(KP, arguments);
      listBatch(spec, params, oncomplite, onerror);
    };

    // Отдельные списки фильмов и сериалов (design.md kp-split-recommendations, решение 1): ядро
    // держит общий recomends_list на 100, и сериалы вытесняют из него фильмы.
    var REC_KEYS = { movie: 'kp_recs_movie', tv: 'kp_recs_tv' };
    function readRecs(key) {
      var list = Lampa.Storage.get(key, '[]');
      if (Array.isArray(list) && list.every(function (e) { return isObject(e) && e.id != null; })) return list;
      console.warn('kp-reactions-fix: recommendations: bad ' + key, String(JSON.stringify(list)).slice(0, 200));
      return [];
    }
    var recLists = { movie: readRecs(REC_KEYS.movie), tv: readRecs(REC_KEYS.tv) };
    var idsKey = function (list) { return list.map(function (e) { return e.id; }).join(','); };

    // Тайтлы записи ядра встают в конец списка своего типа в её порядке; пишется изменившийся список.
    function mergeRecs(coreList) {
      var before = { movie: idsKey(recLists.movie), tv: idsKey(recLists.tv) };
      coreList.forEach(function (card) {
        var type = isTv(card) ? 'tv' : 'movie';
        recLists[type] = recLists[type].filter(function (e) { return e.id != card.id; });
        recLists[type].push(card);
      });
      Object.keys(REC_KEYS).forEach(function (type) {
        recLists[type] = recLists[type].slice(-REC_TYPE_LIMIT);
        if (idsKey(recLists[type]) === before[type]) return;
        Lampa.Storage.set(REC_KEYS[type], recLists[type], false, function (e) {
          console.warn('kp-reactions-fix: recommendations: ' + REC_KEYS[type] + ' not saved', e && e.name);
        });
      });
    }
    mergeRecs(Lampa.Storage.get('recomends_list', '[]'));
    Lampa.Storage.listener.follow('change', function (e) {
      if (e.name === 'recomends_list') mergeRecs(e.value);
    });

    // Найденные TMDB-тайтлы KP-истории (applyRecs) — просмотренное вдобавок к истории tmdb/cub.
    var kpWatched = {};
    // Замена Recomends.get ядра над списком типа (решение 2): id и тип, а не только id, как у ядра.
    function recsGet(type) {
      var seen = {};
      Lampa.Favorite.get({ type: 'history' }).forEach(function (h) {
        if (isCoreSource(h)) seen[recKey(h.id, isTv(h))] = true;
      });
      var tv = type == 'tv';
      return recLists[tv ? 'tv' : 'movie'].slice().reverse().filter(function (e) {
        var key = recKey(e.id, tv);
        return !seen[key] && !kpWatched[key];
      });
    }
    recsGet.__kp_split = true; // только для живой проверки tests/live/main-recs.sh
    // Копия page ядра над recsGet: её зовёт экран «Ещё».
    function recsPage(object, call, empty) {
      var all = recsGet(object.media);
      var page = object.page || 1;
      var result = all.slice((page - 1) * REC_PAGE, page * REC_PAGE);
      if (!result.length) return empty({ status: 404 });
      call({ results: result, title: Lampa.Lang.translate('title_recomend_watch'), total_pages: Math.ceil(all.length / REC_PAGE), page: page });
    }

    if (typeof KP.main === 'function') {
      var active = Lampa.Activity.active();
      if (active && active.component === 'main' && active.source === 'KP') rowsFailed('main screen built before patch');
      var recsMissing = missingFns(['Recomends.get', 'Recomends.page', 'Router.call', 'Arrays.shuffle']);
      var recsReady = !recsMissing;
      if (!recsReady) recsFailed(recsMissing);
      else {
        Lampa.Recomends.get = recsGet;
        Lampa.Recomends.page = recsPage;
      }
      // Главную строит плагин, KP.main kp_source не зовётся (spec kp-main-new-release-rows). Набор id
      // показанных карточек — на одно открытие Главной.
      KP.main = function (params, oncomplite, onerror) {
        var shown = {};
        var queue = [];
        var next = function (resolve, reject) { loadRows(queue, shown, resolve, reject); };
        mainPortion(shown, function (out, rows) {
          queue = rows;
          fill(out, next, function (all) {
            if (all.length) oncomplite(all);
            else onerror();
          });
        });
        return next;
      };
    }

    // KP-история в ряду «Рекомендуем посмотреть» (spec kp-history-recommendations). Ядро ставит в
    // очередь recomends_scan только историю cub/tmdb и отсеивает просмотренное сравнением id с
    // историей, где у KP-тайтла id «KP_<n>». Найденные TMDB-тайтлы KP-истории встают в начало
    // очереди, а из recomends_list убираются.
    function isTv(card) {
      return !!(card.number_of_seasons || card.first_air_date);
    }

    // Тайтл очереди и списка — id и тип. Признак сериала в очереди ядра — число сезонов, search()
    // проверяет только истинность.
    function recKey(id, tv) {
      return id + ':' + (tv ? 'tv' : 'movie');
    }

    function queueKeys(queue) {
      var keys = {};
      queue.forEach(function (e) { keys[recKey(e.id, e.tv)] = true; });
      return keys;
    }

    // Убирает из списка рекомендаций на месте тайтлы watched; возвращает число убранных.
    function cleanRecs(list, watched) {
      var removed = 0;
      for (var i = list.length - 1; i >= 0; i--) {
        if (watched[recKey(list[i].id, isTv(list[i]))]) {
          list.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }

    // Чистка списка после каждой его записи ядром; на первой записи очереди ядром — проверка, что
    // вставленное в ней осталось (решение 5). Зовётся после своих записей: первая запись здесь — ядра.
    function followRecs(watched, keys) {
      var checked = false;
      Lampa.Storage.listener.follow('change', function (e) {
        if (e.name === 'recomends_list') cleanRecs(e.value, watched);
        else if (e.name === 'recomends_scan' && !checked) {
          checked = true;
          var inQueue = queueKeys(e.value);
          var kept = keys.every(function (k) { return inQueue[k]; });
          if (!kept) console.warn('kp-reactions-fix: recommendations: core rewrote recomends_scan without KP history titles');
        }
      });
    }

    // Массив очереди — тот же объект, что держит и пишет на каждом тике ядро (design.md, решение 2),
    // поэтому вставка правится на месте.
    function applyRecs(found) {
      var queue = Lampa.Storage.get('recomends_scan', '[]');
      var inQueue = queueKeys(queue);
      var watched = {};
      var missing = [];
      found.forEach(function (rec) {
        var key = recKey(rec.id, rec.tv);
        if (watched[key]) return;
        watched[key] = true;
        if (!inQueue[key]) missing.push(rec);
      });
      if (missing.length) {
        queue.unshift.apply(queue, missing);
        Lampa.Storage.set('recomends_scan', queue);
      }

      var list = Lampa.Storage.get('recomends_list', '[]');
      if (cleanRecs(list, watched)) Lampa.Storage.set('recomends_list', list);
      kpWatched = watched;
      var keys = Object.keys(watched);
      followRecs(watched, keys);
      KP.__history_recs = keys.slice(); // только для живой проверки tests/live/kp-history-recs.sh
    }

    // Конца прохода ждут первые порции Главной, открытые во время прохода; null — проход закончен.
    var historyWaiting = [];
    function historyFinished() {
      var waiting = historyWaiting;
      historyWaiting = null;
      waiting.forEach(function (fn) { fn(); });
    }

    // KP-записи ищутся по одной (не залпом поверх рядов Главной), весь проход — не дольше
    // RECS_TIMEOUT_MS: недошедшие считаются ненайденными. Один раз за запуск.
    var recsStarted = false;
    function historyRecs() {
      if (recsStarted) return;
      recsStarted = true;
      var kp = Lampa.Favorite.get({ type: 'history' }).filter(function (e) { return e.source === 'KP'; });
      if (!kp.length) return historyFinished();
      var found = [];
      var wait = waiter(function () {
        var unresolved = kp.length - found.length;
        if (unresolved) console.warn('kp-reactions-fix: recommendations: ' + unresolved + ' of ' + kp.length + ' KP history titles unresolved');
        if (found.length) applyRecs(found);
        historyFinished();
      }, RECS_TIMEOUT_MS);
      (function next(i) {
        if (i >= kp.length) return;
        // У записи истории нет type, а resolveTitle берёт тип поиска из него.
        var card = Object.assign({}, kp[i], { type: isTv(kp[i]) ? 'tv' : 'movie' });
        resolveTitle(card, wait.pending()(function (title) {
          if (title) found.push({ id: title.id, tv: title.method === 'tv' });
          next(i + 1);
        }));
      })(0);
      wait.start();
    }

    if (window.appready) historyRecs();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') historyRecs(); });

    KP.__reactions_patched = true;
  }

  // ---- Метка сезона на карточках сериалов (spec card-season-badge) ----

  var SEASON_UNKNOWN = { text: 'S ?', kind: 'unknown' };
  // Итог метки за сессию по source + ':' + id карточки: { text, kind }, null — метки нет, массив —
  // запрос идёт, в нём колбэки ждущих карточек (design.md season-complete-badge, решение 5).
  var seasonMemo = {};

  function seasonLabel(last) {
    if (!last) return null;
    var complete = last.total > 0 && last.episode >= last.total && !last.more;
    if (complete) return { text: 'S' + last.number + ' ✓', kind: 'done' };
    var count = last.total > 0 ? last.episode + '/' + last.total : last.episode;
    return { text: 'S' + last.number + ' ' + count, kind: 'airing' };
  }

  // Итог метки карточки в cb. Тайтл KP — поиском, tmdb/cub — id карточки. Тайтл не найден, найден не
  // сериалом или запрос не удался — серая метка (решение 7).
  function seasonOf(data, cb) {
    function withTitle(title) {
      if (!title || title.method !== 'tv') return cb(SEASON_UNKNOWN);
      lastSeason(title, function (last, error) {
        cb(error ? SEASON_UNKNOWN : seasonLabel(last));
      });
    }
    if (data.source === 'KP') resolveTitle(data, withTitle);
    else withTitle({ method: 'tv', id: data.id });
  }

  // Сериал по правилу источника: у KP — isTvCard, у tmdb/cub — original_name, как в TimeTable.update ядра.
  // Не isTv из patch(): тот читает записи истории (number_of_seasons/first_air_date), а не карточки.
  function isSeries(data) {
    if (data.source === 'KP') return isTvCard(data);
    return isCoreSource(data) && !!data.original_name;
  }

  function drawSeason(card, label) {
    if (!label) return;
    var view = card.html && card.html.querySelector('.card__view');
    if (!view) return console.warn('kp-reactions-fix: season badge: no .card__view', card.data.id);
    var el = document.createElement('div');
    el.className = 'card__season card__season--' + label.kind;
    el.textContent = label.text;
    view.appendChild(el);
  }

  function seasonVisible(card) {
    if (card.__kp_season) return;
    card.__kp_season = true;
    var data = card.data || {};
    if (!isSeries(data)) return;
    var key = data.source + ':' + data.id;
    var memo = seasonMemo[key];
    var draw = function (label) { drawSeason(card, label); };
    if (Array.isArray(memo)) return memo.push(draw);
    if (key in seasonMemo) return draw(memo);
    seasonMemo[key] = [draw];
    seasonOf(data, function (label) {
      var waiting = seasonMemo[key];
      seasonMemo[key] = label;
      waiting.forEach(function (fn) { fn(label); });
    });
  }

  // Правый верхний угол: слева вверху метка TV ядра, внизу — оценка, закладки и torrent-quality-badge.
  function injectSeasonStyle() {
    if (document.getElementById('kp-season-badge-style')) return;
    var style = document.createElement('style');
    style.id = 'kp-season-badge-style';
    style.textContent =
      '.card__season{position:absolute;right:.4em;top:.4em;z-index:1;padding:.2em .5em;' +
      'border-radius:.3em;font-size:.8em;font-weight:600;line-height:1.2;color:#fff;}' +
      '.card__season--airing{background:rgba(201,138,0,.9);}' +
      '.card__season--done{background:rgba(46,158,68,.9);}' +
      '.card__season--unknown{background:rgba(110,110,110,.85);}';
    document.head.appendChild(style);
  }

  // Модуль Card ядра общий для всех карточек всех экранов, onVisible — карточка стала видимой
  // (решение 2). Нет хука — Noty и console.error, остальное работает.
  function seasonFailed(reason) {
    console.error('kp-reactions-fix: season badge not installed', reason);
    Lampa.Noty.show('Метка сезона на карточках не работает: ' + reason);
  }

  function patchSeasonBadge() {
    var missing = missingFns(['Maker.map']);
    if (missing) return seasonFailed(missing);
    var Card = (Lampa.Maker.map('Card') || {}).Card;
    if (!Card || typeof Card.onVisible !== 'function') return seasonFailed('no Card.onVisible');
    if (Card.__kp_season) return;
    var orgVisible = Card.onVisible;
    Card.onVisible = function () {
      var result = orgVisible.apply(this, arguments);
      seasonVisible(this);
      return result;
    };
    Card.__kp_season = true;
    injectSeasonStyle();
  }

  // ---- Закладки: одна карточка тайтла из разных источников (spec favorites-across-sources) ----

  // Ядро сравнивает закладки по id карточки, а у KP он «KP_<n>», у tmdb/cub — число TMDB: ключ тайтла
  // — непустой imdb_id. Копия marks ядра: взаимоисключающие метки.
  var MARKS = ['look', 'viewed', 'scheduled', 'continued', 'thrown'];
  var FAVORITE_FNS = ['Favorite.check', 'Favorite.toggle', 'Favorite.remove', 'Account.Bookmarks.get'];

  // Записи одного imdb_id — одна, на месте первой: tmdb/cub, если есть в группе, иначе первая (design.md
  // favorites-dedup-across-sources, решение 2: часть читателей ядра берёт только tmdb/cub).
  function oneCardPerImdb(list) {
    var slot = {};
    var out = [];
    list.forEach(function (card) {
      var imdb = card && card.imdb_id;
      if (!imdb) out.push(card);
      else if (!(imdb in slot)) {
        slot[imdb] = out.length;
        out.push(card);
      } else if (!isCoreSource(out[slot[imdb]]) && isCoreSource(card)) out[slot[imdb]] = card;
    });
    return out;
  }

  function favoritesFailed(reason) {
    console.error('kp-reactions-fix: favorites not merged across sources', reason);
    Lampa.Noty.show('Закладки из разных источников не сведены: ' + reason);
  }

  // Схлопывание только при чтении: записи аккаунта CUB не меняются. Без синхронизации ядро читает
  // локальное хранилище, а не CUB — обёртки отдают вызов ядру как есть (решение 6).
  function patchFavorites() {
    var missing = missingFns(FAVORITE_FNS);
    if (missing) return favoritesFailed(missing);
    var Favorite = Lampa.Favorite;
    var Bookmarks = Lampa.Account.Bookmarks;
    if (Favorite.__kp_merged) return;
    var orgGet = Bookmarks.get;
    var orgCheck = Favorite.check;
    var orgToggle = Favorite.toggle;
    var warned = false;

    // Permit.sync — живой геттер: решение при каждом вызове.
    function synced() {
      if (Lampa.Account.Permit && Lampa.Account.Permit.sync) return true;
      if (!warned) {
        warned = true;
        console.warn('kp-reactions-fix: favorites: no CUB sync, titles from different sources not merged');
      }
      return false;
    }

    function sameTitle(type, imdb) {
      return orgGet.call(Bookmarks, { type: type }).filter(function (r) { return r.imdb_id === imdb; });
    }

    // check зовётся на каждую отрисованную карточку: до первого совпадения, без массива.
    function hasTitle(type, imdb) {
      return orgGet.call(Bookmarks, { type: type }).some(function (r) { return r.imdb_id === imdb; });
    }

    Bookmarks.get = function () {
      var list = orgGet.apply(this, arguments);
      return synced() ? oneCardPerImdb(list) : list;
    };

    // Тип, где своей записи нет, но есть запись того же imdb_id, получает метку (решение 3): ядро кладёт
    // проигранную карточку в history, так что «своя запись где-то есть» пару не исключает.
    Favorite.check = function (card) {
      var result = orgCheck.apply(this, arguments);
      var imdb = card && card.imdb_id;
      if (!imdb || !synced()) return result;
      Object.keys(result).forEach(function (type) {
        if (type === 'any' || result[type]) return;
        if (hasTitle(type, imdb)) result[type] = result.any = true;
      });
      return result;
    };

    // Есть записи тайтла в where — ядро снимает первую, остальные снимает плагин (снятие асинхронно,
    // и исходный get ещё отдаёт снятую). Нет — метку ставят записи, которая держит другую метку тайтла:
    // ядро снимет прежнюю метку только с переданной карточки.
    Favorite.toggle = function (where, card) {
      var imdb = card && card.imdb_id;
      if (!imdb || !synced()) return orgToggle.apply(this, arguments);
      var same = sameTitle(where, imdb);
      if (same.length) {
        var added = orgToggle.call(this, where, same[0]);
        same.slice(1).forEach(function (r) { Favorite.remove(where, r); });
        return added;
      }
      if (MARKS.indexOf(where) !== -1) {
        for (var i = 0; i < MARKS.length; i++) {
          var marked = MARKS[i] !== where && sameTitle(MARKS[i], imdb)[0];
          if (marked) return orgToggle.call(this, where, marked);
        }
      }
      return orgToggle.apply(this, arguments);
    };

    Favorite.__kp_merged = true;
  }

  // lampa_settings.dcma всегда false: ядро пишет список после сетевого ответа, до или после
  // старта плагина, поэтому сеттер, а не разовая запись. Переопределить нельзя — defineProperty
  // бросает TypeError.
  function disableDmca() {
    try {
      if (!window.lampa_settings) throw new Error('no window.lampa_settings');
      Object.defineProperty(window.lampa_settings, 'dcma', {
        get: function () { return false; },
        set: function () {},
        configurable: true,
        enumerable: true,
      });
    } catch (e) {
      var reason = e && e.message ? e.message : String(e);
      console.error('kp-reactions-fix: DMCA block not disabled', reason);
      Lampa.Noty.show('DMCA-блокировка не отключена: ' + reason);
    }
  }

  // Ядро читает флаг один раз, в startApp сразу после записи app_time_launch: при позднем старте
  // плагина список уже загружен.
  function disableKinopoisk() {
    try {
      if (!window.lampa_settings || !window.lampa_settings.disable_features) {
        throw new Error('no window.lampa_settings.disable_features');
      }
      window.lampa_settings.disable_features.kinopoisk = true;
      if (window.app_time_launch) throw new Error('app already started');
    } catch (e) {
      var reason = e && e.message ? e.message : String(e);
      console.error('kp-reactions-fix: Kinopoisk list not disabled', reason);
      Lampa.Noty.show('Кнопка «Смотреть на Кинопоиске» не отключена: ' + reason);
    }
  }

  function startPlugin() {
    disableDmca();
    disableKinopoisk();
    patchFavorites();
    cub = Lampa.Api.sources.cub;
    tmdb = Lampa.Api.sources.tmdb;
    Lampa.Listener.follow('full', onFull);
    patchSourceCards();
    patchSeasonBadge();
    if (Lampa.Api.sources.KP) return patch();

    // kp_source грузится отдельным тегом script — порядок завершения между
    // плагинами не гарантирован, поэтому ждём появления источника вместо
    // патча на старте.
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (Lampa.Api.sources.KP || tries > 50) {
        clearInterval(timer);
        patch();
      }
    }, 200);
  }

  if (window.Lampa && window.Lampa.Api) startPlugin();
  else Lampa.Listener.follow('app', function (e) {
    if (e.type == 'ready') startPlugin();
  });
})();
