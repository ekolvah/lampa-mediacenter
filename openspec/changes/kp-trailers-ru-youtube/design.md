## Context

Плагин `plugins/kp-reactions-fix.js` подставляет в `KP.full()` видео TMDB (`kp-card-trailers`) и
после #47 находит тайтл и без `imdb_id`. Русский трейлер, которого нет в TMDB, находится только
поиском по YouTube. kinozal_scraper уже умеет выбирать русский трейлер из выдачи YouTube
(`HeuristicStrategy`). Наблюдения, на которые опираются решения, — proposal.md, **Why**.

## Goals / Non-Goals

**Goals:** в KP-карточке есть русский трейлер с YouTube, когда в TMDB его нет. Выбор ролика —
та же реализация, что в kinozal_scraper. Ошибка поиска видна, а не выглядит как «трейлера нет».

**Non-Goals:** правило поиска тайтла в TMDB, общее с `tmdb_trailer.py` (отдельный issue). Улучшение
эвристики (ошибка на «Лес») — в репозитории библиотеки. Карточки из источника `tmdb`: плагин
патчит только `KP.full()`.

## Зависимости

1. **#47 `kp-trailers-by-title` смержен** (2026-11-07, в `main`). Без него у «Зверя» (KP 5512124, без `imdb_id`) тайтл в
   TMDB не находится. Живая проверка дописывается в его шаг `open-card-no-imdb.js`.
2. **`ekolvah/trailer-search` с тегом `v0.1.0`** — выпущен, ekolvah/trailer-search#1 закрыт 2026-11-15;
   контракт ниже сверен с тегом (README, `__init__.py`, `ytdlp.py`). Этот change опирается только на него:

   ```python
   from trailer_search import FilmProfile, TrailerPick, TrailerRetrievalError, find_trailer
   from trailer_search.ytdlp import YtDlpRetriever

   pick: TrailerPick = find_trailer(FilmProfile(ru_title, original_title, year),
                                    YtDlpRetriever(socket_timeout=4, deadline_s=8))
   # TrailerPick(video_id: str | None, title: str | None, confidence: float, reason: str)
   # TrailerRetrievalError — ни один запрос к YouTube не удался до deadline_s
   ```

   Что этому change нужно от `YtDlpRetriever` и есть в `v0.1.0`: плоская выдача
   (`extract_flat: in_playlist`), запросы по русскому и оригинальному названию в пуле из двух
   потоков, `retries: 0`, общий срок `deadline_s` (по умолчанию 10 с): ветки, не успевшие к
   сроку, отбрасываются без ожидания.
3. **kinozal_scraper переходит на `trailer-search`** — ekolvah/kinozal_scraper#647. Ни этому PR, ни
   закрытию #48 он не нужен: #48 касается только Lampa (решение пользователя 2026-11-07).

## Decisions

### 1. Поиск — сервис на приставке, yt-dlp

Решение пользователя 2026-11-07, альтернативы — proposal.md, `## Standard approach`. Ключа нет
ни на клиенте, ни на приставке, квоты нет. Data API на приставке — запасной путь на случай, если
YouTube начнёт блокировать домашний IP (ретривер есть в библиотеке, переключение — отдельный change).

### 2. HTTP — stdlib `ThreadingHTTPServer` на `127.0.0.1:9118`

Проблема: плагину в WebView нужен HTTP-адрес, а библиотека — Python. Стандарт —
`http.server` (https://docs.python.org/3/library/http.server.html). Документация пишет, что он
«not recommended for production» из-за отсутствия защиты. Здесь один клиент на loopback, так что
это не мешает. Flask или FastAPI — лишняя зависимость на armhf без выигрыша (§VII). Порт свободен,
CORS-заголовки не нужны (оба наблюдения — proposal).

### 3. Внешний поиск за Protocol (§II)

`tools/trailer_service.py` объявляет свои типы: запрос `TrailerQuery`, ответ `TrailerAnswer`
(`video_id`, `title`, `confidence`, `reason`), ошибку `SearchFailed`. От них зависят
`TrailerFinder` (`Protocol`: `TrailerQuery → TrailerAnswer`, бросает `SearchFailed`) и часы
(`Callable[[], float]`). Библиотека импортируется только внутри `main()` и передаётся в
`library_finder(find, profile_cls, error_cls)` — адаптер, который строит профиль, переводит ответ в
`TrailerAnswer`, а `error_cls` в `SearchFailed`. Модуль и тесты загружаются без `trailer-search` и
yt-dlp, `requirements-dev.txt` не меняется. Тесты поднимают настоящий сервер на эфемерном порту с
двойником и подставными часами; адаптер проверяется отдельно двойниками функции и классов
(`test_library_adapter_*`). Совпадение имён с настоящей библиотекой проверяет живой `curl` в
задаче 4.2.

### 4. Кэш — словарь в памяти, 24 часа

Ключ — тройка запроса. `video_id: null` тоже кэшируется: иначе каждое открытие карточки без
русского трейлера ждало бы поиск. Срок 24 часа, а не неделя, как кэш TMDB в Lampa: у премьер
русский трейлер появляется через дни после английского. Ошибка не кэшируется (§III). Перезапуск
сбрасывает кэш. Файловый кэш — лишний код.

### 5. Контракт ошибок: 200/null ≠ 502

`SearchFailed` (адаптер решения 3 переводит в него `TrailerRetrievalError`) → 502 `{error, detail}` и `logging.error` с названием и годом (§IV).
Прочие исключения не перехватываются: `socketserver` печатает стек в stderr (`run.log`), соединение
рвётся, и плагин пишет такое же предупреждение, как на 502.

### 6. Плагин: когда спрашивать и куда ставить ролик

Сервис спрашивается, только если среди `videos.results` нет видео с `iso_639_1 === 'ru'` (включая
пустой список). Тайтлы с русским видео в TMDB его не трогают, в том числе «Лес», на котором
эвристика ошибается. Параметры — `movie.title`, `movie.original_title` и год карточки, как в #47.
Запрос — `new Lampa.Reguest()` с `timeout(10000)` и `silent(...)`: тот же класс, которым Lampa
ходит в JacRed на loopback. Наблюдение 2026-11-16 (`cdp.py`): успех приходит в колбэк уже
разобранным объектом, ошибка — jqXHR со `status` (0 при отказе соединения), `statusText` и
`responseJSON`. Ролик вставляется первым в `result.videos.results` в форме видео TMDB
(`{site: 'YouTube', key, name, iso_639_1: 'ru', type: 'Trailer', published_at}`), и движок играет
его тем же путём. Ролик добавляется, а не заменяет: неверный выбор виден как лишний пункт,
английский трейлер не теряется.

Порядок в списке задаёт движок, не плагин. Наблюдение 2026-11-16, `app.min.js` (`view--trailer`):
пункты сортируются по `published_at`, затем идут видео с `iso_639_1` = `Storage.field('tmdb_lang')`
(на приставке `ru`), разделитель «Ещё» и видео на `en`; другие языки не показываются. Ролик
сервиса — единственный на `ru` (сервис спрашивается только без них), поэтому стоит первым.
`published_at` — дата релиза карточки (`release_date`/`first_air_date`, решение пользователя
2026-11-16): даты ролика нет ни в плоской выдаче yt-dlp, ни в `TrailerPick`, а без неё подзаголовок
пункта — «NaN undefined NaN» (`Lampa.Utils.parseTime(undefined).full`).

### 7. Открытие карточки ждёт сервис, не дольше 10 секунд

Видео плагин отдаёт движку одним способом — полем объекта, который `enrich` передаёт в
`oncomplite` после всех запросов (`plugins/kp-reactions-fix.js:41`). Дополнять карточку после
`oncomplite` плагин не умеет; это была бы новая механика (правка построенного DOM), вне scope.
Поэтому промах кэша задерживает открытие: на ПК поиск занял 1–2 с (proposal), на armv7 дольше.
Сервис передаёт библиотеке `deadline_s=8`, а не её 10 с по умолчанию: иначе при зависшем YouTube
плагин бросит запрос по своему таймауту раньше, чем сервис ответит 502 с ERROR в логе (решение 5).
Время поиска на приставке меряется до кода (задача 0.2), открытие карточки — после (задача 4.3).
Если поиск стабильно дольше 10 с, работа останавливается до кода и дизайн пересматривается, а не
поднимается таймаут. Альтернатива — спрашивать сервис всегда, параллельно с `videos`. Она убирает
задержку, но шлёт поиск в YouTube для каждой карточки.

### 8. Один запускатель на `start-stop-daemon` и один boot-хук для сервисов chroot

Проблема: второй сервис в chroot. Копия `jacred-start.sh` дала бы два расходящихся экземпляра
одной логики, а `pidof` по имени Python-процесс не найдёт. Второй вызов внутри `jacred-boot.sh`
записал бы сбой сервиса трейлеров как сбой JacRed. systemd в chroot на Android нет: нет init
(`docs/jacred-on-ugoos.md`, «Запуск»). Стандарт Debian для запуска демона без init —
`start-stop-daemon` (https://manpages.debian.org/trixie/dpkg/start-stop-daemon.8.en.html) из
пакета `dpkg`, который в любой Debian-системе есть (Essential: yes,
https://packages.debian.org/trixie/dpkg). Он даёт pid-файл (`--make-pidfile`), фон
(`--background`), лог (`--output`), идемпотентный старт (`--oknodo`) и проверку, что pid из файла —
это именно наш процесс (`--exec`: сравнение с `/proc/<pid>/exe`). Поэтому:

- `tools/chroot-start.sh <name> <workdir> <exec> [args…]` вместо `jacred-start.sh` — тонкая
  обёртка: `start-stop-daemon --status` → `already running`, код 0; иначе `--start --background
  --make-pidfile --pidfile <workdir>/<name>.pid --chdir <workdir> --output run.log --exec <exec>`,
  через 3 с снова `--status`, при неудаче хвост `run.log` и код 1. Окружение (`DOTNET_ROOT`,
  `PATH`, `TMPDIR=/tmp`) задаёт вызывающий: андроидный `TMPDIR=/data/local/tmp` протекает в
  chroot, где этого каталога нет (наблюдение 2026-11-16, задача 0.2).
- `tools/start.d/jacred.sh` и `tools/start.d/trailer-search.sh` — окружение сервиса и
  `exec /root/chroot-start.sh …`. На приставке лежат в `/data/debian/root/start.d/`.
- `tools/chroot-boot.sh` вместо `jacred-boot.sh`, в `/system/su.d/99chroot` вместо `99jacred`.
  Тот же цикл ожидания chroot в фоне (хук возвращает управление сразу, `tools/README.md`,
  `jacred-boot.sh`), затем каждый `start.d/*.sh` и строка `<name> rc=…` в
  `/data/local/tmp/chroot-boot.log` (тег logcat `chroot-boot`). Код выхода фоновой части никто не
  читает: сбой виден только строкой `rc=` с ненулевым кодом, её и проверяет задача 4.2. Новый
  сервис — новый файл в `start.d/`, без правки `/system`.

Что меняется по сравнению с `pidof`, и что ловит:

- **pid-файл пережил перезагрузку или падение** (лежит на `/data`), и pid занят чужим процессом —
  `--exec` не совпадёт, сервис поднимется. Тест `test_stale_pidfile_starts`.
- **pid-файл указывает на живой процесс того же бинаря, но не наш** — для JacRed бинарь один
  (`/opt/jacred/JacRed`); для `python3.13` в chroot другого долгоживущего Python нет. Остаточный
  риск: сервис числится живым; ловит `curl` после перезагрузки (задача 4.2).
- **Процесс упал на старте** — `--status` через 3 с не 0, хвост `run.log`, код 1, в логе хука
  `rc=1`. Тест `test_failed_start_tails_log`.
- **Уже работает** — `already running`, код 0. Тест `test_already_running`.

Тесты `tests/test_chroot_start.py` гоняют обёртку настоящим `start-stop-daemon` с `sleep` и
`sh -c 'exit 1'` вместо сервиса во временном каталоге. На CI он есть (`ubuntu-latest`, quality.yml
агент-процесса); на Windows-машине без него тесты пропускаются с причиной в выводе pytest. При заданной `CI` его отсутствие — не skip, а падение с причиной: иначе гейт зеленел бы, не проверив обёртку.

Переход: JacRed сейчас работает без pid-файла. Перед первым запуском нового скрипта его нужно
остановить (`pkill JacRed`), иначе поднимется второй экземпляр на занятый порт 9117.

### 9. Зависимости на приставке — пины + pip-audit

`tools/trailer-search.requirements.txt`: `trailer-search[ytdlp] @ git+https://github.com/ekolvah/trailer-search@v0.1.0`
(как в README библиотеки) и `yt-dlp==<версия>` (extra требует только `>=2026.10.26`). Ставятся в venv `/opt/trailer-search/venv` (`python3`, `python3-venv` из
Debian 13: 3.13, https://packages.debian.org/trixie/python3). Проблема: пины без аудита устаревают
незаметно, а yt-dlp — сетевой парсер, который обновляется часто. Стандарт — тот же `pip-audit`, что
уже стоит в `.pre-commit-config.yaml` для `requirements.txt`, отдельным хуком на этот файл.

## Risks / Trade-offs

- **YouTube считает домашний IP ботом.** Сервис отвечает 502, плагин оставляет видео TMDB и пишет
  предупреждение. Первое действие — обновить пин yt-dlp. Если не помогло — решение 1.
- **Неверный выбор ролика** («Лес» → «Ведьмин лес», 0.9) — смягчено решением 6, исправляется в
  библиотеке.
- **В chroot нет Python, время поиска на armv7 не известно.** Наблюдение 2026-11-07: `adb root` →
  `uid=0` (`docs/device-ugoos-am6.md`, п. 5; `su -c` через ADB при этом молча отказывает); в chroot
  `python3: command not found`, `dpkg -l python3` → `un`; `/usr/sbin/start-stop-daemon` 1.22.22 есть.
  Установка Python и замер поиска — задача 0.2, до кода.
- **Переход boot-хука трогает работающий JacRed.** Снапшот перед правкой и проверка поиска
  торрентов после перезагрузки (задача 4.2).

## Migration / Rollback

Порядок: сервис на приставке (задачи 0.2, 4.1–4.2) раньше плагина. Плагин без сервиса работоспособен: на карточках без
русского видео в консоли будет ошибка соединения, трейлеры TMDB на месте.

Откат плагина — revert его коммита, поведение как после #47. Откат приставки: убить процесс по
pid-файлу, `rm -rf /data/debian/opt/trailer-search /data/debian/root/start.d/trailer-search.sh`. Для
полного отката хука вернуть `99jacred` и `jacred-start.sh` из снапшота задачи 0.2 и удалить `99chroot`.
