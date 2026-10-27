import asyncio

from homepage_api.cache import CachedSource


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


async def test_cache_serves_fresh_value_without_refetch():
    clock = Clock()
    calls = 0

    async def fetch():
        nonlocal calls
        calls += 1
        return calls

    source = CachedSource(fetch, ttl=10, clock=clock)
    assert await source.get() == 1
    clock.now = 9
    assert await source.get() == 1
    assert calls == 1
    clock.now = 10
    assert await source.get() == 2


async def test_cache_serves_stale_until_twice_ttl_then_none():
    clock = Clock()
    fail = False

    async def fetch():
        if fail:
            raise RuntimeError("upstream down")
        return "good"

    source = CachedSource(fetch, ttl=10, clock=clock)
    assert await source.get() == "good"
    fail = True
    clock.now = 11
    assert await source.get() == "good"
    clock.now = 19.9
    assert await source.get() == "good"
    clock.now = 21
    assert await source.get() is None


async def test_cache_recovers_after_failure():
    clock = Clock()
    fail = False

    async def fetch():
        if fail:
            raise RuntimeError("upstream down")
        return clock.now

    source = CachedSource(fetch, ttl=10, clock=clock)
    assert await source.get() == 0
    fail = True
    clock.now = 25
    assert await source.get() is None
    fail = False
    clock.now = 26
    assert await source.get() == 26


async def test_cache_single_flight():
    calls = 0
    release = asyncio.Event()

    async def fetch():
        nonlocal calls
        calls += 1
        await release.wait()
        return "v"

    source = CachedSource(fetch, ttl=10)
    tasks = [asyncio.create_task(source.get()) for _ in range(5)]
    await asyncio.sleep(0)
    release.set()
    assert await asyncio.gather(*tasks) == ["v"] * 5
    assert calls == 1


async def test_cache_single_flight_shares_failure():
    calls = 0

    async def fetch():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0)
        raise RuntimeError("boom")

    source = CachedSource(fetch, ttl=10)
    results = await asyncio.gather(*(source.get() for _ in range(5)))
    assert results == [None] * 5
    assert calls == 1


async def test_cache_none_result_is_cached_for_ttl():
    clock = Clock()
    calls = 0

    async def fetch():
        nonlocal calls
        calls += 1
        return None

    source = CachedSource(fetch, ttl=10, clock=clock)
    assert await source.get() is None
    clock.now = 5
    assert await source.get() is None
    assert calls == 1


async def test_cache_none_result_replaces_old_value():
    clock = Clock()
    values = ["first", None]

    async def fetch():
        return values.pop(0)

    source = CachedSource(fetch, ttl=10, clock=clock)
    assert await source.get() == "first"
    clock.now = 11
    assert await source.get() is None


async def test_cache_failure_is_logged_at_warning(caplog):
    async def fetch():
        raise RuntimeError("boom")

    source = CachedSource(fetch, ttl=10, name="music")
    with caplog.at_level("WARNING"):
        assert await source.get() is None
    records = [r for r in caplog.records if r.levelname == "WARNING"]
    assert len(records) == 1
    assert "music" in records[0].getMessage()
    assert records[0].exc_info is None
