## Context

Плагин `kp-reactions-fix.js` спрашивает сервис `tools/trailer_service.py` (127.0.0.1:9118) о
русском трейлере по названию, году и сезону. Тип карточки плагин уже вычисляет
(`plugins/kp-reactions-fix.js:265`), но в запрос не кладёт; сервис зовёт `FilmProfile` без
`series`. Причина и воспроизведение — proposal.md, **Why**.

## Standard approach

Свой код здесь — только проброс параметра; отбор по типу делает библиотека, как она и
предлагает:

- README `trailer-search` v0.3.0
  (https://github.com/ekolvah/trailer-search/blob/v0.3.0/README.md): «Pass `series=True` for a
  series or `series=False` for a film: a film rejects trailers marked as a series (`сезон`,
  `сериал`, `series`), a series prefers them; omitted, the type is unknown.»
- `src/trailer_search/strategy.py` v0.3.0, `FilmProfile.__post_init__`:
  `if self.series is False: raise ValueError(f"season {self.season} contradicts series=False")`,
  затем `self.series = True` при заданном `season`.
- Живая проверка библиотеки (ekolvah/trailer-search#17, записана в issue #102): «Огонь»,
  `series=True` → `GQBB6DznFvc` «Огонь (2026) — сериал НТВ»; «Хартленд», `series=False` →
  `xY_08xAt4wI`, трейлер фильма.

## Goals / Non-Goals

**Goals:** тип карточки доходит от плагина до `FilmProfile`; неверный тип виден как 400.

**Non-Goals:** сверка года ролика (ekolvah/trailer-search#16, вторая половина — дело библиотеки);
определение типа KP-карточки иначе, чем сейчас.

## Decisions

1. **Параметр `series=1|0`.** Имя и смысл совпадают с полем библиотеки — без промежуточного
   словаря. Альтернатива `type=movie|tv` (словарь Lampa) отвергнута: лишнее отображение в
   сервисе.
2. **Плагин шлёт `series` всегда.** `ruTrailer` уже получает `tv` (из `title.method` у найденного
   тайтла, из `movie.type` без него — тот же признак выбирает поле года). Параметр ставится
   последним: `…&year=…[&season=N]&series=0|1`. Новой точки вычисления типа нет.
3. **Сервис: без `series` — `None`.** Прежние запросы (`curl` из доков, плагин старого sha в
   промежутке выкатки) работают как раньше. Разбор — существующий `_int_param` с новым
   необязательным `maximum`: `_int_param(params, "series", 0, maximum=1)`, затем `bool`. Другое
   значение — 400 с `series` в `detail`; при заданном `maximum` текст ошибки называет и верхнюю
   границу.
4. **Противоречивый профиль — 400 из адаптера, правило не копируется.** `season` с `series=0`
   библиотека отвергает `ValueError` в конструкторе `FilmProfile` (Standard approach). `LibraryFinder`
   переводит `ValueError` конструктора профиля в `BadRequest`, а `do_GET` ловит `BadRequest` и
   вокруг `cached.find` → 400. Так любая будущая проверка профиля в библиотеке даёт 400, а не
   исключение из обработчика и обрыв соединения без ответа (§IV). `BadRequest` — исключение,
   поэтому в кэш не попадает. Альтернатива — та же проверка в `parse_query` — отвергнута: правило
   жило бы в двух местах, и другая ошибка конструктора всё равно вылетала бы из обработчика.
5. **Тип — поле `TrailerQuery`.** Кэш ключуется самим `TrailerQuery`, поэтому тип попадает в
   ключ без отдельного кода, а тест кэша проверяет это для `season` и `series`; в лог ошибки 502 добавляется `series`. Запрос `season=N` без
   `series` и с `series=1` — разные ключи при одном поиске библиотеки; плагин всегда шлёт
   `series`, так что двойной поиск возможен только от ручного `curl` — нормализацию не вводим.
6. **Живая проверка повторяет запрос плагина.** `askService` в `tests/live/kp-trailers/lib.js`
   строит URL так же, как `ruTrailer`, иначе сравнение «первый ролик = ответ сервиса» сравнивает
   разные запросы (с типом и без — разные ключи кэша и разный отбор).

## Risks / Trade-offs

- Тип KP-карточки неверен (KP отдаёт `type` не тот) → библиотека отсеет верный трейлер. Тот же
  признак уже выбирает год карточки, ошибка в нём ломала бы и год; отдельной защиты не вводим.
- Для фильма библиотека отсеивает ролики с меткой сериала: фильм, у которого есть лишь ролики
  с «сериал» в названии, останется без русского трейлера (`video_id: null` и `console.warn`) —
  это лучше чужого ролика.

## Migration Plan

1. Снапшот по `docs/snapshots-convention.md`.
2. На приставке: `pip show trailer-search` в venv показывает 0.3.0 (пин #103); `adb push
   tools/trailer_service.py` в `/data/debian/opt/trailer-search/`, перезапуск сервиса командой из
   `docs/jacred-on-ugoos.md`. Старый плагин шлёт запросы без `series` — сервис отвечает как раньше.
3. `curl` на приставке: «Огонь» с `series=1` отдаёт не `CAVdJB1qj9E`.
4. Пин `kp-reactions-fix.js` на sha ветки, `bash tests/live/kp-trailers.sh` → `OK`.

Откат: прежний `trailer_service.py` из снапшота и перезапуск; пин плагина на прежний sha.
Порядок отката любой: старый сервис игнорирует неизвестный `series` (`parse_query` читает только
свои параметры).
