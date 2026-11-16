## MODIFIED Requirements

### Requirement: Поиск трейлера по названию
Сервис SHALL отвечать на `GET /trailer` с параметрами `title` (обязателен), `original_title`,
`year` и `season` (необязательны) JSON-объектом с полями `video_id`, `title`, `confidence` и
`reason`. Ролик SHALL выбираться библиотекой `trailer-search`. Если подходящего ролика нет, ответ
SHALL быть HTTP 200 с `video_id: null` и причиной в `reason`. С `season` подходит только ролик этого
сезона. Если библиотека взамен выбрала ролик другого сезона, ответ SHALL быть HTTP 200 с
`video_id: null`, а `reason` MUST сохранять причину библиотеки. Сервис SHALL слушать только
`127.0.0.1`. Каждый ответ MUST нести `Access-Control-Allow-Origin: *`, чтобы его читала страница Lampa.

#### Scenario: Ответ читает страница Lampa
- **WHEN** запрос пришёл с заголовком `Origin: http://lampa.mx`
- **THEN** ответ (200, 400, 404 или 502) несёт `Access-Control-Allow-Origin: *`

#### Scenario: Ролик найден
- **WHEN** приходит `GET /trailer?title=Зверь&original_title=The Beast&year=2026`, и поиск выбрал ролик
- **THEN** ответ HTTP 200, `video_id` и `title` этого ролика, `confidence` и `reason` выбора

#### Scenario: Ролик не найден
- **WHEN** поиск прошёл, но ни один ролик не подошёл
- **THEN** ответ HTTP 200, `video_id: null`, в `reason` причина

#### Scenario: Нет названия
- **WHEN** приходит запрос без `title` или с `year`, который не число
- **THEN** ответ HTTP 400 с описанием ошибки, поиска нет

#### Scenario: Трейлер сезона найден
- **WHEN** приходит `GET /trailer?title=Джентльмены&original_title=The Gentlemen&year=2024&season=2`, и поиск выбрал ролик 2-го сезона
- **THEN** поиск идёт с сезоном 2, ответ HTTP 200 с `video_id` и `title` этого ролика

#### Scenario: Трейлера сезона нет
- **WHEN** запрос пришёл с `season=2`, а поиск отдал ролик другого сезона взамен
- **THEN** ответ HTTP 200, `video_id: null`, в `reason` причина библиотеки с пометкой о замене

#### Scenario: Неверный сезон
- **WHEN** приходит запрос с `season`, который не целое число от 1
- **THEN** ответ HTTP 400 с описанием ошибки, поиска нет

### Requirement: Кэш ответов
Успешный ответ (с роликом или с `video_id: null`) SHALL кэшироваться в памяти на 24 часа по
`title`, `original_title`, `year` и `season`. Ошибка поиска SHALL NOT кэшироваться.

#### Scenario: Повторный запрос
- **WHEN** тот же запрос приходит повторно в течение 24 часов после успешного ответа
- **THEN** ответ совпадает с первым, поиска на YouTube нет

#### Scenario: Кэш истёк
- **WHEN** тот же запрос приходит позже чем через 24 часа
- **THEN** поиск на YouTube идёт заново

#### Scenario: Повтор после ошибки
- **WHEN** первый запрос получил HTTP 502, и тот же запрос приходит снова
- **THEN** поиск на YouTube идёт заново

#### Scenario: Другой сезон
- **WHEN** после успешного ответа на запрос без `season` приходит запрос с тем же названием и годом и `season=2`
- **THEN** поиск на YouTube идёт заново, с сезоном 2
