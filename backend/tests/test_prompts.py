"""Tests for prompt parsing helpers."""

from backend.prompts import parse_questions_from_response


def test_parse_questions_from_response_strips_numbering_and_bullets():
    text = "1. How does routing work?\n- Where is auth handled?\n* Explain the test setup"
    assert parse_questions_from_response(text) == [
        "How does routing work?",
        "Where is auth handled?",
        "Explain the test setup",
    ]


def test_parse_questions_from_response_caps_at_three():
    text = "\n".join(f"Question {i}?" for i in range(5))
    assert len(parse_questions_from_response(text)) == 3


def test_parse_questions_from_response_empty_input():
    assert parse_questions_from_response("") == []
    assert parse_questions_from_response("   \n  ") == []
