"""Тесты HTTP-сервиса трейлеров — tools/trailer_service.py (spec trailer-search-service).

Устройство и YouTube не нужны: сервер поднимается на эфемерном порту loopback, поиск —
двойник `TrailerFinder`, часы подставные (design.md, решение 3). Адаптер библиотеки
`trailer-search` проверяется двойниками её функции и классов: модуль грузится без неё.
"""

import json
import logging
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from http.server import ThreadingHTTPServer
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

from trailer_service import (  # noqa: E402
    LibraryFinder,
    SearchFailed,
    TrailerAnswer,
    TrailerFinder,
    TrailerQuery,
    build_server,
    main,
)

PICK = TrailerAnswer("J2VS_OlUJtA", "Зверь (2026)#трейлер в русской озвучке", 0.3, "ambiguous: 2")
NO_PICK = TrailerAnswer(None, None, 0.0, "no candidates")
DAY_S = 24 * 60 * 60
BEAST = "/trailer?title=%D0%97%D0%B2%D0%B5%D1%80%D1%8C&original_title=The%20Beast&year=2026"
GENTLEMEN = (
    "/trailer?title=%D0%94%D0%B6%D0%B5%D0%BD%D1%82%D0%BB%D1%8C%D0%BC%D0%B5%D0%BD%D1%8B"
    "&original_title=The%20Gentlemen&year=2024"
)


class FakeFinder:
    """Отвечает по очереди из `answers`; исключение в очереди бросается."""

    def __init__(self, *answers: TrailerAnswer | Exception) -> None:
        self.answers = list(answers)
        self.queries: list[TrailerQuery] = []

    def find(self, query: TrailerQuery) -> TrailerAnswer:
        self.queries.append(query)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@dataclass
class Service:
    finder: FakeFinder
    clock: Clock
    base: str


@contextmanager
def serving(finder: TrailerFinder, clock: Clock) -> Iterator[str]:
    server = build_server(finder, clock, port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()


@pytest.fixture
def service(request: pytest.FixtureRequest) -> Iterator[Service]:
    finder = FakeFinder(*request.param)
    clock = Clock()
    with serving(finder, clock) as base:
        yield Service(finder, clock, base)


def get(svc: Service, path: str) -> tuple[int, Any]:
    try:
        with urllib.request.urlopen(svc.base + path, timeout=5) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read())


@pytest.mark.parametrize("service", [[PICK]], indirect=True)
def test_found_returns_pick(service: Service) -> None:
    status, body = get(service, BEAST)
    assert status == 200
    assert body == {
        "video_id": "J2VS_OlUJtA",
        "title": "Зверь (2026)#трейлер в русской озвучке",
        "confidence": 0.3,
        "reason": "ambiguous: 2",
    }
    assert service.finder.queries == [TrailerQuery("Зверь", "The Beast", 2026)]


@pytest.mark.parametrize("service", [[NO_PICK]], indirect=True)
def test_no_match_returns_null(service: Service) -> None:
    status, body = get(service, BEAST)
    assert status == 200
    assert body["video_id"] is None
    assert body["reason"] == "no candidates"


@pytest.mark.parametrize("service", [[]], indirect=True)
@pytest.mark.parametrize(
    "path",
    ["/trailer", "/trailer?title=", "/trailer?title=x&year=20x6", "/trailer?original_title=x"],
)
def test_bad_request_400(service: Service, path: str) -> None:
    status, body = get(service, path)
    assert status == 400
    assert body["error"]
    assert service.finder.queries == []


@pytest.mark.parametrize("service", [[PICK]], indirect=True)
@pytest.mark.parametrize(
    ("suffix", "season", "series"),
    [
        ("&season=2", 2, None),
        ("&series=1", None, True),
        ("&series=0", None, False),
        ("", None, None),
    ],
)
def test_param_passed_to_finder(
    service: Service, suffix: str, season: int | None, series: bool | None
) -> None:
    status, body = get(service, GENTLEMEN + suffix)
    assert (status, body["video_id"]) == (200, "J2VS_OlUJtA")
    assert service.finder.queries == [
        TrailerQuery("Джентльмены", "The Gentlemen", 2024, season, series)
    ]


@pytest.mark.parametrize("service", [[]], indirect=True)
@pytest.mark.parametrize(
    ("name", "value"),
    [("season", v) for v in ["0", "-1", "x", "1.5", "²"]] + [("series", "2"), ("series", "true")],
)
def test_bad_int_param_400(service: Service, name: str, value: str) -> None:
    status, body = get(service, GENTLEMEN + f"&{name}=" + urllib.parse.quote(value))
    assert status == 400
    assert name in body["detail"]
    assert service.finder.queries == []


@pytest.mark.parametrize("service", [[]], indirect=True)
def test_unknown_path_404(service: Service) -> None:
    status, _ = get(service, "/nope")
    assert status == 404


@pytest.mark.parametrize("service", [[PICK]], indirect=True)
def test_optional_params_absent(service: Service) -> None:
    status, _ = get(service, "/trailer?title=x")
    assert status == 200
    assert service.finder.queries == [TrailerQuery("x", "", None)]


@pytest.mark.parametrize(
    "service", [[SearchFailed("Sign in to confirm you're not a bot")]], indirect=True
)
def test_retrieval_error_502_logged(service: Service, caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.ERROR):
        status, body = get(service, BEAST)
    assert status == 502
    assert body["error"]
    assert "not a bot" in body["detail"]
    errors = [r.getMessage() for r in caplog.records if r.levelno == logging.ERROR]
    assert len(errors) == 1
    assert "Зверь" in errors[0] and "2026" in errors[0]


@pytest.mark.parametrize(
    ("service", "path"),
    [([PICK], BEAST), ([SearchFailed("blocked")], BEAST), ([], "/trailer"), ([], "/nope")],
    indirect=["service"],
)
def test_cors_any_origin(service: Service, path: str) -> None:
    # Страница Lampa (http://lampa.mx) читает ответ loopback-сервиса только с этим заголовком:
    # без него WebView отдаёт плагину status 0, хотя сервис ответил 200 (наблюдение 2026-11-16).
    req = urllib.request.Request(service.base + path, headers={"Origin": "http://lampa.mx"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            headers = resp.headers
    except urllib.error.HTTPError as err:
        headers = err.headers
    assert headers["Access-Control-Allow-Origin"] == "*"


@pytest.mark.parametrize("service", [[PICK]], indirect=True)
def test_cache_hit_skips_search(service: Service) -> None:
    first = get(service, BEAST)
    service.clock.now += DAY_S - 1
    assert get(service, BEAST) == first
    assert len(service.finder.queries) == 1


@pytest.mark.parametrize("service", [[NO_PICK]], indirect=True)
def test_cache_keeps_null(service: Service) -> None:
    get(service, BEAST)
    status, body = get(service, BEAST)
    assert (status, body["video_id"]) == (200, None)
    assert len(service.finder.queries) == 1


@pytest.mark.parametrize("service", [[NO_PICK, PICK]], indirect=True)
def test_cache_expires_after_24h(service: Service) -> None:
    get(service, BEAST)
    service.clock.now += DAY_S + 1
    status, body = get(service, BEAST)
    assert (status, body["video_id"]) == (200, "J2VS_OlUJtA")
    assert len(service.finder.queries) == 2


@pytest.mark.parametrize("service", [[NO_PICK, PICK]], indirect=True)
@pytest.mark.parametrize(
    ("first", "second", "params"),
    [
        ("", "&season=2", [(None, None), (2, None)]),
        ("&series=0", "&series=1", [(None, False), (None, True)]),
    ],
)
def test_cache_key_includes_params(
    service: Service, first: str, second: str, params: list[tuple[Any, Any]]
) -> None:
    get(service, GENTLEMEN + first)
    status, body = get(service, GENTLEMEN + second)
    assert (status, body["video_id"]) == (200, "J2VS_OlUJtA")
    assert [(q.season, q.series) for q in service.finder.queries] == params


@pytest.mark.parametrize("service", [[SearchFailed("blocked"), PICK]], indirect=True)
def test_error_not_cached(service: Service) -> None:
    assert get(service, BEAST)[0] == 502
    status, body = get(service, BEAST)
    assert (status, body["video_id"]) == (200, "J2VS_OlUJtA")
    assert len(service.finder.queries) == 2


# --- адаптер библиотеки trailer-search: двойники find_trailer, FilmProfile, TrailerRetrievalError


@dataclass
class FakeProfile:
    ru_title: str
    original_title: str
    year: int | None
    season: int | None = None
    series: bool | None = None


@dataclass
class FakePick:
    video_id: str | None
    title: str | None
    confidence: float
    reason: str


class FakeRetrievalError(Exception):
    pass


def test_library_adapter_maps_pick() -> None:
    seen: list[Any] = []

    def find(profile: Any) -> FakePick:
        seen.append(profile)
        return FakePick("J2VS_OlUJtA", "Зверь", 0.3, "ambiguous: 2")

    finder = LibraryFinder(find, FakeProfile, FakeRetrievalError)
    answer = finder.find(TrailerQuery("Зверь", "The Beast", 2026))
    assert answer == TrailerAnswer("J2VS_OlUJtA", "Зверь", 0.3, "ambiguous: 2")
    assert seen == [FakeProfile("Зверь", "The Beast", 2026)]


@pytest.mark.parametrize(("season", "series"), [(2, None), (None, True), (None, False)])
def test_library_adapter_passes_params(season: int | None, series: bool | None) -> None:
    seen: list[Any] = []

    def find(profile: Any) -> FakePick:
        seen.append(profile)
        return FakePick("3xow3-n2VQM", "Джентльмены (2 сезон)", 0.9, "ru language")

    finder = LibraryFinder(find, FakeProfile, FakeRetrievalError)
    answer = finder.find(TrailerQuery("Джентльмены", "The Gentlemen", 2024, season, series))
    assert answer == TrailerAnswer("3xow3-n2VQM", "Джентльмены (2 сезон)", 0.9, "ru language")
    assert seen == [FakeProfile("Джентльмены", "The Gentlemen", 2024, season=season, series=series)]


def test_rejected_profile_400() -> None:
    # trailer-search v0.3.0 отвергает `season` с `series=False` в FilmProfile (design.md, решение 4).
    searched: list[Any] = []

    def reject(*_args: Any, **_kwargs: Any) -> Any:
        raise ValueError("season 2 contradicts series=False")

    clock = Clock()
    with serving(LibraryFinder(searched.append, reject, FakeRetrievalError), clock) as base:
        status, body = get(Service(FakeFinder(), clock, base), GENTLEMEN + "&season=2&series=0")
    assert status == 400
    assert "contradicts" in body["detail"]
    assert searched == []


def test_library_adapter_season_fallback_null() -> None:
    # Текст замены — trailer-search v0.2.0, strategy.py:158 (design.md, решение 5).
    def find(_profile: Any) -> FakePick:
        return FakePick(
            "1st-season", "Джентльмены (1 сезон)", 0.9, "ru language; season 2 fallback"
        )

    finder = LibraryFinder(find, FakeProfile, FakeRetrievalError)
    answer = finder.find(TrailerQuery("Джентльмены", "The Gentlemen", 2024, 2))
    assert answer == TrailerAnswer(None, None, 0.0, "ru language; season 2 fallback")


def test_library_adapter_maps_error() -> None:
    def find(profile: Any) -> FakePick:
        raise FakeRetrievalError(f"all queries failed for {profile.ru_title}")

    finder = LibraryFinder(find, FakeProfile, FakeRetrievalError)
    with pytest.raises(SearchFailed, match="all queries failed for Зверь"):
        finder.find(TrailerQuery("Зверь", "", None))


def test_library_adapter_passes_other_errors() -> None:
    def find(profile: Any) -> FakePick:
        raise KeyError(profile.ru_title)

    finder = LibraryFinder(find, FakeProfile, FakeRetrievalError)
    with pytest.raises(KeyError):
        finder.find(TrailerQuery("Зверь", "", None))


def test_main_binds_loopback() -> None:
    servers: list[ThreadingHTTPServer] = []

    def run(server: ThreadingHTTPServer) -> None:
        servers.append(server)
        server.server_close()

    main(["--port", "0"], finder=FakeFinder(), run=run)
    assert servers[0].server_address[0] == "127.0.0.1"


def test_main_default_port() -> None:
    ports: list[int] = []

    def run(server: ThreadingHTTPServer) -> None:
        ports.append(server.server_address[1])
        server.server_close()

    try:
        main([], finder=FakeFinder(), run=run)
    except OSError as err:  # порт 9118 занят на машине разработчика — тест о другом
        pytest.skip(f"127.0.0.1:9118 занят: {err}")
    assert ports == [9118]
