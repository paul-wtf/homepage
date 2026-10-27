import asyncio
import logging
import time
from collections.abc import Awaitable, Callable

logger = logging.getLogger(__name__)


class CachedSource[T]:
    def __init__(
        self,
        fetch: Callable[[], Awaitable[T | None]],
        ttl: float,
        clock: Callable[[], float] = time.monotonic,
        name: str = "source",
    ) -> None:
        self._fetch = fetch
        self._ttl = ttl
        self._clock = clock
        self._name = name
        self._value: T | None = None
        self._fetched_at: float | None = None
        self._retry_at: float | None = None
        self._inflight: asyncio.Task[T | None] | None = None

    async def get(self) -> T | None:
        if self._fetched_at is not None and self._clock() - self._fetched_at < self._ttl:
            return self._value
        if self._retry_at is not None and self._clock() < self._retry_at:
            return self._stale_value()
        if self._inflight is None:
            self._inflight = asyncio.ensure_future(self._refresh())
        return await asyncio.shield(self._inflight)

    async def _refresh(self) -> T | None:
        try:
            try:
                value = await self._fetch()
            except Exception as exc:
                logger.warning("%s fetch failed: %s: %s", self._name, type(exc).__name__, exc)
                self._retry_at = self._clock() + self._ttl
                return self._stale_value()
            self._retry_at = None
            self._value = value
            self._fetched_at = self._clock()
            return value
        finally:
            self._inflight = None

    def _stale_value(self) -> T | None:
        if self._fetched_at is not None and self._clock() - self._fetched_at < 2 * self._ttl:
            return self._value
        self._value = None
        self._fetched_at = None
        return None
