#!/bin/bash
# JacRed в Debian-chroot (docs/jacred-on-ugoos.md). Кладётся в /data/debian/root/start.d/,
# запускается boot-хуком chroot-boot.sh или вручную:
#
#   adb shell '/system/bin/sh /data/local/tmp/chroot-debian.sh /root/start.d/jacred.sh'
export DOTNET_ROOT=/opt/dotnet
export PATH=/opt/dotnet:$PATH
# Андроидный TMPDIR=/data/local/tmp протекает в chroot, где такого каталога нет.
export TMPDIR=/tmp
exec bash /root/chroot-start.sh jacred /opt/jacred /opt/jacred/JacRed
