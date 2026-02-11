"""
AI provider package for repo-explainer.

Callers should normally use `backend.ai_service` rather than importing providers
directly. This package groups provider-specific implementations.
"""

from .providers.base import LLMProvider  # re-export for typing convenience

__all__ = ["LLMProvider"]

