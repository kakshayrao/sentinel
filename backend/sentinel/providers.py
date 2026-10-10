"""Model providers: any OpenAI-compatible server (Ollama, LM Studio, llama.cpp, vLLM, ...)
plus an offline random baseline. Streaming is used so time-to-first-token and
tokens/second can be measured."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import random
import re
import time
from dataclasses import dataclass
from typing import AsyncIterator

import httpx

from .models import DiscoveredServer, Model

TIMEOUT = httpx.Timeout(connect=5.0, read=600.0, write=30.0, pool=30.0)

# Common local servers and their default OpenAI-compatible endpoints.
KNOWN_SERVERS = [
    ("Ollama", "http://localhost:11434/v1"),
    ("LM Studio", "http://localhost:1234/v1"),
    ("llama.cpp", "http://localhost:8080/v1"),
    ("vLLM", "http://localhost:8000/v1"),
    ("Jan", "http://localhost:1337/v1"),
    ("text-generation-webui", "http://localhost:5000/v1"),
]


class ProviderError(Exception):
    pass


@dataclass
class Completion:
    text: str
    latency_ms: int
    ttft_ms: int | None
    output_tokens: int
    tokens_estimated: bool

    @property
    def tokens_per_sec(self) -> float | None:
        gen_ms = self.latency_ms - (self.ttft_ms or 0)
        if self.output_tokens <= 0 or gen_ms <= 0:
            return None
        return self.output_tokens / (gen_ms / 1000)


def estimate_tokens(text: str) -> int:
    return max(1, round(len(text) / 4)) if text else 0


class OpenAICompatible:
    def __init__(self, base_url: str, model: str, api_key: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}

    async def stream(self, messages: list[dict], *, temperature: float, max_tokens: int) -> AsyncIterator[dict]:
        """Yields {"delta": str} chunks, then {"usage": {...}} if the server reports it."""
        body = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                async with client.stream(
                    "POST", f"{self.base_url}/chat/completions", json=body, headers=self.headers
                ) as res:
                    if res.status_code >= 400:
                        detail = (await res.aread()).decode(errors="replace")[:300]
                        raise ProviderError(f"HTTP {res.status_code} from {self.base_url}: {detail}")
                    async for line in res.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        if chunk.get("error"):
                            raise ProviderError(str(chunk["error"])[:300])
                        for choice in chunk.get("choices") or []:
                            delta = (choice.get("delta") or {}).get("content")
                            if delta:
                                yield {"delta": delta}
                        if chunk.get("usage"):
                            yield {"usage": chunk["usage"]}
        except httpx.ConnectError as e:
            raise ProviderError(f"Cannot reach {self.base_url}. Is the model server running?") from e
        except httpx.TimeoutException as e:
            raise ProviderError(f"Timed out waiting for {self.base_url}") from e
        except httpx.HTTPError as e:
            raise ProviderError(f"{type(e).__name__}: {e}") from e

    async def complete(self, messages: list[dict], *, temperature: float, max_tokens: int) -> Completion:
        start = time.perf_counter()
        first: float | None = None
        parts: list[str] = []
        usage: dict | None = None
        async for event in self.stream(messages, temperature=temperature, max_tokens=max_tokens):
            if "delta" in event:
                if first is None:
                    first = time.perf_counter()
                parts.append(event["delta"])
            else:
                usage = event["usage"]
        end = time.perf_counter()
        text = "".join(parts)
        tokens = (usage or {}).get("completion_tokens")
        return Completion(
            text=text,
            latency_ms=round((end - start) * 1000),
            ttft_ms=round((first - start) * 1000) if first else None,
            output_tokens=tokens if isinstance(tokens, int) else estimate_tokens(text),
            tokens_estimated=not isinstance(tokens, int),
        )


class RandomBaseline:
    """Offline reference model. Picks random options and numbers, so its scores show the
    chance floor of each benchmark. Lets the whole app be tried without a model server."""

    def __init__(self, seed: str = "random-baseline"):
        self.seed = seed  # different baselines answer differently, the same baseline is reproducible

    def _reply(self, messages: list[dict]) -> str:
        prompt = messages[-1]["content"] if messages else ""
        rng = random.Random(hashlib.sha256(f"{self.seed}:{prompt}".encode()).hexdigest())
        letters = re.findall(r"^([A-J])\. ", prompt, flags=re.M)
        if letters:
            return f"Answer: {rng.choice(letters)}"
        if re.search(r"Answer: <number>|final answer", prompt, flags=re.I):
            return f"Let me work through it.\nAnswer: {rng.randint(1, 100)}"
        if "```python" in prompt or "Python function" in prompt:
            return "```python\npass\n```"
        words = re.findall(r"[A-Za-z]{4,}", prompt)
        rng.shuffle(words)
        return "This is a random baseline response. " + " ".join(words[:25])

    async def stream(self, messages: list[dict], *, temperature: float, max_tokens: int) -> AsyncIterator[dict]:
        await asyncio.sleep(0.15)
        words = self._reply(messages).split(" ")
        for i, word in enumerate(words):
            await asyncio.sleep(0.012)
            yield {"delta": word if i == 0 else " " + word}
        yield {"usage": {"completion_tokens": len(words)}}

    async def complete(self, messages: list[dict], *, temperature: float, max_tokens: int) -> Completion:
        start = time.perf_counter()
        first = None
        parts = []
        tokens = 0
        async for event in self.stream(messages, temperature=temperature, max_tokens=max_tokens):
            if "delta" in event:
                first = first or time.perf_counter()
                parts.append(event["delta"])
            else:
                tokens = event["usage"]["completion_tokens"]
        end = time.perf_counter()
        return Completion(
            text="".join(parts),
            latency_ms=round((end - start) * 1000),
            ttft_ms=round((first - start) * 1000) if first else None,
            output_tokens=tokens,
            tokens_estimated=False,
        )


Provider = OpenAICompatible | RandomBaseline


def build_provider(model: Model) -> Provider:
    if model.kind == "baseline":
        return RandomBaseline(model.model or model.id)
    if not model.base_url or not model.model:
        raise ProviderError("Model needs a base URL and a model id")
    api_key = None
    if model.api_key_env:
        api_key = os.environ.get(model.api_key_env)
        if not api_key:
            raise ProviderError(f"Environment variable {model.api_key_env} is not set")
    return OpenAICompatible(model.base_url, model.model, api_key)


async def list_server_models(base_url: str, timeout: float = 3.0) -> list[str]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.get(f"{base_url.rstrip('/')}/models")
        res.raise_for_status()
        data = res.json()
    return sorted(m["id"] for m in data.get("data", []) if isinstance(m, dict) and "id" in m)


async def discover() -> list[DiscoveredServer]:
    """Find local OpenAI-compatible servers that answer GET /models."""

    async def probe(name: str, url: str) -> DiscoveredServer | None:
        try:
            return DiscoveredServer(name=name, base_url=url, models=await list_server_models(url, timeout=1.5))
        except Exception:
            return None

    found = await asyncio.gather(*(probe(n, u) for n, u in KNOWN_SERVERS))
    return [s for s in found if s]
