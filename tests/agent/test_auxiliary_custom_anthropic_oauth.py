"""Auxiliary clients for a custom provider on api.anthropic.com carry the Claude Code OAuth identity.

Anthropic answers a subscription (OAuth) request without the Claude Code system prefix with
``429 rate_limit_error "Error"`` even when the plan has quota left. The credential pool reads that
as exhaustion and cools every Anthropic credential down for an hour, which takes vision, titles
and every other auxiliary task down with it. A named custom provider pointed at the native host
(``providers.<name>.api: https://api.anthropic.com``) must therefore send the same identity as
the built-in ``anthropic`` provider, while API keys and third-party Anthropic-protocol hosts
must not.
"""

from pathlib import Path

import pytest

import agent.process_bootstrap  # import-time bootstrap runs before the home guard is active
from agent.anthropic_adapter import _CLAUDE_CODE_SYSTEM_PREFIX


@pytest.fixture(autouse=True)
def profile_env(tmp_path, monkeypatch):
    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setattr("agent.process_bootstrap.OpenAI", lambda **kw: type("Stub", (), kw)())
    return home

OAUTH_TOKEN = "sk-ant-oat01-" + "x" * 40
CONSOLE_KEY = "sk-ant-api03-" + "x" * 40
IMAGE_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"
)


class _Sent(Exception):
    pass


def _system_sent(monkeypatch, *, api_key: str, base_url: str, is_vision: bool = True):
    """Resolve the custom-provider aux client and return the ``system`` it puts on the wire."""
    import agent.anthropic_adapter as adapter
    from agent.auxiliary_client import resolve_provider_client

    captured: dict = {}

    def fake_create(_client, kwargs, *args, **kw):
        captured.update(kwargs)
        raise _Sent

    monkeypatch.setattr(adapter, "create_anthropic_message", fake_create)
    client, model = resolve_provider_client(
        "custom", "claude-opus-5-5", api_mode="anthropic_messages",
        explicit_base_url=base_url, explicit_api_key=api_key, is_vision=is_vision)
    assert client is not None
    with pytest.raises(_Sent):
        client.chat.completions.create(
            model=model, max_tokens=8,
            messages=[{"role": "user", "content": [
                {"type": "text", "text": "Describe the image."},
                {"type": "image_url", "image_url": {"url": IMAGE_PNG}},
            ]}])
    system = captured.get("system") or []
    if isinstance(system, str):
        return system
    return "\n".join(b.get("text", "") for b in system if isinstance(b, dict))


@pytest.mark.parametrize("is_vision", [True, False], ids=["vision", "text"])
def test_custom_native_host_oauth_sends_claude_code_identity(monkeypatch, is_vision):
    system = _system_sent(monkeypatch, api_key=OAUTH_TOKEN, base_url="https://api.anthropic.com",
                          is_vision=is_vision)
    assert system.startswith(_CLAUDE_CODE_SYSTEM_PREFIX)


@pytest.mark.parametrize(
    ("api_key", "base_url"),
    [
        (CONSOLE_KEY, "https://api.anthropic.com"),
        (OAUTH_TOKEN, "https://api.minimax.io/anthropic"),
    ],
    ids=["console-api-key", "third-party-anthropic-host"],
)
def test_identity_stays_off_routes_that_are_not_native_oauth(monkeypatch, api_key, base_url):
    system = _system_sent(monkeypatch, api_key=api_key, base_url=base_url)
    assert _CLAUDE_CODE_SYSTEM_PREFIX not in system
