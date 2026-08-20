#!/bin/bash
# Запуск JacRed внутри Debian-chroot. Кладётся в /data/debian/root/ и вызывается
# снаружи через chroot-debian.sh:
#
#   adb shell su -c '/system/bin/sh /data/local/tmp/chroot-debian.sh /root/jacred-start.sh'
#
# Идемпотентен: если процесс уже жив, второй экземпляр не поднимается.
export DOTNET_ROOT=/opt/dotnet
export PATH=/opt/dotnet:$PATH

cd /opt/jacred || exit 1

if pidof JacRed >/dev/null 2>&1; then
  echo "already running pid=$(pidof JacRed)"
  exit 0
fi

: > run.log
nohup ./JacRed >> run.log 2>&1 &

# Три секунды хватает, чтобы упавший на старте процесс уже не числился живым:
# перестроение индекса идёт дольше, но само по себе старту не мешает.
sleep 3
pid=$(pidof JacRed)

if [ -z "$pid" ]; then
  echo "FAILED to start, run.log:"
  tail -20 run.log
  exit 1
fi

echo "started pid=$pid"
