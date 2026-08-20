# Свой JacRed на приставке (Debian chroot)

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

## Запуск

После загрузки приставки JacRed поднимается сам: скрипт лежит в
`/system/su.d/99jacred`, SuperSU выполняет содержимое этого каталога при
загрузке. Никаких действий с ноутбука не требуется.

Поднять вручную (например, после ручной остановки):

```bash
adb shell su -c '/system/bin/sh /data/local/tmp/chroot-debian.sh /root/jacred-start.sh'
```

Скрипт идемпотентен: если процесс уже жив, печатает `already running pid=…` и
выходит; если упал на старте — печатает хвост `run.log` и возвращает `1`.

### Если после перезагрузки поиск не работает

Смотреть сюда, в порядке убывания вероятности:

```bash
adb shell su -c 'cat /data/local/tmp/jacred-boot.log'   # что сделал boot-хук
adb logcat -d -s su.d jacred-boot                       # выполнил ли SuperSU хук вообще
adb shell su -c 'pidof JacRed'                          # жив ли процесс
```

Хук пишет в оба места на каждом шаге и не молчит при отказе: если
`/data/local/tmp/chroot-debian.sh` или `/data/debian` не появились за пять минут
после загрузки, в лог уходит `GIVING UP` с причиной.

## Скрипты

Все три лежат в [../tools/](../tools/) и раскладываются на устройство так:

```bash
adb push tools/chroot-debian.sh /data/local/tmp/chroot-debian.sh
adb push tools/jacred-start.sh  /data/local/tmp/jacred-start.sh
adb push tools/jacred-boot.sh   /data/local/tmp/jacred-boot.sh
adb shell su -c 'cp /data/local/tmp/jacred-start.sh /data/debian/root/ &&
                 chmod 755 /data/debian/root/jacred-start.sh /data/local/tmp/chroot-debian.sh'
# автозапуск: единственная запись в /system
adb shell su -c 'mount -o rw,remount / &&
                 mkdir -p /system/su.d &&
                 cp /data/local/tmp/jacred-boot.sh /system/su.d/99jacred &&
                 chmod 0700 /system/su.d /system/su.d/99jacred &&
                 mount -o ro,remount /'
```

`jacred-start.sh` кладётся ещё и внутрь chroot (`/data/debian/root/`), потому что
андроидные каталоги в chroot не смонтированы: `/data/local/tmp` изнутри не виден,
и путь скрипта надо давать в системе координат chroot'а (`/root/…`).

`chroot-debian.sh` — универсальный вход, годится не только для JacRed:

```bash
adb shell su -c '/system/bin/sh /data/local/tmp/chroot-debian.sh -c "dotnet --info"'
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

```bash
adb shell su -c 'rm -rf /data/debian'
adb shell su -c 'mount -o rw,remount / && rm -rf /system/su.d && mount -o ro,remount /'
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

Внутри chroot понадобился `/etc/apt/apt.conf.d/99android` с
`APT::Sandbox::User "root";`: apt сбрасывает привилегии на пользователя `_apt`, а
Android не даёт сокет процессам без группы `inet` (3003) — без этого apt падает
с «Could not resolve».

Chroot выбран вместо proot/Termux потому, что на приставке есть root, `/data`
смонтирован без `noexec`, а `busybox`, `tar` и `chroot` есть в самой системе —
прослойка не нужна.
