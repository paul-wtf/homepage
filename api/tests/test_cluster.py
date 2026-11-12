import json
import logging
import re

import httpx
import pytest
import respx

from homepage_api.settings import Settings
from homepage_api.sources.cluster import QUERIES, fetch_cluster

BASE = "http://monitoring-kube-prometheus-prometheus.monitoring:9090"
GB = 1_000_000_000


def vector(*series: tuple[dict, str]) -> dict:
    return {
        "status": "success",
        "data": {
            "resultType": "vector",
            "result": [{"metric": m, "value": [1.0, v]} for m, v in series],
        },
    }


def scalar(value: str) -> dict:
    return vector(({}, value))


def node(name: str, **labels: str) -> dict:
    return {
        "node": name,
        "instance": "10.0.0.11:8080",
        "internal_ip": "10.0.0.11",
        "pod_cidr": "10.42.0.0/24",
        **labels,
    }


EMPTY = vector()

ANSWERS = {
    "nodes": vector(
        (node("server01", kubelet_version="v1.36.6+rke2r1"), "1"),
        (node("server02", kubelet_version="v1.36.6+rke2r1"), "1"),
        (node("server03", kubelet_version="v1.36.6+rke2r1"), "1"),
    ),
    "ready": vector((node("server01"), "1"), (node("server02"), "1")),
    "pods": scalar("168"),
    "workloads": scalar("75"),
    "services": vector(({"host": "linkhop.example.test"}, "15")),
    "uptime": vector(
        ({"nodename": "server01", "instance": "203.0.113.7:9100"}, "286980.07"),
        ({"nodename": "server02", "instance": "203.0.113.8:9100"}, "283616.5"),
        ({"nodename": "server03", "instance": "203.0.113.9:9100"}, "199955.9"),
    ),
    "used": vector(
        (node("server01"), "153792188416"),
        (node("server02"), "177507315712"),
        (node("server03"), "154977693696"),
    ),
    "capacity": vector(
        (node("server01"), "528343535616"),
        (node("server02"), "316967923712"),
        (node("server03"), "211181367296"),
    ),
    "cpu_temp": vector(({"instance": "203.0.113.1:9100", "chip": "x"}, "75.25")),
    "nvme_temp": scalar("72.85000000000001"),
}


def wire(respx_mock: respx.MockRouter, **over: dict | int | Exception):
    answers = {**ANSWERS, **over}
    by_query = {QUERIES[name]: body for name, body in answers.items()}

    def handler(request: httpx.Request) -> httpx.Response:
        body = by_query.get(request.url.params["query"], 503)
        if isinstance(body, Exception):
            raise body
        if isinstance(body, int):
            return httpx.Response(body)
        return httpx.Response(200, json=body)

    return respx_mock.get(f"{BASE}/api/v1/query").mock(side_effect=handler)


async def run(settings: Settings):
    async with httpx.AsyncClient(timeout=3.0) as client:
        return await fetch_cluster(client, settings)


def test_queries_match_what_was_checked_against_prometheus():
    assert QUERIES == {
        "nodes": "count by (node, kubelet_version) (kube_node_info)",
        "ready": "count by (node) "
        '(kube_node_status_condition{condition="Ready",status="true"} == 1)',
        "pods": 'sum(kube_pod_status_phase{phase="Running"})',
        "workloads": "count(kube_deployment_status_replicas_available > 0)"
        " + count(kube_statefulset_status_replicas_ready > 0)",
        "services": "count(count by (host) (kube_ingress_path))",
        "uptime": 'max by (nodename) ((time() - node_boot_time_seconds{job="node-exporter"})'
        ' * on (instance) group_left (nodename) node_uname_info{job="node-exporter"})',
        "used": "max by (node) (longhorn_node_storage_usage_bytes)",
        "capacity": "max by (node) (longhorn_node_storage_capacity_bytes)",
        "cpu_temp": 'max(node_hwmon_temp_celsius{job="host-monitoring",'
        'chip="pci0000:00_0000:00:18_3",sensor="temp1"})',
        "nvme_temp": 'max(node_hwmon_temp_celsius{job="host-monitoring",chip=~"nvme_.*"})',
    }


async def test_cluster_values(respx_mock, settings):
    route = wire(respx_mock)
    cluster = await run(settings)
    assert route.call_count == len(QUERIES)
    assert cluster is not None
    assert cluster.nodes_total == 3
    assert cluster.nodes_ready == 2
    assert cluster.pods == 168
    assert cluster.workloads == 75
    assert cluster.services == 15
    assert cluster.kubernetes is not None
    assert (cluster.kubernetes.version, cluster.kubernetes.distribution) == ("1.36", "RKE2")
    assert [(n.name, n.ready, n.uptime_s) for n in cluster.nodes] == [
        ("server01", True, 286980),
        ("server02", True, 283616),
        ("server03", False, 199955),
    ]
    assert cluster.nodes[0].storage_used == 153792188416
    assert cluster.nodes[0].storage_total == 528343535616
    assert cluster.storage_used == 153792188416 + 177507315712 + 154977693696
    assert cluster.storage_total == 528343535616 + 316967923712 + 211181367296
    assert cluster.cpu_temp_c == 75.2
    assert cluster.nvme_temp_c == 72.9


async def test_cluster_response_leaks_no_ip_host_or_patch_level(client, respx_mock, sources_down):
    sources_down("music", "weather")
    wire(respx_mock)
    resp = await client.get("/api/status")
    body = resp.json()
    assert body["cluster"]["kubernetes"] == {"version": "1.36", "distribution": "RKE2"}
    text = resp.text
    assert not re.search(r"\b\d{1,3}(\.\d{1,3}){3}\b", text)
    for leak in ("1.36.6", "rke2r1", "+rke2", "example.test", "linkhop", "instance", "/24"):
        assert leak not in text, leak


@pytest.mark.parametrize(
    ("kubelet", "version", "distribution"),
    [
        ("v1.36.6+rke2r1", "1.36", "RKE2"),
        ("v1.35.2+k3s1", "1.35", "K3s"),
        ("v1.34.0", "1.34", None),
    ],
)
async def test_cluster_kubernetes_version_without_patch(
    respx_mock, settings, kubelet, version, distribution
):
    wire(respx_mock, nodes=vector((node("a", kubelet_version=kubelet), "1")))
    cluster = await run(settings)
    assert cluster.kubernetes.model_dump() == {"version": version, "distribution": distribution}


async def test_cluster_reports_the_oldest_kubelet_during_an_upgrade(respx_mock, settings):
    wire(
        respx_mock,
        nodes=vector(
            (node("server01", kubelet_version="v1.37.0+rke2r1"), "1"),
            (node("server02", kubelet_version="v1.36.6+rke2r1"), "1"),
        ),
    )
    cluster = await run(settings)
    assert cluster.kubernetes.version == "1.36"


async def test_cluster_unparsable_kubelet_version_leaves_kubernetes_out(respx_mock, settings):
    wire(respx_mock, nodes=vector((node("a", kubelet_version="weird"), "1")))
    cluster = await run(settings)
    assert cluster.kubernetes is None
    assert cluster.nodes_total == 1


async def test_cluster_keeps_only_the_first_label_of_a_node_name(respx_mock, settings):
    wire(
        respx_mock,
        nodes=vector((node("server01.lan.example.test", kubelet_version="v1.36.6+rke2r1"), "1")),
        ready=vector((node("server01.lan.example.test"), "1")),
        uptime=vector(({"nodename": "server01"}, "60")),
        used=EMPTY,
        capacity=EMPTY,
    )
    cluster = await run(settings)
    assert [(n.name, n.ready, n.uptime_s) for n in cluster.nodes] == [("server01", True, 60)]


@pytest.mark.parametrize("broken", list(QUERIES))
async def test_cluster_one_failing_query_only_drops_its_field(respx_mock, settings, broken):
    wire(respx_mock, **{broken: 503})
    cluster = await run(settings)
    assert cluster is not None
    dumped = cluster.model_dump()
    expected_none = {
        "nodes": ["nodes_total", "kubernetes"],
        "ready": ["nodes_ready"],
        "pods": ["pods"],
        "workloads": ["workloads"],
        "services": ["services"],
        "uptime": [],
        "used": ["storage_used", "storage_total"],
        "capacity": ["storage_used", "storage_total"],
        "cpu_temp": ["cpu_temp_c"],
        "nvme_temp": ["nvme_temp_c"],
    }[broken]
    for field in expected_none:
        assert dumped[field] is None, field
    others = {"nodes_total", "nodes_ready", "pods", "workloads", "services", "kubernetes"}
    others |= {"storage_used", "storage_total", "cpu_temp_c", "nvme_temp_c"}
    for field in others - set(expected_none):
        assert dumped[field] is not None, field
    assert len(cluster.nodes) == 3


async def test_cluster_failed_ready_query_leaves_ready_unknown(respx_mock, settings):
    wire(respx_mock, ready=503)
    cluster = await run(settings)
    assert [n.ready for n in cluster.nodes] == [None, None, None]


async def test_cluster_failed_uptime_query_leaves_uptime_out(respx_mock, settings):
    wire(respx_mock, uptime=httpx.ConnectTimeout("slow"))
    cluster = await run(settings)
    assert [n.uptime_s for n in cluster.nodes] == [None, None, None]


async def test_cluster_missing_sensors_are_null(respx_mock, settings):
    wire(respx_mock, cpu_temp=EMPTY, nvme_temp=vector(({}, "NaN")))
    cluster = await run(settings)
    assert cluster.cpu_temp_c is None
    assert cluster.nvme_temp_c is None
    assert cluster.pods == 168


async def test_cluster_without_statefulsets_has_no_workload_count(respx_mock, settings):
    wire(respx_mock, workloads=EMPTY)
    cluster = await run(settings)
    assert cluster.workloads is None


async def test_cluster_node_without_capacity_counts_toward_no_total(respx_mock, settings):
    wire(respx_mock, capacity=vector((node("server01"), "528343535616")))
    cluster = await run(settings)
    assert [(n.storage_used, n.storage_total) for n in cluster.nodes] == [
        (153792188416, 528343535616),
        (177507315712, None),
        (154977693696, None),
    ]
    assert cluster.storage_used == 153792188416
    assert cluster.storage_total == 528343535616


async def test_cluster_nothing_answered_raises(respx_mock, settings):
    respx_mock.get(f"{BASE}/api/v1/query").mock(return_value=httpx.Response(503))
    with pytest.raises(RuntimeError, match="no cluster data"):
        await run(settings)


async def test_cluster_only_empty_answers_raises(respx_mock, settings):
    respx_mock.get(f"{BASE}/api/v1/query").mock(return_value=httpx.Response(200, json=EMPTY))
    with pytest.raises(RuntimeError, match="no cluster data"):
        await run(settings)


async def test_cluster_logs_a_failed_query_without_url(respx_mock, settings, caplog):
    wire(respx_mock, pods=503)
    with caplog.at_level(logging.DEBUG):
        await run(settings)
    warnings = [r.getMessage() for r in caplog.records if r.levelname == "WARNING"]
    assert warnings == ["cluster query pods failed: Prometheus HTTP 503"]
    assert "monitoring-kube-prometheus" not in caplog.text


async def test_status_carries_the_cluster(client, respx_mock, sources_down):
    sources_down("music", "weather")
    wire(respx_mock)
    body = (await client.get("/api/status")).json()
    assert body["cluster"]["nodes_ready"] == 2
    assert body["cluster"]["nodes"][0] == {
        "name": "server01",
        "ready": True,
        "uptime_s": 286980,
        "storage_used": 153792188416,
        "storage_total": 528343535616,
    }
    json.dumps(body)


async def test_status_cluster_is_cached_for_a_minute(client, respx_mock, sources_down):
    sources_down("music", "weather")
    route = wire(respx_mock)
    await client.get("/api/status")
    await client.get("/api/status")
    pods = [c for c in route.calls if c.request.url.params["query"] == QUERIES["pods"]]
    assert len(pods) == 1


async def test_status_cluster_null_when_prometheus_is_down(client, respx_mock, sources_down):
    sources_down("music", "weather")
    respx_mock.get(f"{BASE}/api/v1/query").mock(return_value=httpx.Response(503))
    respx_mock.get(f"{BASE}/api/v1/query_range").mock(return_value=httpx.Response(503))
    resp = await client.get("/api/status")
    assert resp.status_code == 200
    assert resp.json()["cluster"] is None
