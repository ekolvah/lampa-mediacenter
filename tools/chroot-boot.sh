#!/system/bin/sh
# Автозапуск сервисов Debian-chroot после загрузки приставки. Кладётся в /system/su.d/99chroot
# (см. docs/jacred-on-ugoos.md) — SuperSU выполняет содержимое этого каталога сам, логируя
# каждый скрипт в logcat под тегом su.d. Запускает внутри chroot каждый /root/start.d/*.sh;
# новый сервис — новый файл в start.d/, без правки /system.
#
# Возврат управления должен быть быстрым: su.d выполняются последовательно внутри daemonsu,
# поэтому вся работа уходит в фон. Код выхода фоновой части никто не читает: сбой сервиса
# виден строкой «<name> rc=<не 0>» в $LOG и в logcat под тегом chroot-boot.
LOG=/data/local/tmp/chroot-boot.log
CHROOT=/data/local/tmp/chroot-debian.sh
START_D=/data/debian/root/start.d

say() {
  echo "$(date '+%H:%M:%S') $1" >> "$LOG"
  log -p i -t chroot-boot "$1"
}

(
  : > "$LOG"
  say "boot hook started"

  # su.d запускается рано: /data примонтирована, но переживать перемонтирования и
  # неспешную инициализацию всё равно приходится. 60 попыток × 5 с = 5 минут.
  i=0
  while [ ! -x "$CHROOT" ] || [ ! -d "$START_D" ]; do
    i=$((i + 1))
    if [ "$i" -gt 60 ]; then
      # Молча выйти нельзя: снаружи это выглядит как «поиск торрентов сломался»
      # без единого следа причины.
      say "GIVING UP: $CHROOT или $START_D не появились за 5 минут"
      exit 1
    fi
    sleep 5
  done

  for f in "$START_D"/*.sh; do
    name=${f##*/}
    name=${name%.sh}
    out=$("$CHROOT" "/root/start.d/$name.sh" 2>&1)
    rc=$?
    say "$name rc=$rc: $out"
  done
) >> "$LOG" 2>&1 &
