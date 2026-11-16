#!/bin/bash
# Сервис трейлеров tools/trailer_service.py в Debian-chroot (docs/jacred-on-ugoos.md).
# Кладётся в /data/debian/root/start.d/, запускается boot-хуком chroot-boot.sh или вручную:
#
#   adb shell '/system/bin/sh /data/local/tmp/chroot-debian.sh /root/start.d/trailer-search.sh'
#
# Андроидный TMPDIR=/data/local/tmp протекает в chroot, где такого каталога нет.
export TMPDIR=/tmp
exec bash /root/chroot-start.sh trailer-search /opt/trailer-search \
  /opt/trailer-search/venv/bin/python /opt/trailer-search/trailer_service.py
