"""HTTP-сервис трейлеров на приставке (spec trailer-search-service, design.md решения 2–5).

`GET /trailer?title=…&original_title=…&year=…&season=…&series=0|1` → русский трейлер с YouTube,
выбранный библиотекой `trailer-search`: 200 с роликом или `video_id: null` (и когда вместо сезона
`season` нашёлся только другой), 400 на неверный запрос и на профиль, отвергнутый библиотекой,
502 при неудачном поиске (с ERROR в логе). Успешные ответы кэшируются в памяти на 24 часа.
Слушает только 127.0.0.1:9118 — клиент один, плагин Lampa на той же приставке.

Запуск в chroot: `/opt/trailer-search/venv/bin/python /opt/trailer-search/trailer_service.py`
(tools/start.d/trailer-search.sh). Библиотека импортируется только в `main()`, поэтому модуль
и его тесты грузятся без неё.
"""

import argparse
import json
import logging
import threading
import time
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Protocol
from urllib.parse import parse_qs, urlsplit

HOST = "127.0.0.1"
PORT = 9118
CACHE_TTL_S = 24 * 60 * 60

log = logging.getLogger("trailer_service")


@dataclass(frozen=True)
class TrailerQuery:
    title: str
    original_title: str
    year: int | None
    season: int | None = None
    series: bool | None = None


@dataclass(frozen=True)
class TrailerAnswer:
    video_id: str | None
    title: str | None
    confidence: float
    reason: str


class SearchFailed(Exception):
    """Поиск на YouTube не удался — это не «ролик не найден»."""


class BadRequest(ValueError):
    """Запрос без `title`, с нечисловым `year`, `season` не от 1, `series` не 0/1 или профиль,
    отвергнутый библиотекой (`season` с `series=0`)."""


class TrailerFinder(Protocol):
    def find(self, query: TrailerQuery) -> TrailerAnswer: ...


def _int_param(
    params: dict[str, list[str]], name: str, minimum: int, maximum: int | None = None
) -> int | None:
    raw = params.get(name, [""])[0].strip()
    if not raw:
        return None
    too_big = maximum is not None and raw.isdecimal() and int(raw) > maximum
    if not raw.isdecimal() or int(raw) < minimum or too_big:
        bounds = f">= {minimum}" if maximum is None else f"in {minimum}..{maximum}"
        raise BadRequest(f"{name} must be an integer {bounds}, got {raw!r}")
    return int(raw)


def parse_query(raw: str) -> TrailerQuery:
    params = parse_qs(raw)
    title = params.get("title", [""])[0].strip()
    if not title:
        raise BadRequest("title is required")
    original = params.get("original_title", [""])[0].strip()
    series = _int_param(params, "series", 0, maximum=1)
    return TrailerQuery(
        title,
        original,
        _int_param(params, "year", 0),
        _int_param(params, "season", 1),
        None if series is None else bool(series),
    )


class CachedFinder:
    """Кэш успешных ответов (и с роликом, и с `video_id: null`); `SearchFailed` не кэшируется."""

    def __init__(self, finder: TrailerFinder, clock: Callable[[], float], ttl_s: float) -> None:
        self._finder = finder
        self._clock = clock
        self._ttl_s = ttl_s
        self._lock = threading.Lock()
        self._entries: dict[TrailerQuery, tuple[float, TrailerAnswer]] = {}

    def find(self, query: TrailerQuery) -> TrailerAnswer:
        with self._lock:
            hit = self._entries.get(query)
        if hit and self._clock() - hit[0] < self._ttl_s:
            return hit[1]
        answer = self._finder.find(query)
        with self._lock:
            self._entries[query] = (self._clock(), answer)
        return answer


def build_server(
    finder: TrailerFinder, clock: Callable[[], float], port: int = PORT
) -> ThreadingHTTPServer:
    cached = CachedFinder(finder, clock, CACHE_TTL_S)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            url = urlsplit(self.path)
            if url.path != "/trailer":
                self._send(404, {"error": "not found", "detail": url.path})
                return
            try:
                query = parse_query(url.query)
                answer = cached.find(query)
            except BadRequest as err:
                self._send(400, {"error": "bad request", "detail": str(err)})
                return
            except SearchFailed as err:
                log.exception(
                    "search failed: title=%r original_title=%r year=%s season=%s series=%s: %s",
                    query.title,
                    query.original_title,
                    query.year,
                    query.season,
                    query.series,
                    err,
                )
                self._send(502, {"error": "search failed", "detail": str(err)})
                return
            self._send(200, asdict(answer))

        def _send(self, status: int, body: dict[str, Any]) -> None:
            data = json.dumps(body, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            # Без него WebView не отдаёт ответ странице Lampa (http://lampa.mx): status 0.
            # «*» — сервис только на loopback и отдаёт публичные данные YouTube.
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 — сигнатура базового класса
            log.info("%s %s", self.address_string(), format % args)

    return ThreadingHTTPServer((HOST, port), Handler)


class LibraryFinder:
    """Адаптер `trailer-search`: `find(FilmProfile) -> TrailerPick`, `error_cls` → `SearchFailed`,
    `ValueError` конструктора профиля (противоречивый запрос) → `BadRequest`.

    Ролик другого сезона вместо запрошенного — не ответ: `video_id: null` с причиной библиотеки.
    """

    def __init__(
        self,
        find: Callable[[Any], Any],
        profile_cls: Callable[..., Any],
        error_cls: type[Exception],
    ) -> None:
        self._find = find
        self._profile_cls = profile_cls
        self._error_cls = error_cls

    def find(self, query: TrailerQuery) -> TrailerAnswer:
        try:
            profile = self._profile_cls(
                query.title,
                query.original_title,
                query.year,
                season=query.season,
                series=query.series,
            )
        except ValueError as err:
            raise BadRequest(str(err)) from err
        try:
            pick = self._find(profile)
        except self._error_cls as err:
            raise SearchFailed(str(err)) from err
        # Замену сезона v0.2.0 отдаёт только текстом reason; структурно — ekolvah/trailer-search#9.
        if query.season is not None and pick.reason.endswith(f"; season {query.season} fallback"):
            log.warning(
                "no season %d trailer for %r, not answering with %r: %s",
                query.season,
                query.title,
                pick.title,
                pick.reason,
            )
            return TrailerAnswer(None, None, 0.0, pick.reason)
        return TrailerAnswer(pick.video_id, pick.title, pick.confidence, pick.reason)


def _library() -> TrailerFinder:
    from trailer_search import FilmProfile, TrailerRetrievalError, find_trailer
    from trailer_search.ytdlp import YtDlpRetriever

    # deadline_s=8 < таймаута плагина 10 с: при зависшем YouTube сервис успевает ответить 502
    # (design.md, решение 7).
    retriever = YtDlpRetriever(socket_timeout=4, deadline_s=8)
    return LibraryFinder(
        lambda profile: find_trailer(profile, retriever), FilmProfile, TrailerRetrievalError
    )


def _serve(server: ThreadingHTTPServer) -> None:
    try:
        server.serve_forever()
    finally:
        server.server_close()


def main(
    argv: Sequence[str] | None = None,
    finder: TrailerFinder | None = None,
    run: Callable[[ThreadingHTTPServer], None] | None = None,
) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=PORT)
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    server = build_server(finder or _library(), time.monotonic, args.port)
    log.info("listening on %s:%s", server.server_address[0], server.server_address[1])
    (run or _serve)(server)


if __name__ == "__main__":
    main()
