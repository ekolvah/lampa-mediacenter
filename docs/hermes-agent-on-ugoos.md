# Проба Hermes Agent на приставке (Debian-chroot, armv7l)

Hermes Agent (NousResearch, `github.com/NousResearch/hermes-agent`) проверяли как кандидата для
личного агента новостей с каналом Telegram. Проба прошла 2026-11-28 на версии v0.23.5. Это
проба, а не развёртывание: нет автозапуска, Telegram не подключён.

## Вердикт

**Встаёт в обход официального установщика и работает с подпиской ChatGPT Plus и с Gemini free
tier, но с оговорками.** Сейчас модель — `gpt-6-sol` через ChatGPT Plus (см. ниже): запрос
`hermes -z "Ответь одним словом: столица Франции?"` вернул «Париж.» за 98 с, включая холодный
старт gateway. Однако Hermes официально не поддерживает `armv7l`, и часть функций на приставке
не работает.

- `scripts/install.sh` сразу завершается с ошибкой `unsupported_platform`: для его `uv` есть только
  сборки x64 и arm64.
- Встроенный менеджер пакетов `pm` (`pm/store.py::current_target`) на этой архитектуре бросает
  `RuntimeError: unsupported architecture: armv7l`. Поэтому `hermes doctor` падает целиком, а
  computer-use, браузер (chromium) и Node через `hermes pm` недоступны. Gateway при этом не
  падает, только пишет traceback в лог.
- В `pyproject.toml` каждая зависимость объявлена с условием `python_version >= '3.14'`. На
  системном Python 3.13 из Debian 13 они просто не ставятся, поэтому нужен свой Python 3.14.
- Готовых wheel'ов под armv7 cp314 нет у шести пакетов:

  | Пакет | Что это | Итог |
  | --- | --- | --- |
  | `psutil`, `cffi`, `httptools` | C | собраны из исходников за 37 с, нужен `gcc` в chroot. `psutil` обязателен: без него не импортируются terminal/delegate tools и падает kanban-диспетчер |
  | `pillow`, `pillow-heif` | C + libjpeg/libheif | не ставились. Используются только в `agent/pet` и `tools/bot_desktop`, а не в основном пути |
  | `firecrawl-anydoc` | Rust (maturin, 186 crate'ов) | не ставился, сборка на приставке дольше лимита. Без него `read_file` не извлекает текст из PDF и Office-документов |

## ChatGPT Plus (`openai-codex`) — текущий провайдер

- Вход по device code, браузер на приставке не нужен:
  `hermes auth add openai-codex --type oauth --no-browser --label chatgpt-plus`. Команда печатает
  код. Его вводят на `https://auth.openai.com/codex/device`, войдя в свой аккаунт ChatGPT.
  Ожидание до 15 минут. Hermes заводит свою OAuth-сессию, Codex CLI и VS Code она не трогает.
- Затем `hermes config set model.provider openai-codex` и `hermes config set model.default gpt-6-sol`.
  Список моделей — `DEFAULT_CODEX_MODELS` в `hermes_cli/codex_models.py`.
- Учётки видны в `hermes auth list`. Токен лежит в `$HERMES_HOME/auth.json` и обновляется сам.
- Ключ Gemini остаётся второй учёткой в `.env`. Вернуться на Gemini можно двумя командами
  `config set` из раздела ниже.

## Gemini free tier

- Провайдер настраивается двумя командами: `hermes config set model.provider gemini` и
  `hermes config set model.default <модель>`. Ключ берётся из `GOOGLE_API_KEY` в `$HERMES_HOME/.env`.
- Модель по умолчанию из примера конфига, `gemini-2.5-flash`, отвечает 404: новым пользователям она
  недоступна.
- У `gemini-3.8-flash` на free tier лимит 20 запросов в сутки, плюс 503 «high demand». Один промпт
  Hermes тратит несколько запросов (повторы, служебная проба), поэтому квота кончилась за две
  попытки. После 429 Hermes ставит повтор через 600 с.
- `gemini-3.1-flash-lite` ответил с первой попытки. Для агента на free tier нужна lite-модель и
  резервный провайдер (`hermes fallback add`).
- `hermes -z` не работает сам по себе: он поднимает фоновый `gateway run --quiet --idle-exit` и
  говорит с ним по WebSocket. Gateway остаётся жить после ответа.

## Ресурсы

- Gateway в простое после запроса: **RSS ~170 МБ, CPU ~9,5 % одного ядра** (замер за 2 минуты).
  Без платформ и без запроса — те же ~160–180 МБ. Сам процесс `hermes -z` держит ~48 МБ.
- Холодный `hermes --version` занимает ~13 с, старт gateway — больше минуты, CPU на одном ядре.
- Остановка по SIGTERM занимает ~40 с.
- На диске `/opt/hermes` занимает 738 МБ: Python 3.14, venv, git-checkout и кэш uv.
- Фон на приставке на момент пробы: JacRed держит ~1,2 ГБ RSS, `MemAvailable` ~0,5–0,7 ГБ.
  С работающим gateway `MemAvailable` падает до ~270 МБ, а swap (255 МБ) заполняется целиком.
  Kanban-диспетчер Hermes сам пишет WARNING «system memory pressure is elevated». Постоянно
  работающий агент рядом с JacRed и Lampa — на пределе по памяти.

## Что развёрнуто (внутри chroot)

| Что | Где |
| --- | --- |
| uv 0.13.5 `armv7-unknown-linux-gnueabihf` | `/opt/hermes/bin/uv` |
| CPython 3.14.9 (python-build-standalone) | `/opt/hermes/python`, шим `/root/.local/bin/python3.14` |
| Исходники v0.23.5 | `/opt/hermes/src` (`git clone --depth 1 --branch v0.23.5`) |
| venv (editable-установка: сборку wheel `setup.py` запрещает) | `/opt/hermes/venv` |
| `HERMES_HOME` (config, sessions, memories, `.env` с `GOOGLE_API_KEY`, `auth.json` с OAuth ChatGPT) | `/opt/hermes/home` |
| Сборочные пакеты apt | `gcc`, `libc6-dev`, `libffi-dev` и их зависимости |

## Установка

Все команды выполняются внутри chroot: `/data/local/tmp/chroot-debian.sh -c "..."`.

```bash
export UV_PYTHON_INSTALL_DIR=/opt/hermes/python UV_CACHE_DIR=/opt/hermes/cache TMPDIR=/opt/hermes/tmp
cd /opt/hermes
curl -fsSL https://github.com/astral-sh/uv/releases/download/0.13.5/uv-armv7-unknown-linux-gnueabihf.tar.gz \
  | tar xz --strip-components=1 -C bin
./bin/uv python install 3.14
git clone --depth 1 --branch v0.23.5 https://github.com/NousResearch/hermes-agent.git src
./bin/uv venv --python 3.14 venv
export VIRTUAL_ENV=/opt/hermes/venv
(cd src && ../bin/uv export --frozen --no-dev --no-emit-project --no-hashes --python 3.14 -o /opt/hermes/req.txt)
grep -vE '^(cffi|firecrawl-anydoc|httptools|pillow|pillow-heif|psutil)==' req.txt > req-wheels.txt
./bin/uv pip install --only-binary :all: --no-deps -r req-wheels.txt
apt-get install -y --no-install-recommends gcc libc6-dev libffi-dev
./bin/uv pip install --no-deps cffi==2.1.1 httptools==0.8.0 psutil==7.2.2
./bin/uv pip install --no-deps -e ./src
HERMES_HOME=/opt/hermes/home TMPDIR=/tmp ./venv/bin/hermes --version
```

`TMPDIR=/tmp` нужно задавать явно: из Android в chroot наследуется `TMPDIR=/data/local/tmp`.

## Откат

Только ChatGPT: `hermes auth remove openai-codex 1`, затем вернуть `model.provider`/`model.default` на
Gemini. Сессию также можно отозвать в настройках аккаунта ChatGPT. Hermes целиком:

```bash
rm -rf /opt/hermes /root/.local/bin/python3.14
apt-get purge gcc libc6-dev libffi-dev && apt-get autoremove   # сверить со снапшотом dpkg-списка
```
