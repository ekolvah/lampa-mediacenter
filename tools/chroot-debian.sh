#!/system/bin/sh
# Вход в Debian-chroot на Ugoos AM6. Кладётся на устройство в /data/local/tmp/
# и запускается через su:
#
#   adb shell su -c '/system/bin/sh /data/local/tmp/chroot-debian.sh -c "<команда>"'
#
# Идемпотентен: повторный запуск не плодит монтирования.
#
# Почему chroot, а не proot/Termux: на приставке есть root, /data смонтирован без
# noexec, а busybox/tar/chroot есть в системе — прослойка не нужна.
D=/data/debian
BB=/vendor/xbin/busybox

mounted() { "$BB" mount | "$BB" grep -q " $1 " ; }

mounted "$D/proc"    || "$BB" mount --bind /proc     "$D/proc"
mounted "$D/sys"     || "$BB" mount --bind /sys      "$D/sys"
mounted "$D/dev"     || "$BB" mount --bind /dev      "$D/dev"
mounted "$D/dev/pts" || "$BB" mount -t devpts devpts "$D/dev/pts"

# В LXC-образе /etc/resolv.conf — симлинк на systemd-resolved, которого здесь нет.
"$BB" rm -f "$D/etc/resolv.conf"
{ echo "nameserver 8.8.8.8"; echo "nameserver 1.1.1.1"; } > "$D/etc/resolv.conf"

# PATH задаётся только внутри chroot: снаружи он нужен андроидный, иначе не
# найдётся сам busybox.
exec "$BB" chroot "$D" /usr/bin/env \
  PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  HOME=/root LANG=C.UTF-8 TERM=xterm /bin/bash "$@"
