#!/bin/bash
# Gateway Hermes Agent (бот Telegram) в Debian-chroot (docs/hermes-agent-on-ugoos.md).
# Кладётся в /data/debian/root/start.d/, запускается boot-хуком chroot-boot.sh или вручную:
#
#   adb shell '/system/bin/sh /data/local/tmp/chroot-debian.sh /root/start.d/hermes.sh'
#
# Токен бота, белый список и ключи моделей — в $HERMES_HOME/.env.
export HERMES_HOME=/opt/hermes/home
# Андроидный TMPDIR=/data/local/tmp протекает в chroot, где такого каталога нет.
export TMPDIR=/tmp
exec bash /root/chroot-start.sh hermes /opt/hermes \
  /opt/hermes/venv/bin/python /opt/hermes/venv/bin/hermes gateway run
