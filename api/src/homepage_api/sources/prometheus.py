import asyncio
import math
from datetime import datetime

import httpx

from homepage_api.models import Server
from homepage_api.settings import Settings

JOB = 'job="host-monitoring"'
LOAD_QUERY = f"node_load1{{{JOB}}}"
CPU_QUERY = f'1 - avg(rate(node_cpu_seconds_total{{{JOB},mode="idle"}}[1m]))'
MEM_QUERY = f"1 - node_memory_MemAvailable_bytes{{{JOB}}} / node_memory_MemTotal_bytes{{{JOB}}}"
UPTIME_QUERY = f"time() - node_boot_time_seconds{{{JOB}}}"
HISTORY_WINDOW_S = 1800
HISTORY_STEP_S = 60
HISTORY_POINTS = 30


async def fetch_server(client: httpx.AsyncClient, settings: Settings, now: datetime) -> Server:
    base = settings.prometheus_url.rstrip("/")
    end = now.timestamp()
    results = await asyncio.gather(
        _instant(client, base, LOAD_QUERY),
        _instant(client, base, CPU_QUERY),
        _instant(client, base, MEM_QUERY),
        _instant(client, base, UPTIME_QUERY),
        _range(client, base, CPU_QUERY, end - HISTORY_WINDOW_S, end),
        return_exceptions=True,
    )
    for result in results:
        if isinstance(result, BaseException):
            raise result
    load1, cpu, mem, uptime, history = results
    return Server(
        load1=round(load1, 2),
        cpu_pct=round(cpu * 100, 1),
        mem_pct=round(mem * 100, 1),
        uptime_s=int(uptime),
        cpu_history=[round(v * 100, 1) for v in history if math.isfinite(v)][-HISTORY_POINTS:],
    )


async def _instant(client: httpx.AsyncClient, base: str, query: str) -> float:
    series = await _get(client, f"{base}/api/v1/query", {"query": query})
    value = float(series[0]["value"][1])
    if not math.isfinite(value):
        raise RuntimeError("Prometheus returned a non-finite sample")
    return value


async def _range(
    client: httpx.AsyncClient, base: str, query: str, start: float, end: float
) -> list[float]:
    series = await _get(
        client,
        f"{base}/api/v1/query_range",
        {"query": query, "start": start, "end": end, "step": HISTORY_STEP_S},
    )
    return [float(point[1]) for point in series[0]["values"]]


async def _get(client: httpx.AsyncClient, url: str, params: dict) -> list[dict]:
    try:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        body = resp.json()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(f"Prometheus HTTP {exc.response.status_code}") from None
    except (httpx.HTTPError, ValueError) as exc:
        raise RuntimeError(f"Prometheus request failed: {type(exc).__name__}") from None
    if body.get("status") != "success":
        raise RuntimeError(f"Prometheus query failed: {body.get('errorType', 'unknown')}")
    series = body.get("data", {}).get("result") or []
    if not series:
        raise RuntimeError("Prometheus returned no data")
    return series
