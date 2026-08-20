#!/system/bin/sh
# Автозапуск JacRed после загрузки приставки. Кладётся в /system/su.d/99jacred
# (см. docs/jacred-on-ugoos.md) — SuperSU выполняет содержимое этого каталога
# сам, логируя каждый скрипт в logcat под тегом su.d.
#
# Возврат управления должен быть быстрым: su.d выполняются последовательно
# внутри daemonsu, поэтому вся работа уходит в фон.
LOG=/data/local/tmp/jacred-boot.log
CHROOT=/data/local/tmp/chroot-debian.sh

say() {
  echo "$(date '+%H:%M:%S') $1" >> "$LOG"
  log -p i -t jacred-boot "$1"
}

(
  : > "$LOG"
  say "boot hook started"

  # su.d запускается рано: /data примонтирована, но переживать перемонтирования и
  # неспешную инициализацию всё равно приходится. 60 попыток × 5 с = 5 минут.
  i=0
  while [ ! -x "$CHROOT" ] || [ ! -d /data/debian ]; do
    i=$((i + 1))
    if [ "$i" -gt 60 ]; then
      # Молча выйти нельзя: снаружи это выглядит как «поиск торрентов сломался»
      # без единого следа причины.
      say "GIVING UP: $CHROOT или /data/debian не появились за 5 минут"
      exit 1
    fi
    sleep 5
  done

  say "chroot на месте, стартуем JacRed"
  out=$("$CHROOT" /root/jacred-start.sh 2>&1)
  rc=$?
  say "jacred-start.sh rc=$rc: $out"
  exit "$rc"
) >> "$LOG" 2>&1 &
