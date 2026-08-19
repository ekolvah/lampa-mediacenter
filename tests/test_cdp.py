"""Тесты чистой логики tools/cdp.py — разбор batch-формата и форматирование результата.

Не требуют устройства: evaluate()/run_batch() ходят по WebSocket и здесь не проверяются.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

from cdp import format_value, parse_batch  # noqa: E402


def test_parse_batch_splits_named_sections() -> None:
    text = """
--- plugins_before
Lampa.Storage.get('plugins','[]').map(p => p.url)
--- reload
(location.reload(), 'ok')
"""
    assert parse_batch(text) == [
        ("plugins_before", "Lampa.Storage.get('plugins','[]').map(p => p.url)"),
        ("reload", "(location.reload(), 'ok')"),
    ]


def test_parse_batch_keeps_multiline_expression() -> None:
    text = """--- remove
(function(){
  var a = 1;
  return a;
})()
"""
    [(name, js)] = parse_batch(text)
    assert name == "remove"
    assert js == "(function(){\n  var a = 1;\n  return a;\n})()"


def test_parse_batch_rejects_text_without_headers() -> None:
    with pytest.raises(ValueError, match="не найдено ни одного заголовка"):
        parse_batch("Lampa.Storage.get('plugins')")


def test_parse_batch_rejects_empty_expression() -> None:
    with pytest.raises(ValueError, match="пустое"):
        parse_batch("--- a\n--- b\n1\n")


def test_format_value_short_passthrough() -> None:
    assert format_value(["https://example/w"]) == '["https://example/w"]'


def test_format_value_truncates_long_result() -> None:
    value = "x" * 500
    rendered = format_value(value)
    assert rendered.startswith('"' + "x" * 199)
    assert "обрезано" in rendered
    assert "302 симв." in rendered
