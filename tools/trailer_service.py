"""HTTP-сервис трейлеров на приставке (spec trailer-search-service). Заглушка RED."""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Protocol


@dataclass(frozen=True)
class TrailerQuery:
    title: str
    original_title: str
    year: int | None


@dataclass(frozen=True)
class TrailerAnswer:
    video_id: str | None
    title: str | None
    confidence: float
    reason: str


class SearchFailed(Exception):
    """Поиск на YouTube не удался."""


class TrailerFinder(Protocol):
    def find(self, query: TrailerQuery) -> TrailerAnswer: ...


def build_server(
    finder: TrailerFinder, clock: Callable[[], float], port: int = 9118
) -> ThreadingHTTPServer:
    class Stub(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            self.send_response(501)
            self.end_headers()
            self.wfile.write(b'{"error": "not implemented"}')

    return ThreadingHTTPServer(("127.0.0.1", port), Stub)


def library_finder(find: Callable[[Any], Any], profile_cls: Any, error_cls: Any) -> TrailerFinder:
    raise NotImplementedError


def main(
    argv: Sequence[str] | None = None,
    finder: TrailerFinder | None = None,
    run: Callable[[ThreadingHTTPServer], None] | None = None,
) -> None:
    raise NotImplementedError
