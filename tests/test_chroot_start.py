"""Тесты tools/chroot-start.sh — запуск сервиса chroot через start-stop-daemon (design.md, решение 8).

Гоняют обёртку настоящим `start-stop-daemon` во временном каталоге, с `sleep` и `sh -c 'exit 1'`
вместо сервиса. Без него (Windows) тесты пропускаются с причиной, а при заданной `CI` падают:
иначе гейт зеленел бы, не проверив обёртку.
"""

import os
import shutil
import subprocess
from collections.abc import Iterator
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parent.parent / "tools" / "chroot-start.sh"
SSD = shutil.which("start-stop-daemon")


@pytest.fixture(autouse=True)
def _need_start_stop_daemon() -> None:
    if SSD:
        return
    reason = "start-stop-daemon не найден на PATH: обёртка chroot-start.sh не проверена"
    if os.environ.get("CI"):
        pytest.fail(reason)
    pytest.skip(reason)


@pytest.fixture
def workdir(tmp_path: Path) -> Iterator[Path]:
    yield tmp_path
    pidfile = tmp_path / "svc.pid"
    if pidfile.exists() and SSD:
        subprocess.run(
            [SSD, "--stop", "--oknodo", "--pidfile", str(pidfile), "--remove-pidfile"],
            check=False,
            capture_output=True,
        )


def start(workdir: Path, *cmd: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(SCRIPT), "svc", str(workdir), *cmd],
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )


def sleep_bin() -> str:
    path = shutil.which("sleep")
    assert path
    return os.path.realpath(path)


def pid_of(workdir: Path) -> int:
    return int((workdir / "svc.pid").read_text().strip())


def exe_of(pid: int) -> str:
    return os.path.realpath(f"/proc/{pid}/exe")


def test_starts_and_writes_pidfile(workdir: Path) -> None:
    proc = start(workdir, sleep_bin(), "300")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert exe_of(pid_of(workdir)) == sleep_bin()


def test_already_running(workdir: Path) -> None:
    assert start(workdir, sleep_bin(), "300").returncode == 0
    first = pid_of(workdir)
    again = start(workdir, sleep_bin(), "300")
    assert again.returncode == 0, again.stdout + again.stderr
    assert "already running" in again.stdout
    assert pid_of(workdir) == first


def test_stale_pidfile_starts(workdir: Path) -> None:
    # pid из файла жив, но это чужой процесс (не sleep): --exec не совпадает, сервис поднимается.
    foreign = subprocess.Popen(["cat"], stdin=subprocess.PIPE)
    try:
        (workdir / "svc.pid").write_text(f"{foreign.pid}\n")
        proc = start(workdir, sleep_bin(), "300")
        assert proc.returncode == 0, proc.stdout + proc.stderr
        assert "already running" not in proc.stdout
        assert pid_of(workdir) != foreign.pid
        assert exe_of(pid_of(workdir)) == sleep_bin()
    finally:
        foreign.kill()
        foreign.wait()


def test_failed_start_tails_log(workdir: Path) -> None:
    sh = os.path.realpath(shutil.which("sh") or "/bin/sh")
    proc = start(workdir, sh, "-c", "echo boom-on-start; exit 1")
    assert proc.returncode == 1
    assert "boom-on-start" in proc.stdout + proc.stderr
    assert (workdir / "run.log").exists()
