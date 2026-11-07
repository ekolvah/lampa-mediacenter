## Context

`plugins/torrent-quality-badge.js` получает карточки только из `Lampa.Listener` `line`
(`onLineEvent` → `enqueue` → `applyVerdict(line, item, miss)`), промахи ряда снимаются
одним проходом в микрозадаче (`flushMisses` → `removeMisses` → `removeItem`, design #39).

Сетка `category_full` в Lampa 3.4.6 — `src/components/category/full.js` в
[lampa-source](https://github.com/yumata/lampa-source): `Utils.createInstance(Category,
object, {module: … 'Pagination'})`, класс — `src/interaction/items/category/` (`Emit` с
модулями `Items`, `Create`, `Next`, `Pagination`, …):

- `Items.onBuild` за раз рисует всю первую страницу (`createAndAppend` → `emit('append',
  item, element)`); `Items.onAppend` кладёт карточку в `items` и в
  `pages[ceil(added/60)].items`; `Items.onPageView` вынимает из DOM невидимые «страницы»
  по `pages`.
- `Items.onScroll` подаёт из очереди `loaded` один кусок и ставит
  `Navigator.setCollection(items ± 36)` + `Navigator.focused(last)`.
- `Next.onLoadNext` (его зовёт `scroll.onEnd`) грузит следующую страницу, только если
  `items.length > 0`, `next_wait` не стоит и с `builded_time` прошло больше 1000 мс; ответ
  режется на куски по `limit_view` (6) в `loaded`, а если к его приходу `items` пуст —
  выбрасывается.
- `Activity.create` шлёт `Listener 'activity'` `init` после конструктора компонента и до
  `create()` (там `Api.list`); `object.activity.component` — сам компонент. Выбор
  страницы (`Pagination` → `activity.refresh` → `Activity.replace` → `push`) снова
  проходит `create`, то есть снова `init`.
- «Ещё» раздела Избранного (`bookmarks.js`) открывает `Router 'favorite'` — компонент
  `favorite`, тоже на классе `Category`.

## Standard approach

- Подключение к компоненту — штатные `Lampa.Listener.follow('activity')` (событие
  `init`, `src/interaction/activity/activity.js`, `create()`) и `Emit.use(module)`
  (`src/utils/emit.js`): тем же `use` сама Lampa собирает `category_full`
  (`comp.use({onCreate, onNext, onInstance})`).
- Прочие плагины, которым нужна сетка, ловят `activity` и сканируют DOM `.card` по
  таймерам (`setTimeout` 300/1000 мс):
  [imjamoe1 lable_color.serial.js](https://github.com/imjamoe1/imjamoe1.github.io/blob/main/lable_color.serial.js)
  (поиск `gh search code "category_full" "Listener.follow('activity'"`, 15 результатов;
  `Maker.map('Category')` — 0). У DOM-узла нет `items`/`pages`/`last`, так что снятие
  ломало бы навигатор и `onPageView`. Готового плагина, скрывающего карточки сетки без
  раздач, нет (поиск #39 и этот).
- Догрузка — собственный путь сетки: `emit('scroll')` и `emit('loadNext')`. Фокус —
  `Controller.collectionSet`/`collectionFocus(last, scroll.render(true))`, как `base.js`
  (`toggle`) сетки и `removeMisses` рядов.
- Тесты — как в #39: учёт полей и чистые функции — `node --test` на объектах-дублях
  (`fullLine()`), фокус и навигатор — живая проверка на приставке.

## Наблюдения на устройстве (2026-11-07, `cdp.py` + `ui.py`, источник KP, 1280×720 CSS)

- «Ещё» ряда «Сейчас смотрят фильмы» (`hover:enter` на `.card-more`) открыл
  `category_full` (`api/v2.2/films/collections?type=TOP_POPULAR_MOVIES`): 20 карточек,
  `.card--quality-miss` — 0, событий `line` — 0.
- Слушатель `activity` + `comp.use({onAppend})` на `init` `category_full`: события
  `init`, `create`, `start` (у всех есть `object.activity.component`), `onAppend` — 20 раз
  до первого кадра, `build` — `20/35` (results/total_pages). `params.items`: `cols 6`,
  `limit_view 6`, `limit_collection 36`. В видимой области — 12 карточек (2 строки).
- Снятие карточки под фокусом (из `items`, из `pages[*].items`, `item.destroy()`, `last`
  → следующая, `active`, `emit('scroll')`, `collectionFocus(last, html)`): `items 20 →
  19`, фокус на следующей («Обитель зла»), `last === .focus`. Затем настоящие
  `DPAD_RIGHT, DPAD_DOWN, DPAD_LEFT` → фокус на «Клэйфейс», `active 6`, `ctrl: content`.
- Массовое снятие (22 из 25, фокус на снимаемой): фокус на последней оставшейся,
  `emit('scroll')` подал кусок из `loaded`, `items 9`.
- Снятие половины первой страницы прямо на `build` (микрозадача) и `emit('loadNext')`:
  `page 1 → 1`, `next_wait` не встал, возраст сборки 35 мс. Через 6 с сетка так и стоит:
  `items 10`, видно 10, `page 1`. Повторный `emit('loadNext')` позже: `page 2`, `items
  16`, видно 12, в `loaded` 3 куска.

## Decisions

1. **Точка входа** — `Lampa.Listener.follow('activity')`: на `init` с `component ===
   'category_full'` плагин подключает к `e.object.activity.component` модуль с
   `onAppend(item)`. Карточки копятся и в одной микрозадаче уходят в существующий
   `onLineEvent({line: grid, items})` — те же `filterActive`, `reproducible`,
   `alreadyProcessed`, `enqueue`, фильтр читается раз на пачку; `refill` (решение 5) в той
   же микрозадаче зовётся только при активном фильтре, так что с пустым фильтром плагин не
   догружает страниц. Только `category_full`: `favorite` и прочие сетки на `Category` не
   трогаются. Нет `use` у компонента — один `console.warn` (флаг `torrent_badge_warned`, как
   у рядов), сетка не обрабатывается (§IV). Обработчик `activity` экспортируется под Node и
   покрыт тестами: подключение только к `category_full`, пачка в одну микрозадачу,
   предупреждение без `use`.
2. **Вид владельца хранится на нём**: при подключении сетка получает
   `torrent_badge_kind = GRID`, ряд в `onLineEvent` — `LINE`, если вида ещё нет.
   `GRID`/`LINE` — адаптеры `{supported, detach, before, refill}`. `applyVerdict` проверяет
   `kind.supported(owner)` вместо `lineSupported` (иначе — серая метка и `console.warn`, как
   сейчас), `flushMisses` зовёт общий проход с этим адаптером. Угадывать вид по форме
   объекта при снятии не нужно. Владелец без вида (не прошёл ни `onLineEvent`, ни
   подключение сетки — например, прямой вызов `applyVerdict`) — та же деградация: серая
   метка и один `console.warn` по `torrent_badge_warned`, без исключения. Что перестаёт
   доказываться: проверка формы ряда теперь стоит на входе, а не на каждом вердикте; ряд,
   потерявший поля между событием `line` и вердиктом, ловит `kind.supported` в
   `applyVerdict` (вызывается на каждом вердикте, тест `applyVerdict without kind greys and
   warns once` и табличные тесты `supported`).
3. **Один проход снятия для рядов и сетки** — нынешние `removeMisses`/`removeItem`,
   параметризованные адаптером: `kind.before`, затем для каждой карточки `kind.detach(owner,
   item)` (ложь — не карточка: «Ещё», уже снятая) и общая часть `removeItem` (`items`,
   `last` через `focusTarget`, `destroy`), затем общий пересчёт `active` по `last`,
   `kind.refill` и общий блок фокуса (`Controller.own` → `collectionSet`, `collectionFocus`,
   если снята карточка под фокусом).
   - `LINE`: `before` — `emit('scroll')` (как сейчас), `detach` — из `data.results`,
     `refill` — `emit('scroll')`.
   - `GRID`: `detach` — из `pages[*].items` (иначе `onPageView` вернёт карточку в DOM),
     `before` — удержание (решение 4), `refill` — решение 5.

   Сейчас успешный проход по ряду не покрыт юнит-тестами (есть только `focusTarget`,
   `lineSupported` и откат `flushMisses`), поэтому до рефакторинга в Group 1 добавляются
   тесты прохода по ряду: они зелёные на текущем коде и ловят регрессию параметризации без
   приставки.
4. **Сетка не пустеет**: если проход снял бы все карточки сетки, последняя из снимаемых
   остаётся, сразу получает серую метку (`applyBadge`) и запоминается на сетке; первый
   `onAppend` после этого снова подаёт её в `applyVerdict(…, true)`, и следующий проход
   снимает её — сетка тогда уже не пуста. Страниц больше нет — она так и остаётся серой.
   Причина: `Next` выбрасывает ответ при пустом `items` (Context).
5. **Добор — идемпотентный `refill(grid)` по состоянию «не хватает»**, а не по событию
   «снят промах»: пока `gridShortage` — если в `loaded` есть кусок, `emit('scroll')`;
   иначе, если `object.page < total_pages` и автодогрузок меньше `GRID_AUTO_PAGES` (3) —
   `emit('loadNext')` и выход. Если `next_wait` не встал (защита 1000 мс), — один на сетку
   таймер на `builded_time + 1000 − now` (читает поле, не пишет) снова зовёт `refill`, если
   сетка ещё в документе. `refill` зовётся после каждого прохода снятия и в микрозадаче
   пачки `onAppend` (решение 1), так что пришедшая страница добирается и без промахов на
   ней. После `GRID_AUTO_PAGES` страниц догрузка — только штатная, прокруткой: это предел
   запросов к Jac.red для категории, где почти всё — промахи (требование «Сетка заполнена»,
   сценарий «Предел автодогрузки»; в #42 предела нет — значение 3 на решение пользователя).
6. **«Не хватает»** — чистая функция `gridShortage(count, active, cols)`: от начала строки
   с `active` до конца сетки меньше `cols × 2` карточек (2 строки видимой области,
   наблюдение выше; приставка одна, вьюпорт WebView фиксирован). `cols` —
   `params.items.cols`.
7. **Нагрузка на Jac.red**: первая страница приходит целиком — до 20 запросов на холодном
   кэше, по 2 параллельно, в порядке карточек. Автодогрузка нужна, только если из 20 скрыто
   больше 8, при доле промахов ≈19% (#39) — редко; предел — `GRID_AUTO_PAGES` × 20.
   Каждая страница, которую сетка грузит при прокрутке, — до 20 запросов. Кэш общий с
   рядами. Предзагрузку вердиктов не вводим.
8. **Живая проверка** — шаги в `tests/live/hide-cards.sh` после шага 5; `bash
   tests/live/hide-cards.sh grid` гоняет только рестарт и шаги сетки. Шаги `warm-cache`,
   `hide-focused`, `focus-in-row` берут владельца из `HC.owner()` (сетка, если активна
   `category_full`, иначе ряд под фокусом) и работают для обоих; новые файлы — только
   `grid-open.js`, `grid-refill.js`, `grid-hide-all.js`, `grid-favorite.js`. На сетке по
   «Ещё» первого ряда Главной (`hover:enter` на `.card-more` — тот же обработчик, что у
   пульта), против сборки ветки:
   6. `grid-open` + `warm-cache`: у сетки `torrent_badge_kind`; дождаться очереди — у
      каждой карточки сетки есть вердикт в кэше, ни у одной не `miss: true`.
   7. `hide-focused` → `ui.py DPAD_RIGHT,DPAD_LEFT --expect content` → `focus-in-row`.
   8. `grid-refill`: скрывать карточки, пока `gridShortage` не станет истинным; опрос раз в
      200 мс до 5 с: `object.page` вырос, `gridShortage` ложно, видно 12 карточек.
   9. `grid-hide-all` (сетка открыта заново): скрыть все; опрос до 5 с — пришла следующая
      страница, ни одна скрытая не в DOM, сетка не пуста, фокус на её карточке.
   10. `grid-favorite` (`favorite`, `type: 'book'`): у компонента нет `torrent_badge_kind`.

## Alternatives

- Правка общего модуля `Lampa.Maker.map('Category').Items` — отвергнута: задела бы
  `favorite` и все прочие сетки, подменяет код Lampa глобально.
- Перехват `Activity.push` — отвергнут: `init` покрывает и `Activity.replace`.
- Вид владельца по форме объекта в `flushMisses` — отвергнут: вызывающий уже знает вид, а
  две проверки формы расходились бы.
- Повтор `loadNext` ровно один раз по пропавшему `next_wait` — отвергнут: если пришедший
  кусок без промахов, добор вставал; `refill` по состоянию это закрывает.
- Сброс `builded_time`, чтобы обойти защиту, — отвергнут: запись чужого состояния.
- Отдельный признак «плагин подключён» на сетке — не нужен: его роль играет
  `torrent_badge_kind`.
- Число видимых строк по размерам DOM — отвергнуто: приставка одна, константа из
  наблюдения проще и проверяется шагом 8.
- Снятие из очереди задач ушедшей сетки — отложено: держит ли архивная активность DOM при
  возврате назад, не наблюдали, а пропуск задачи оставил бы карточку непроверенной.

## Risks

- `items`, `pages`, `last`, `active`, `loaded`, `next_wait`, `builded_time`,
  `total_pages`, события `scroll`/`loadNext` — не публичное API. Нет полей — серая метка и
  `console.warn` (решение 2); живая проверка ловит изменение до выкладки, но не после
  автообновления Lampa.
- На тёплом кэше при многих промахах первой страницы сетка до 1 с стоит неполной, затем
  догружается.
- На холодном кэше карточка появляется и через сотни мс исчезает, сетка перестраивается.
- Удержанная карточка (решение 4) видна серой до прихода следующей страницы.
- Уйдя из сетки, пользователь не отменяет её задачи в очереди: до 20 запросов страницы
  уходят, и ряды Главной ждут за ними (так же, как сейчас у рядов).

## Migration and rollback

Как в #39: плагин на приставке подключён по `@<sha>`; для живой проверки — sha головы
ветки со снапшотом, затем обратно sha из снапшота; после мержа — merge-коммит. Откат —
прежний `<sha>` из снапшота.
