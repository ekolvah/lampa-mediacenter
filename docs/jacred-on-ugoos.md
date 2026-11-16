# Свой JacRed и сервис трейлеров на приставке (Debian chroot)

Lampa ищет торренты через парсер. По умолчанию это чужой публичный `jac.red` —
он работает, пока запросов немного, но отбивает нагрузку: замер на устройстве —
из 48 запросов подряд прошло 18, остальные получили отказ в соединении за ~160 мс
при таймауте 15 с. Поэтому парсер поднят свой, на самой приставке.

Jackett для этой роли не подходит: у него нет своей базы, он опрашивает трекеры
вживую (секунды на запрос), и массовый опрос просто перенёс бы проблему на
трекеры. JacRed держит собственную файловую БД и отвечает локально — это тот же
движок, который стоит за `jac.red`.

## Что развёрнуто

Всё лежит внутри одного каталога `/data/debian` на приставке.

| Что | Где | Версия / детали |
| --- | --- | --- |
| rootfs | `/data/debian` | Debian 13.6 armhf, образ linuxcontainers.org, 389 МБ |
| .NET | `/opt/dotnet` (внутри chroot) | ASP.NET Core Runtime 10.0.11 `linux-arm` |
| JacRed | `/opt/jacred` (внутри chroot) | 3.7.2, ассет `jacred-linux-arm.zip` (self-contained, 104 МБ) |
| База | `/opt/jacred/Data` | 4.8 ГБ, `fdb` из 256 шардов + `masterDb.bz`, ~1.25 млн ключей |
| Конфиг | `/opt/jacred/init.conf` | читается из корня приложения, **не** из `Data/init.conf` |
| HTTP | `http://127.0.0.1:9117` | `listenip: any`, `opensync: false` |
| Python | `/usr/bin/python3` (внутри chroot) | 3.13 из Debian 13 (`python3`, `python3-venv`, `git`) |
| Сервис трейлеров | `/opt/trailer-search` (внутри chroot) | `trailer_service.py` + venv по [../tools/trailer-search.requirements.txt](../tools/trailer-search.requirements.txt) |
| HTTP трейлеров | `http://127.0.0.1:9118/trailer` | только loopback |

Про конфиг стоит запомнить: в дистрибутиве лежит `Data/init.conf`, и выглядит он
как рабочий файл настроек, но приложение его не читает — это шаблон. Без файла в
корне JacRed молча работает на встроенных умолчаниях, а они отличаются от
шаблона (например, `opensync` там `true`). Что реально применилось, видно в
`run.log` первой же строкой после баннера: `config (start) from init.conf
applied` против `config (default) applied`.

Lampa настроена на этот адрес: `jackett_url` = `http://127.0.0.1:9117`
(`Lampa.Storage`, синхронизируется с CUB-аккаунтом — менять только через
приложение или [../tools/README.md](../tools/README.md) `cdp.py`, не правкой файлов).
Смешанного контента нет: страница Lampa открыта по `http://lampa.mx`.

Краулинг трекеров намеренно НЕ включён: cron-задачи из `Data/crontab` не
установлены, приставка сама трекеры не опрашивает. `opensync: false` — наружу
`/sync/*` не отдаём. Как база пополняется — раздел «Откуда берутся новые
торренты».

## Сервис трейлеров

Плагин `kp-reactions-fix` ([lampa-config-review.md](lampa-config-review.md)) просит у него
русский трейлер KP-карточки, когда у TMDB нет видео на `ru`, а у сериала с последним вышедшим
сезоном N ≥ 2 — всегда, трейлер сезона N:

```bash
# внутри chroot: в самом Android curl нет
curl 'http://127.0.0.1:9118/trailer?title=Зверь&original_title=The%20Beast&year=2026'
# {"video_id": "…", "title": "…", "confidence": …, "reason": "…"}; не нашёл — "video_id": null
curl 'http://127.0.0.1:9118/trailer?title=Джентльмены&original_title=The%20Gentlemen&year=2024&season=2'
# year — год 1-го сезона; ролика 2-го сезона нет — "video_id": null, reason "…; season 2 fallback"
```

Поиск на YouTube делает библиотека `ekolvah/trailer-search` (yt-dlp). С `season` библиотека
при отсутствии ролика сезона берёт ролик другого сезона и пишет об этом в `reason`; сервис такой
ролик не отдаёт (`video_id: null`, WARNING в логе). Ответы, включая
«не нашёл», кэшируются в памяти на 24 ч (ключ — название, год и сезон); ошибка YouTube не
кэшируется — `502` и ERROR в `/opt/trailer-search/run.log`. Без `title`, с нечисловым `year` или
`season` не от 1 — `400`. Каждый ответ несёт
`Access-Control-Allow-Origin: *`: страница Lampa открыта с origin `http://lampa.mx`, и без
заголовка WebView отдаёт ей статус 0 вместо ответа.

Время открытия карточки «Зверь» (`KP.full`, замер 2026-11-16): промах кэша сервиса — ~2,8 с
(сам поиск ~2–2,5 с, первый после загрузки ~6 с), попадание в кэш — ~0,1 с. Плагин ждёт
сервис не дольше 10 с, библиотека — не дольше 8 с.

Обновить yt-dlp (YouTube регулярно ломает старые версии): поднять пин в
`tools/trailer-search.requirements.txt` через PR, затем на приставке:

```bash
adb push tools/trailer-search.requirements.txt /data/debian/opt/trailer-search/requirements.txt
adb shell '/system/bin/sh /data/local/tmp/chroot-debian.sh -c "TMPDIR=/tmp /opt/trailer-search/venv/bin/pip install -r /opt/trailer-search/requirements.txt"'
```

и перезапустить сервис (раздел «Запуск»).

## Запуск

После загрузки приставки оба сервиса поднимаются сами: `/system/su.d/99chroot`
(SuperSU выполняет этот каталог при загрузке) запускает внутри chroot каждый
`/root/start.d/*.sh`. Никаких действий с ноутбука не требуется; новый сервис — новый
файл в `start.d/`, без правки `/system`.

Поднять вручную (например, после ручной остановки):

```bash
adb shell '/system/bin/sh /data/local/tmp/chroot-debian.sh /root/start.d/jacred.sh'
adb shell '/system/bin/sh /data/local/tmp/chroot-debian.sh /root/start.d/trailer-search.sh'
```

Команды на приставке идут после `adb root` (`adb shell id` → `uid=0`). Запуск идемпотентен
(`start-stop-daemon`, pid-файл `<каталог сервиса>/<имя>.pid`): живой процесс —
`already running pid=…`, код 0; упал на старте — хвост `run.log`, код 1.

Перезапуск сервиса трейлеров (например, после обновления `trailer_service.py`):

```bash
adb shell '/system/bin/sh /data/local/tmp/chroot-debian.sh -c "start-stop-daemon --stop --retry 5 --pidfile /opt/trailer-search/trailer-search.pid --exec /opt/trailer-search/venv/bin/python --remove-pidfile; bash /root/start.d/trailer-search.sh"'
```

JacRed после `pkill JacRed` завершается ~20 с: дождаться, пока `pidof JacRed` опустеет, и
только потом запускать `start.d/jacred.sh`.

### Если после перезагрузки поиск не работает

Смотреть сюда, в порядке убывания вероятности:

```bash
adb shell cat /data/local/tmp/chroot-boot.log   # что сделал boot-хук: «<имя> rc=<код>: <вывод>»
adb logcat -d -s su.d chroot-boot               # выполнил ли SuperSU хук вообще
adb shell pidof JacRed                          # жив ли процесс
```

Хук пишет в оба места на каждом шаге и не молчит при отказе: если
`/data/local/tmp/chroot-debian.sh` или `/data/debian/root/start.d` не появились за пять
минут после загрузки, в лог уходит `GIVING UP` с причиной. Сбой одного сервиса не мешает
остальным: у каждого своя строка `rc=`.

## Скрипты

Лежат в [../tools/](../tools/) и раскладываются на устройство так (после `adb root`):

```bash
adb push tools/chroot-debian.sh   /data/local/tmp/chroot-debian.sh
adb push tools/chroot-boot.sh     /data/local/tmp/chroot-boot.sh
adb push tools/chroot-start.sh    /data/debian/root/chroot-start.sh
adb shell mkdir -p /data/debian/root/start.d
adb push tools/start.d/jacred.sh tools/start.d/trailer-search.sh /data/debian/root/start.d/
adb push tools/trailer_service.py /data/debian/opt/trailer-search/trailer_service.py
adb shell chmod 755 /data/local/tmp/chroot-debian.sh
# автозапуск: единственная запись в /system
adb shell 'mount -o rw,remount / &&
           mkdir -p /system/su.d &&
           cp /data/local/tmp/chroot-boot.sh /system/su.d/99chroot &&
           chmod 0700 /system/su.d /system/su.d/99chroot;
           mount -o ro,remount /'
```

`chroot-start.sh` и `start.d/` лежат внутри chroot (`/data/debian/root/`), потому что
андроидные каталоги в chroot не смонтированы: `/data/local/tmp` изнутри не виден,
и путь скрипта надо давать в системе координат chroot'а (`/root/…`).

venv сервиса трейлеров (один раз; `git` нужен pip для зависимости `git+https`):

```bash
adb shell '/system/bin/sh /data/local/tmp/chroot-debian.sh -c "export TMPDIR=/tmp; apt-get install -y --no-install-recommends python3 python3-venv git ca-certificates && python3 -m venv /opt/trailer-search/venv"'
```

затем `pip install` из раздела «Сервис трейлеров».

`chroot-debian.sh` — универсальный вход в chroot:

```bash
adb shell '/system/bin/sh /data/local/tmp/chroot-debian.sh -c "dotnet --info"'
```

## Откуда берутся новые торренты

JacRed отвечает только из своей базы — в отличие от Jackett он не идёт на трекеры
в момент запроса. Значит база должна пополняться сама, иначе поиск в Lampa
постепенно перестанет находить свежие релизы.

**Штатный механизм — синхронизация с `sync.jacred.stream`,** раз в сутки:

```json
"syncapi": "https://sync.jacred.stream",
"timeSync": 1440,
```

`timeSync` — минуты. Проход начинается сразу при старте, а не по истечении
интервала, и идёт пачками примерно по 2000 раздач, пока в ответе `nextread=True`;
курсор сохраняется в `lastsync.txt`, поэтому перезапуск продолжает с того же
места, а не с начала. Кредов трекеров и FlareSolverr для этого не нужно.

Скорость — примерно час исходного времени за минуту работы (пачка ~2000 раздач
за 3–6 с продвигает курсор минут на 45). Суточный проход добирает сутки за
минуту; заметно это только на первом догоне после переливки дампа, где отставание
измеряется неделями.

Не путать с `opensync` — это про обратное направление: отдавать наши
`/sync/torrents`, `/sync/fdb`, `/sync/conf` наружу. У нас `false`.

Курсор — `Data/temp/lastsync.txt`, одно число: 100-наносекундные интервалы от
1601-01-01 (`DateTime.ToFileTimeUtc`, а не тики .NET от года 1). Пересчёт:

```python
from datetime import datetime, timezone
ticks = int((datetime(2026, 8, 1, tzinfo=timezone.utc).timestamp() + 11644473600) * 10**7)
```

Это может понадобиться после переливки дампа: в дампе курсор приезжает свой, и
он может оказаться сильно старее самих данных — тогда первый проход часами
перезаписывает то, что и так есть. Лечится остановкой JacRed, записью в
`lastsync.txt` даты чуть раньше сборки дампа и запуском. Проверять обязательно:
если ошибиться с эпохой, курсор уедет в будущее и синхронизация замолчит
навсегда — в `run.log` не будет строк `sync: [N]`.

**Свой краулинг трекеров не включён и на этой приставке невозможен.** Готовые
задания в `Data/crontab` (`/cron/rutracker/parse` и прочие) требуют FlareSolverr
на `127.0.0.1:8191` для трекеров за Cloudflare — это headless Chrome, для armv7
с 2 ГБ ОЗУ его нет. Плюс логины к трекерам и постоянная нагрузка на них.

**Полная переливка дампа** — редкая ручная операция, если база разъехалась или
нужно начать с нуля:

```bash
# внутри chroot, /opt/jacred
curl -A "Mozilla/5.0" -o db.archive https://sync.jacred.stream/latest.tar.zst.zip
zstd -d db.archive -c | tar -xf - -C Data
rm db.archive        # 1.3 ГБ, на приставке места немного
```

Два подвоха, оба стоили времени: Cloudflare отдаёт файл только с браузерным
User-Agent (на дефолтный UA `curl` — `403`), и под расширением `.zip` лежит сырой
`.tar.zst`, поэтому распаковка через `zstd`, а не `unzip`. Архив — 1.3 ГБ,
на диске разворачивается в 4.8 ГБ; после старта индекс перестраивается за ~4 с.

Проверить, что синхронизация идёт:

```bash
adb shell su -c 'grep -c "^sync:" /data/debian/opt/jacred/run.log'
adb shell su -c 'grep "^sync:" /data/debian/opt/jacred/run.log | tail -5'
```

В строках вида `sync: [12] time=… (2026-02-04 12:03:28) | 1995 torrents,
nextread=True` дата — это докуда база догналась.

Синхронизация пишет в лог файловой БД примерно 33 МБ в минуту, поэтому в конфиге
он ограничен: `logFdbMaxSizeMb: 32`, `logFdbMaxFiles: 2`. Без ограничения
(`0` — так в шаблоне) первый же долгий проход съедает гигабайты на eMMC.

## Откат

Только сервис трейлеров: остановить его (команда `--stop` из «Запуск»), удалить
`/data/debian/root/start.d/trailer-search.sh` и `/data/debian/opt/trailer-search`. Плагин
без сервиса работает как раньше: TMDB-видео и `console.warn`, что русского трейлера нет.

Всю установку:

```bash
adb shell 'rm -rf /data/debian'
adb shell 'mount -o rw,remount / && rm -rf /system/su.d && mount -o ro,remount /'
```

Первая команда убирает саму установку, вторая — автозапуск. Отдельно вернуть в
Lampa прежний адрес парсера (`jackett_url` → `Jac.red`) — через приложение или
`cdp.py`.

Про `/system`: это единственное, что установка пишет за пределами
`/data/debian`, — один каталог с одним скриптом внутри, ничего существующего не
изменяется. Сделано осознанно, ради автозапуска: без него после каждой
перезагрузки поиск торрентов молча переставал работать. Точка входа выбрана не
наугад — `strings /system/xbin/su` на устройстве содержит
`for i in $(ls /system/su.d/); do log -p i -t su.d Running /system/su.d/$i; ...`,
то есть SuperSU 2.82 выполняет этот каталог сам. `init.d` на прошивке нет,
systemless-режима SuperSU (`/su`) — тоже.

## Ограничения платформы

Ядро приставки — `4.9.113 armv7l`, `zygote32`, `/system/lib64` отсутствует:
только 32-битные armhf-сборки. .NET 10 на arm32 поддерживается, но лишь на
Y2038-совместимом glibc — отсюда именно Debian 13, а не более старый.
Официальный установщик JacRed (`jacred.sh`) эту архитектуру не ставит, его
`detect_arch` знает только amd64 и arm64, поэтому ассет разворачивался вручную.

В chroot протекает андроидный `TMPDIR=/data/local/tmp`, которого там нет (на нём падает
postinst `ca-certificates`), поэтому `start.d/*.sh` и команды выше задают `TMPDIR=/tmp`.

Внутри chroot понадобился `/etc/apt/apt.conf.d/99android` с
`APT::Sandbox::User "root";`: apt сбрасывает привилегии на пользователя `_apt`, а
Android не даёт сокет процессам без группы `inet` (3003) — без этого apt падает
с «Could not resolve».

Chroot выбран вместо proot/Termux потому, что на приставке есть root, `/data`
смонтирован без `noexec`, а `busybox`, `tar` и `chroot` есть в самой системе —
прослойка не нужна.
