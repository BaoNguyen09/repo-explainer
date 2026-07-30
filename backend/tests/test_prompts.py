"""Tests for prompt parsing helpers."""

from backend.prompts import SUGGEST_QUESTIONS_SYSTEM, SYSTEM_PROMPT, parse_questions_from_response


def test_system_prompt_forbids_reserved_words_as_mermaid_node_ids():
    """Regression guard for the mermaid-hardening fix: reserved words (end, style,
    class, etc.) used as bare node IDs reliably break the real mermaid parser."""
    assert "end, default" in SYSTEM_PROMPT
    assert "style, linkStyle, classDef, class" in SYSTEM_PROMPT


def test_system_prompt_forbids_nested_double_quotes_in_mermaid_labels():
    assert "Never put a literal double quote inside a double-quoted label" in SYSTEM_PROMPT


def test_system_prompt_requires_double_percent_for_mermaid_comments():
    assert "Comments (if any) must start with %%, never a single %." in SYSTEM_PROMPT


def test_suggest_questions_system_caps_question_length_at_ten_words():
    assert "10 words or fewer" in SUGGEST_QUESTIONS_SYSTEM


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
