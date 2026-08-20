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
| HTTP | `http://127.0.0.1:9117` | `listenip: any`, `opensync: false` |

Lampa настроена на этот адрес: `jackett_url` = `http://127.0.0.1:9117`
(`Lampa.Storage`, синхронизируется с CUB-аккаунтом — менять только через
приложение или [../tools/README.md](../tools/README.md) `cdp.py`, не правкой файлов).
Смешанного контента нет: страница Lampa открыта по `http://lampa.mx`.

Краулинг трекеров намеренно НЕ включён: cron-задача `Data/run-job.sh` не
установлена, `opensync: false`. База обновляется только импортом дампа (см. ниже),
приставка сама трекеры не опрашивает.

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

## Обновление базы

```bash
# внутри chroot, /opt/jacred
curl -A "Mozilla/5.0" -o db.archive https://sync.jacred.stream/latest.tar.zst.zip
zstd -d db.archive -c | tar -xf - -C Data
```

Два подвоха, оба стоили времени: Cloudflare отдаёт файл только с браузерным
User-Agent (на дефолтный UA `curl` — `403`), и под расширением `.zip` лежит сырой
`.tar.zst`, поэтому распаковка через `zstd`, а не `unzip`. Архив — 1.3 ГБ,
на диске разворачивается в 4.8 ГБ; после старта индекс перестраивается за ~4 с.

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
