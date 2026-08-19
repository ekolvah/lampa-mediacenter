# lampa-mediacenter — агентный workflow

Рабочие инструменты, документация и правила для обслуживания домашнего медиацентра
(Android-приставка Ugoos AM6 + Lampa + TorrServer + VLC, телевизор Samsung S95D)
силами кодового агента.

Конфигурация реального устройства сюда **не попадает**: снапшоты LocalStorage/LevelDB
и скриншоты остаются на локальной машине, потому что в дампах Lampa лежат токен
привязки аккаунта и пароль TorrServer. Это зафиксировано в [.gitignore](.gitignore)
(`snapshots/`, `settings.xml`, `*.ldb`, `leveldb/`, изображения) и продублировано
гейтом `remote` в [scripts/ci_check.py](scripts/ci_check.py).

## Инструменты

| Файл | Назначение |
|---|---|
| [tools/cdp.py](tools/cdp.py) | Выполнение JS в контексте Lampa через DevTools WebView — штатный способ править настройки из CLI |
| [tools/README.md](tools/README.md) | Как поднять DevTools-мост до приставки и пользоваться `cdp.py` |
| [scripts/ci_check.py](scripts/ci_check.py) | Гейты качества: секреты, ruff, mypy, структура снапшотов, ссылки в доках |
| [scripts/audio_state.py](scripts/audio_state.py) | Снимок аудио-тракта приставки: что реально уходит на HDMI прямо сейчас |
| [scripts/claude_hook.py](scripts/claude_hook.py) | PostToolUse-хук: не даёт агенту записать секрет устройства в файл |

## Документация

| Файл | Назначение |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Инструкции агенту: что за проект, обязательный процесс правок |
| [docs/token-efficiency-analysis.md](docs/token-efficiency-analysis.md) | Разбор расхода токенов в реальных агентных сессиях: цифры, антипаттерны, план |
| [docs/snapshots-convention.md](docs/snapshots-convention.md) | Бэкап и откат перед правкой конфигурации устройства |
| [docs/quality-gates.md](docs/quality-gates.md) | Какие проверки стоят перед коммитом и почему именно эти |
| [docs/device-ugoos-am6.md](docs/device-ugoos-am6.md) | Приставка: характеристики, подключение по ADB, диагностика |
| [docs/device-samsung-tv.md](docs/device-samsung-tv.md) | Телевизор: характеристики, доступ через Smart TV API |
| [docs/4k-hdr-setup.md](docs/4k-hdr-setup.md) | Что настроено и проверено по разрешению, HDR и звуку |
| [docs/lampa-config-review.md](docs/lampa-config-review.md) | Аудит конфигурации Lampa: плагины, парсер, плеер |

## Текущая работа

Открытые задачи — во вкладке Issues. Большая часть выросла из замера в
[docs/token-efficiency-analysis.md](docs/token-efficiency-analysis.md): одна
шестичасовая сессия стоила **59.3M входных токенов** при 358K выходных, и главный
драйвер — не объём отдельных ответов, а **число обращений к модели**
(575 на 41 реплику пользователя).

## Конвенции

- Любая правка конфигурации устройства — только после снапшота, одно изменение
  за раз, проверка на реальном сценарии после каждого.
- Прямая правка LevelDB запрещена: формат бинарный, облачная синхронизация
  всё равно перетрёт локальное изменение. Штатный путь — `Lampa.Storage` через `cdp.py`.
- Секреты устройства (токены, пароли, содержимое дампов) не покидают локальную машину.
