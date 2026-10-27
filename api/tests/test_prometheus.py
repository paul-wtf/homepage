import logging
import math
from datetime import UTC, datetime

import httpx
import pytest
import respx

from homepage_api.settings import Settings
from homepage_api.sources.prometheus import fetch_server

BASE = "http://monitoring-kube-prometheus-prometheus.monitoring:9090"
NOW = datetime(2026, 10, 27, 9, 0, tzinfo=UTC)
CPU_EXPR = '1 - avg(rate(node_cpu_seconds_total{job="host-monitoring",mode="idle"}[1m]))'


def vector(value: str) -> dict:
    return {
        "status": "success",
        "data": {"resultType": "vector", "result": [{"metric": {}, "value": [1.0, value]}]},
    }


def matrix(values: list[str]) -> dict:
    points = [[1.0 + i * 60, v] for i, v in enumerate(values)]
    return {
        "status": "success",
        "data": {"resultType": "matrix", "result": [{"metric": {}, "values": points}]},
    }


EMPTY = {"status": "success", "data": {"resultType": "vector", "result": []}}
INSTANT = {
    "node_load1": vector("0.456"),
    CPU_EXPR: vector("0.1234"),
    "node_memory_MemAvailable_bytes": vector("0.4567"),
    "node_boot_time_seconds": vector("86400.7"),
}


def wire(respx_mock: respx.MockRouter, instant: dict | None = None, history: dict | None = None):
    answers = instant or INSTANT

    def instant_handler(request: httpx.Request) -> httpx.Response:
        query = request.url.params["query"]
        for needle, body in answers.items():
            if needle in query:
                return httpx.Response(200, json=body)
        raise AssertionError(f"unexpected query {query}")

    instant_route = respx_mock.get(f"{BASE}/api/v1/query").mock(side_effect=instant_handler)
    range_route = respx_mock.get(f"{BASE}/api/v1/query_range").mock(
        return_value=httpx.Response(
            200, json=history or matrix([str(i / 100) for i in range(1, 32)])
        )
    )
    return instant_route, range_route


async def run(settings: Settings):
    async with httpx.AsyncClient(timeout=3.0) as client:
        return await fetch_server(client, settings, NOW)


async def test_server_values(respx_mock, settings):
    instant_route, range_route = wire(respx_mock)
    server = await run(settings)
    assert instant_route.call_count == 4
    assert range_route.call_count == 1
    assert server is not None
    assert server.load1 == 0.46
    assert server.cpu_pct == 12.3
    assert server.mem_pct == 45.7
    assert server.uptime_s == 86400
    assert len(server.cpu_history) == 30
    assert server.cpu_history[-1] == 31.0
    assert server.cpu_history[0] == 2.0


async def test_server_range_query_covers_last_30_minutes(respx_mock, settings):
    _, range_route = wire(respx_mock)
    await run(settings)
    params = range_route.calls.last.request.url.params
    assert params["query"] == CPU_EXPR
    assert params["step"] == "60"
    assert float(params["end"]) == NOW.timestamp()
    assert float(params["end"]) - float(params["start"]) == 1800


async def test_server_queries_filter_on_job(respx_mock, settings):
    instant_route, range_route = wire(respx_mock)
    await run(settings)
    queries = [c.request.url.params["query"] for c in instant_route.calls]
    queries += [c.request.url.params["query"] for c in range_route.calls]
    assert len(queries) == 5
    for query in queries:
        assert 'job="host-monitoring"' in query


async def test_server_queries_match_spec(respx_mock, settings):
    instant_route, _ = wire(respx_mock)
    await run(settings)
    queries = {c.request.url.params["query"] for c in instant_route.calls}
    assert queries == {
        'node_load1{job="host-monitoring"}',
        CPU_EXPR,
        '1 - node_memory_MemAvailable_bytes{job="host-monitoring"}'
        ' / node_memory_MemTotal_bytes{job="host-monitoring"}',
        'time() - node_boot_time_seconds{job="host-monitoring"}',
    }


@pytest.mark.parametrize("broken", ["node_load1", CPU_EXPR, "node_memory", "node_boot_time"])
async def test_server_empty_vector_fails_whole_server(respx_mock, settings, broken):
    answers = {k: v for k, v in INSTANT.items()}
    key = next(k for k in answers if broken in k)
    answers[key] = EMPTY
    wire(respx_mock, instant=answers)
    with pytest.raises(RuntimeError, match="no data"):
        await run(settings)


async def test_server_empty_history_fails_whole_server(respx_mock, settings):
    wire(
        respx_mock,
        history={"status": "success", "data": {"resultType": "matrix", "result": []}},
    )
    with pytest.raises(RuntimeError, match="no data"):
        await run(settings)


async def test_server_http_error_raises_without_url(respx_mock, settings):
    respx_mock.get(f"{BASE}/api/v1/query").mock(return_value=httpx.Response(503))
    respx_mock.get(f"{BASE}/api/v1/query_range").mock(return_value=httpx.Response(503))
    with pytest.raises(RuntimeError, match="HTTP 503") as info:
        await run(settings)
    assert "monitoring" not in str(info.value)


async def test_server_timeout_raises(respx_mock, settings):
    respx_mock.get(f"{BASE}/api/v1/query").mock(side_effect=httpx.ConnectTimeout("slow"))
    respx_mock.get(f"{BASE}/api/v1/query_range").mock(side_effect=httpx.ConnectTimeout("slow"))
    with pytest.raises(RuntimeError, match="ConnectTimeout"):
        await run(settings)


async def test_server_error_status_raises(respx_mock, settings):
    body = {"status": "error", "errorType": "bad_data", "error": "parse error"}
    respx_mock.get(f"{BASE}/api/v1/query").mock(return_value=httpx.Response(200, json=body))
    respx_mock.get(f"{BASE}/api/v1/query_range").mock(return_value=httpx.Response(200, json=body))
    with pytest.raises(RuntimeError, match="bad_data"):
        await run(settings)


async def test_server_non_json_raises(respx_mock, settings):
    respx_mock.get(f"{BASE}/api/v1/query").mock(return_value=httpx.Response(200, text="<html>"))
    respx_mock.get(f"{BASE}/api/v1/query_range").mock(
        return_value=httpx.Response(200, text="<html>")
    )
    with pytest.raises(RuntimeError, match="request failed"):
        await run(settings)


async def test_server_nan_sample_raises(respx_mock, settings):
    answers = {**INSTANT, CPU_EXPR: vector("NaN")}
    wire(respx_mock, instant=answers)
    with pytest.raises(RuntimeError, match="non-finite"):
        await run(settings)


async def test_server_history_drops_non_finite_points(respx_mock, settings):
    values = [str(i / 100) for i in range(1, 32)]
    values[5] = "NaN"
    wire(respx_mock, history=matrix(values))
    server = await run(settings)
    assert server is not None
    assert all(math.isfinite(v) for v in server.cpu_history)
    assert len(server.cpu_history) == 30
    assert 6.0 not in server.cpu_history


async def test_status_server_null_when_exporter_down(client, respx_mock):
    respx_mock.get("https://ws.audioscrobbler.com/2.0/").mock(return_value=httpx.Response(500))
    respx_mock.get(f"{BASE}/api/v1/query").mock(return_value=httpx.Response(200, json=EMPTY))
    respx_mock.get(f"{BASE}/api/v1/query_range").mock(return_value=httpx.Response(200, json=EMPTY))
    resp = await client.get("/api/status")
    assert resp.status_code == 200
    assert resp.json()["server"] is None


async def test_status_returns_server(client, respx_mock):
    respx_mock.get("https://ws.audioscrobbler.com/2.0/").mock(return_value=httpx.Response(500))
    wire(respx_mock)
    body = (await client.get("/api/status")).json()
    assert body["server"]["cpu_pct"] == 12.3
    assert len(body["server"]["cpu_history"]) == 30


async def test_status_logs_no_url_on_prometheus_failure(client, respx_mock, caplog):
    respx_mock.get("https://ws.audioscrobbler.com/2.0/").mock(return_value=httpx.Response(500))
    respx_mock.get(f"{BASE}/api/v1/query").mock(return_value=httpx.Response(503))
    respx_mock.get(f"{BASE}/api/v1/query_range").mock(return_value=httpx.Response(503))
    with caplog.at_level(logging.DEBUG):
        await client.get("/api/status")
    warnings = [r.getMessage() for r in caplog.records if r.levelname == "WARNING"]
    assert any(m.startswith("server fetch failed") for m in warnings)
    assert "monitoring-kube-prometheus" not in caplog.text
