#!/usr/bin/env python3
"""Единственный реестр проверок качества этого репозитория.

    py -3.12 scripts/ci_check.py            # весь набор (и хук pre-commit)
    py -3.12 scripts/ci_check.py --only X   # одна проверка по имени

Реестр CHECKS ниже — единственный источник правды: и `.githooks/pre-commit`, и
ручной прогон агента идут через него, поэтому локальный набор не может разъехаться
с тем, что считается «зелёным». Что закрывает каждая проверка — docs/quality-gates.md.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections.abc import Callable, Iterable
from pathlib import Path, PurePosixPath


def _force_utf8_output() -> None:
    """Русские сообщения гейта на cp1252-консоли Windows иначе роняют сам гейт.

    Падение с UnicodeEncodeError неотличимо для оператора от «проверка сломалась»,
    а пропущенным при этом оказывается содержательный вердикт. Выполняется при
    импорте: скрипт зовут и напрямую, и из PostToolUse-хука.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="replace")


_force_utf8_output()

_EXCLUDE_DIRS = {".git", ".venv", ".claude", "__pycache__", ".mypy_cache", ".ruff_cache"}

# Данные снапшотов — выгрузка живого устройства: в settings.xml и LevelDB лежат
# настоящий токен аккаунта и логин/пароль TorrServer, и лежат там ЗАКОННО (без них
# снапшот не восстановит рабочую конфигурацию). Поэтому сканер секретов их не трогает —
# их закрывает не regex, а инвариант check_remote: в git они не попадают вовсе.
_SNAPSHOT_DATA = re.compile(r"^snapshots/[^/]+/(before|after)/")

# Бинарь сканировать нечем: detect-secrets всё равно молча пропустит нечитаемый файл,
# а сюда он попадает только из снапшотов, уже исключённых выше.
_BINARY_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".zip", ".apk", ".ldb", ".sqlite", ".db"}

# Формы секретов, которые реально живут в этом проекте: токен TMDB-прокси и uid/почта
# аккаунта приезжают в URL-ах Lampa, пароль — из конфига TorrServer. Дефолтные плагины
# detect-secrets ни одну из них не ловят (проверено на settings.xml), поэтому гейт
# держится на своих шаблонах, а detect-secrets остаётся вторым слоем для ключей общего вида.
_DEVICE_SECRET_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("токен в URL", re.compile(r"token=[0-9A-Za-z][0-9A-Za-z._~-]{7,}")),
    # Требование `@`/`%40` — не украшение: без него шаблон ловил сам себя и строку
    # документации, где `account_email=` упомянут как имя параметра, а не как значение.
    ("почта аккаунта в URL", re.compile(r"account_email=[^&\s\"'<>\[\]`]*(?:@|%40)")),
    ("uid аккаунта в URL", re.compile(r"[?&]uid=[0-9A-Za-z]{5,}")),
    ("пароль в открытом виде", re.compile(r"(?i)\b(?:pass|password|passwd)\s*[=:]\s*[\"']?\S{4,}")),
)
# Заглушка вместо значения — не находка. Форма `<...>` шаблонами выше не ловится по
# построению (после `=` требуется буквенно-цифровой символ); здесь — словесные плейсхолдеры.
_PLACEHOLDER = re.compile(r"(?i)redacted|example|changeme|xxxx|your[-_]?")
# Осознанное исключение на одну строку: маркер обязан стоять в самой строке, чтобы в
# diff-е он был виден рядом с тем, что разрешает.
_ALLOW_MARKER = "secret-ok"

# Не переиспользуют _DEVICE_SECRET_PATTERNS: там `[?&]` перед uid и обрыв email-паттерна
# на `@` — намеренная узость, чтобы не самосработать на упоминании параметра в доках
# (см. комментарий выше). Для маскировки живого текста (tools/screen.py) нужно обратное —
# поймать значение без URL-обвязки и погасить его целиком, включая домен email.
_REDACT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"token=[0-9A-Za-z][0-9A-Za-z._~-]{7,}"),
    re.compile(r"account_email=[^&\s\"'<>\[\]`]*(?:@|%40)[^&\s\"'<>\[\]`]*"),
    re.compile(r"uid=[0-9A-Za-z]{5,}"),
    re.compile(r"(?i)\b(?:pass|password|passwd)\s*[=:]\s*[\"']?\S{4,}"),
)


def _run(cmd: list[str]) -> None:
    if subprocess.run(cmd).returncode != 0:
        sys.exit(1)


def _git_files(*options: str) -> list[str]:
    """Пути от git в бинарном режиме: `-z` даёт устойчивость к пробелам и кириллице.

    Текстовый режим сломал бы `-z` переводом переносов внутри имени, а недекодируемый
    путь при text=True убил бы чтение и опустошил список — сканер секретов доложил бы
    «нечего сканировать» вместо настоящей причины.
    """
    proc = subprocess.run(["git", "ls-files", "-z", *options], capture_output=True)
    if proc.returncode != 0:
        print("git ls-files упал — набор файлов неизвестен")
        sys.exit(2)
    if proc.stdout is None:
        print("git ls-files не вернул вывод — набор файлов неизвестен")
        sys.exit(2)
    listing = proc.stdout.decode("utf-8", "surrogateescape")
    return [name for name in listing.split("\0") if name]


def _repo_files() -> list[str]:
    """Отслеживаемые + новые неигнорируемые файлы: гейт видит то, что вот-вот уедет в коммит."""
    return _git_files("--cached", "--others", "--exclude-standard")


def _excluded(name: str) -> bool:
    return bool(_EXCLUDE_DIRS & set(PurePosixPath(name).parts))


def _python_files() -> list[str]:
    return [
        name
        for name in _repo_files()
        if name.endswith(".py") and not _excluded(name) and Path(name).is_file()
    ]


def _scannable_files() -> list[str]:
    return [
        name
        for name in _repo_files()
        if not _excluded(name)
        and not _SNAPSHOT_DATA.match(name)
        and PurePosixPath(name).suffix.lower() not in _BINARY_SUFFIXES
        and Path(name).is_file()
    ]


def scan_device_secrets(files: Iterable[str]) -> list[str]:
    """Вернуть находки вида `путь:строка: описание` по шаблонам секретов проекта."""
    findings: list[str] = []
    for name in files:
        try:
            text = Path(name).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            # Молча пропустить нельзя: нечитаемый файл — это непроверенный файл.
            findings.append(f"{name}: не прочитан как UTF-8 — просканировать нечем")
            continue
        for lineno, line in enumerate(text.splitlines(), 1):
            if _ALLOW_MARKER in line:
                continue
            for label, pattern in _DEVICE_SECRET_PATTERNS:
                match = pattern.search(line)
                if match and not _PLACEHOLDER.search(match.group(0)):
                    findings.append(f"{name}:{lineno}: {label} — {match.group(0)[:60]}")
    return findings


def redact_secrets(text: str) -> str:
    """Замаскировать секреты проекта в произвольном тексте, не только в файлах на диске.

    Нужно инструментам вроде tools/screen.py: их вывод идёт прямиком в контекст
    агента, минуя git и гейт `secrets` (тот сканирует только индексируемые файлы).
    """
    for pattern in _REDACT_PATTERNS:
        text = pattern.sub("<redacted>", text)
    return text


_ALLOWED_REMOTE = "github.com/ekolvah/lampa-mediacenter"


def check_remote() -> None:
    """Публиковать можно только в известный репозиторий и только без снапшотов.

    Раньше правилом было «remote вообще нет». После публикации оно распадается на два
    инварианта, и второй важнее первого: чужой remote — ошибка адресата, а вот
    отслеживаемый файл под snapshots/ — разглашение токена аккаунта и пароля TorrServer,
    куда бы push ни ушёл. Проверяется индекс, а не рабочий каталог: на диске снапшоты
    лежать обязаны, их закрывает .gitignore, и вопрос ровно в том, не просочились ли они
    в git мимо него (`git add -f`, снятый игнор, выгрузка мимо snapshots/).
    """
    print("==> remote и отсутствие снапшотов в индексе")
    proc = subprocess.run(["git", "remote", "-v"], capture_output=True, text=True)
    if proc.returncode != 0:
        print("git remote упал — состояние репозитория неизвестно")
        sys.exit(2)
    fields = (line.split() for line in proc.stdout.splitlines())
    urls = {parts[1] for parts in fields if len(parts) > 1}
    foreign = sorted(url for url in urls if _ALLOWED_REMOTE not in url)
    if foreign:
        print(f"посторонний remote: {', '.join(foreign)}")
        print(f"  публиковать этот репозиторий можно только в {_ALLOWED_REMOTE}")
        sys.exit(1)

    leaked = sorted(name for name in _git_files("--cached") if name.startswith("snapshots/"))
    if leaked:
        print("под snapshots/ есть отслеживаемые файлы — в них токен аккаунта и пароль TorrServer:")
        for name in leaked[:10]:
            print(f"  {name}")
        if len(leaked) > 10:
            print(f"  ... ещё {len(leaked) - 10}")
        print("  снять с отслеживания (git rm --cached) до любого push;")
        print("  почему так — docs/snapshots-convention.md")
        sys.exit(1)


def check_secrets() -> None:
    print("==> секреты (шаблоны проекта + detect-secrets)")
    targets = _scannable_files()
    if not targets:
        # Пустой список detect-secrets примет за успех — вакуумный проход не отличить
        # от чистого, поэтому здесь это ошибка, а не «нечего делать».
        print("нечего сканировать — отказываюсь докладывать пустой проход как успех")
        sys.exit(1)
    findings = scan_device_secrets(targets)
    if findings:
        print("найдены секреты проекта (заглушка вместо значения снимает находку,")
        print(f"осознанное исключение — маркер {_ALLOW_MARKER!r} в той же строке):")
        for finding in findings:
            print(f"  {finding}")
        sys.exit(1)
    # `-X utf8`: detect-secrets открывает файлы в кодировке платформы и молча пропускает
    # UnicodeDecodeError — на Windows (cp1251) это тихо выкинуло бы из скана все файлы
    # с кириллицей, то есть почти весь репозиторий.
    _run([sys.executable, "-X", "utf8", "-m", "detect_secrets.pre_commit_hook", *targets])


def check_format() -> None:
    print("==> ruff format")
    _run([sys.executable, "-m", "ruff", "format", "--check", "."])


def check_lint() -> None:
    print("==> ruff check")
    _run([sys.executable, "-m", "ruff", "check", "."])


def check_mypy() -> None:
    print("==> mypy")
    modules = _python_files()
    if not modules:
        print("не найдено ни одного .py — так быть не может, гейт не видит даже себя")
        sys.exit(1)
    _run([sys.executable, "-m", "mypy", *modules])


def check_pytest() -> None:
    print("==> pytest")
    if not Path("tests").is_dir():
        print("  каталога tests/ нет — проверка неприменима")
        return
    _run([sys.executable, "-m", "pytest", "-q", "tests"])


_SNAPSHOT_DIR_NAME = re.compile(r"^\d{4}-\d{2}-\d{2}_[^/]+$")


def check_snapshots() -> None:
    """Конвенция docs/snapshots-convention.md как гейт.

    Снапшот без NOTES.md через месяц — набор бинарников без ответа на вопрос «что и
    зачем меняли»; снапшот без before/ не откатывается, ради чего и заводился.
    """
    print("==> конвенция снапшотов")
    root = Path("snapshots")
    if not root.is_dir():
        # Каталог выведен из git (.gitignore), поэтому в свежем клоне его законно нет.
        # Печатаем это явно: молчаливый пропуск неотличим от пройденной проверки, и
        # тогда исчезновение снапшотов на рабочей машине осталось бы незамеченным.
        print("  каталога snapshots/ нет — проверка неприменима (он не версионируется)")
        return
    problems: list[str] = []
    for entry in sorted(root.iterdir()):
        if not entry.is_dir():
            continue
        if not _SNAPSHOT_DIR_NAME.match(entry.name):
            problems.append(f"{entry.as_posix()}: имя не вида <YYYY-MM-DD>_<описание>")
            continue
        if not (entry / "NOTES.md").is_file():
            problems.append(f"{entry.as_posix()}: нет NOTES.md (что меняли, зачем, как проверяли)")
        if not (entry / "before").is_dir():
            problems.append(f"{entry.as_posix()}: нет before/ — откатывать нечем")
    if problems:
        print("снапшоты нарушают docs/snapshots-convention.md:")
        for problem in problems:
            print(f"  {problem}")
        sys.exit(1)


_MD_LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")


def check_links() -> None:
    """Относительные ссылки между документами должны разрешаться.

    Документы здесь — единственная навигация агента по проекту; битая ссылка
    отправляет его читать несуществующий файл и молча теряет контекст.
    """
    print("==> ссылки в markdown")
    problems: list[str] = []
    for name in _scannable_files():
        if not name.endswith(".md"):
            continue
        source = Path(name)
        for lineno, line in enumerate(source.read_text(encoding="utf-8").splitlines(), 1):
            for target in _MD_LINK.findall(line):
                if target.startswith(("http://", "https://", "mailto:", "#")):
                    continue
                path = target.split("#", 1)[0]
                if not path:
                    continue
                if not (source.parent / path).exists():
                    problems.append(f"{name}:{lineno}: ссылка в никуда — {target}")
    if problems:
        print("битые ссылки:")
        for problem in problems:
            print(f"  {problem}")
        sys.exit(1)


# Реестр — единственный источник правды о наборе проверок. Порядок = порядок прогона:
# сначала то, что дороже всего стоит при пропуске (разглашение), потом код и документы.
CHECKS: dict[str, Callable[[], None]] = {
    "remote": check_remote,
    "secrets": check_secrets,
    "format": check_format,
    "lint": check_lint,
    "mypy": check_mypy,
    "pytest": check_pytest,
    "snapshots": check_snapshots,
    "links": check_links,
}


def run_selected(only: str | None = None) -> None:
    if only is not None:
        CHECKS[only]()
        return
    for fn in CHECKS.values():
        fn()
    print("==> все проверки пройдены")


def main() -> None:
    parser = argparse.ArgumentParser(description="Проверки качества (все или одна через --only).")
    parser.add_argument(
        "--only",
        metavar="NAME",
        choices=sorted(CHECKS),
        help="прогнать одну проверку по имени; по умолчанию — все",
    )
    args = parser.parse_args()
    run_selected(args.only)


if __name__ == "__main__":
    main()
