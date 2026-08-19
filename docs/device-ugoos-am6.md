# Приставка: Ugoos AM6

## Характеристики (сняты напрямую с устройства, 2026-08-19)

- Модель: **Ugoos AM6** (`getprop ro.product.model` → `UGOOS-AM6`)
- Android 9, платформа Amlogic (`getprop ro.hardware` → `amlogic`)
- Установленные приложения: `ru.yourok.torrserve` (TorrServe), `org.videolan.vlc` (VLC),
  `top.rootu.lampa` (Lampa)
- Подключена к Samsung TV по HDMI

Важно: это не AM7/AM9/SK1 — те модели на более новых чипах (S905X4/S928X) с
аппаратным AV1-декодированием. Не считать, что у AM6 есть AV1 hardware decode —
это не проверялось и на этом чипе маловероятно.

## Как подключиться (ADB)

1. На приставке: **Настройки → Настройки устройства → Для разработчиков**
   (открывается 7 нажатиями на номер сборки в «Об устройстве», если ещё не разблокировано).
2. Включить **Wireless debugging** («Отладка по Wi-Fi» / «Отладка по сети»).
   На этой модели USB-путь (USB-отладка + кабель) подключение не дал —
   ни один кабель/порт не завёлся как data-порт с ПК. Рабочий путь — только Wi-Fi.
3. Узнать IP приставки в локальной сети (Настройки → Сеть, либо со стороны роутера).
   На момент последней проверки: `192.168.10.5`.
4. С компьютера:
   ```
   adb connect 192.168.10.5:5555
   ```
   На экране приставки появится запрос авторизации — подтвердить.
5. Если нужен root (например, для правки sysfs):
   ```
   adb root
   ```
   Устройство поддерживает `adb root` без дополнительной прошивки/разблокировки.

Если `adb connect` отвечает `failed to authenticate` — либо ещё не подтверждён
запрос на экране приставки, либо авторизация этого компьютера была отозвана;
повторить `adb disconnect` → `adb connect` и подтвердить запрос заново.

## Windows/git-bash: обход MSYS path-mangling

При выполнении `adb shell "cat /sys/..."` из git-bash на Windows пути вида
`/sys/...` автоматически преобразуются в `C:/Program Files/Git/sys/...`.
Решение — переменная окружения перед командой:

```
MSYS_NO_PATHCONV=1 adb shell "cat /sys/class/display/mode"
```

Это же нужно для `adb pull`/`adb push` с абсолютными Unix-путями.

## Полезные диагностические команды

```bash
# Текущий режим вывода HDMI (разрешение/частота)
MSYS_NO_PATHCONV=1 adb shell "cat /sys/class/display/mode"

# Список режимов, которые поддерживает TV (звёздочка = текущий согласованный)
MSYS_NO_PATHCONV=1 adb shell "cat /sys/class/amhdmitx/amhdmitx0/disp_cap"

# Текущий цветовой формат/глубина (напр. "420,10bit")
MSYS_NO_PATHCONV=1 adb shell "cat /sys/class/amhdmitx/amhdmitx0/attr"

# HDR-возможности TV (HDR10 / HDR10+ / HLG)
MSYS_NO_PATHCONV=1 adb shell "cat /sys/class/amhdmitx/amhdmitx0/hdr_cap"

# Поддержка Dolby Vision телевизором
MSYS_NO_PATHCONV=1 adb shell "cat /sys/class/amhdmitx/amhdmitx0/dv_cap"

# Аудио-возможности TV (какие форматы примет по HDMI)
MSYS_NO_PATHCONV=1 adb shell "cat /sys/class/amhdmitx/amhdmitx0/aud_cap"

# Скриншот экрана приставки (для визуальной проверки UI)
MSYS_NO_PATHCONV=1 adb shell "screencap -p /sdcard/shot.png"
MSYS_NO_PATHCONV=1 adb pull /sdcard/shot.png ./shot.png
```

## Навигация в UI приставки без пульта (через adb)

```bash
adb shell input keyevent KEYCODE_DPAD_UP
adb shell input keyevent KEYCODE_DPAD_DOWN
adb shell input keyevent KEYCODE_DPAD_LEFT
adb shell input keyevent KEYCODE_DPAD_RIGHT
adb shell input keyevent KEYCODE_DPAD_CENTER
adb shell input keyevent KEYCODE_BACK
```

Меню настроек экрана: **Настройки → Настройки устройства → Экран → Разрешение экрана →
Настройки цветового режима → «Цветовой режим для 4k50-60Hz»**. При выборе нового
режима появляется диалог с ~14-секундным таймером автоотката — обязательно
подтвердить «OK» (перемещение фокуса вправо стрелкой сработало не всегда надёжно
через adb input, надёжнее свериться скриншотом перед подтверждением, либо
подтверждать физическим пультом).
