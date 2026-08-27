"""
Security-critical regression tests. These target the highest-value
checks from the Phase 5 spec: path traversal, resource limit
enforcement, and JWT auth — the things a future edit could silently
break without anyone noticing until it's a real vulnerability.

Run with: pytest tests/test_security.py -v
(from inside backend/, with the venv active)
"""

import os
import sys
import pytest
import jwt as pyjwt

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from routes.files import _safe_path
from services.docker_manager import (
    clamp_resources, MAX_MEMORY_MB, MAX_STORAGE_MB,
    MIN_MEMORY_MB, MIN_STORAGE_MB, MAX_CPU, MIN_CPU,
)
from utils.auth_utils import generate_token, decode_token
import utils.auth_utils as auth_utils


class TestPathTraversal:
    """The single most important security guarantee in files.py: a
    project can never read/write outside its own workspace folder."""

    def test_normal_path_allowed(self):
        result = _safe_path("project123", "app.py")
        assert result.endswith(os.path.join("project123", "app.py"))

    def test_nested_path_allowed(self):
        result = _safe_path("project123", "src/utils/helper.py")
        assert "project123" in result

    def test_simple_traversal_blocked(self):
        with pytest.raises(ValueError):
            _safe_path("project123", "../../../etc/passwd")

    def test_traversal_with_valid_prefix_blocked(self):
        with pytest.raises(ValueError):
            _safe_path("project123", "subdir/../../other_project/secret.py")

    def test_windows_style_traversal_blocked(self):
        with pytest.raises(ValueError):
            _safe_path("project123", "..\\..\\..\\Windows\\System32")

    def test_cannot_reach_sibling_projects_folder(self):
        # Even if a caller tries to reference another project's ID
        # directly via traversal, it must not resolve outside project123.
        with pytest.raises(ValueError):
            _safe_path("project123", "../project456/secret.py")


class TestResourceClamping:
    """The 512MB memory/storage ceiling must be enforced in code, not
    just trusted from whatever the frontend slider happens to send."""

    def test_normal_values_pass_through(self):
        cpu, mem, storage = clamp_resources(2, 256, 256)
        assert cpu == 2
        assert mem == 256
        assert storage == 256

    def test_memory_above_max_is_clamped(self):
        _, mem, _ = clamp_resources(1, 999999, 256)
        assert mem == MAX_MEMORY_MB

    def test_storage_above_max_is_clamped(self):
        _, _, storage = clamp_resources(1, 256, 999999)
        assert storage == MAX_STORAGE_MB

    def test_memory_below_min_is_clamped(self):
        _, mem, _ = clamp_resources(1, 1, 256)
        assert mem == MIN_MEMORY_MB

    def test_cpu_above_max_is_clamped(self):
        cpu, _, _ = clamp_resources(999, 256, 256)
        assert cpu == MAX_CPU

    def test_cpu_below_min_is_clamped(self):
        cpu, _, _ = clamp_resources(0, 256, 256)
        assert cpu == MIN_CPU

    def test_negative_values_are_clamped_not_crashed(self):
        cpu, mem, storage = clamp_resources(-5, -100, -100)
        assert cpu == MIN_CPU
        assert mem == MIN_MEMORY_MB
        assert storage == MIN_STORAGE_MB


class TestAuthTokens:
    """Every protected route ultimately depends on this being correct."""

    def test_generate_and_decode_roundtrip(self):
        token = generate_token("user123")
        payload = decode_token(token)
        assert payload["userId"] == "user123"

    def test_tampered_token_rejected(self):
        token = generate_token("user123")
        tampered = token[:-2] + "xx"
        with pytest.raises(pyjwt.InvalidTokenError):
            decode_token(tampered)

    def test_expired_token_rejected(self, monkeypatch):
        monkeypatch.setattr(auth_utils, "JWT_EXPIRES_HOURS", -1)
        token = generate_token("user123")
        with pytest.raises(pyjwt.ExpiredSignatureError):
            decode_token(token)