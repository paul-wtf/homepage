import asyncio
import logging
import math
import re

import httpx

from homepage_api.models import Cluster, ClusterNode, Kubernetes
from homepage_api.settings import Settings
from homepage_api.sources.prometheus import query_series

logger = logging.getLogger(__name__)

NODE_EXPORTER = 'job="node-exporter"'
HOST = 'job="host-monitoring"'
# Tctl of the host's k10temp chip, as node_hwmon_chip_names names it.
CPU_SENSOR = 'chip="pci0000:00_0000:00:18_3",sensor="temp1"'

QUERIES = {
    "nodes": "count by (node, kubelet_version) (kube_node_info)",
    "ready": 'count by (node) (kube_node_status_condition{condition="Ready",status="true"} == 1)',
    "pods": 'sum(kube_pod_status_phase{phase="Running"})',
    "workloads": "count(kube_deployment_status_replicas_available > 0)"
    " + count(kube_statefulset_status_replicas_ready > 0)",
    "services": "count(count by (host) (kube_ingress_path))",
    "uptime": f"max by (nodename) ((time() - node_boot_time_seconds{{{NODE_EXPORTER}}})"
    f" * on (instance) group_left (nodename) node_uname_info{{{NODE_EXPORTER}}})",
    "used": "max by (node) (longhorn_node_storage_usage_bytes)",
    "capacity": "max by (node) (longhorn_node_storage_capacity_bytes)",
    "cpu_temp": f"max(node_hwmon_temp_celsius{{{HOST},{CPU_SENSOR}}})",
    "nvme_temp": f'max(node_hwmon_temp_celsius{{{HOST},chip=~"nvme_.*"}})',
}

VERSION = re.compile(r"^v?(\d+)\.(\d+)\.")
DISTRIBUTIONS = {"rke2": "RKE2", "k3s": "K3s"}


def _value(sample: dict) -> float | None:
    try:
        value = float(sample["value"][1])
    except (KeyError, IndexError, TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def _name(raw: object) -> str | None:
    if not isinstance(raw, str):
        return None
    return raw.split(".")[0] or None


def _by(series: list[dict], label: str) -> dict[str, float]:
    out: dict[str, float] = {}
    for sample in series:
        name = _name(sample.get("metric", {}).get(label))
        value = _value(sample)
        if name and value is not None:
            out[name] = value
    return out


def _scalar(series: list[dict]) -> float | None:
    return _value(series[0]) if series else None


def _count(series: list[dict]) -> int | None:
    value = _scalar(series)
    return round(value) if value is not None else None


def _celsius(series: list[dict]) -> float | None:
    value = _scalar(series)
    return round(value, 1) if value is not None else None


def _kubernetes(series: list[dict]) -> Kubernetes | None:
    found: list[tuple[tuple[int, int], str | None]] = []
    for sample in series:
        raw = sample.get("metric", {}).get("kubelet_version")
        match = VERSION.match(raw) if isinstance(raw, str) else None
        if not match:
            continue
        suffix = raw.partition("+")[2]
        dist = next((n for key, n in DISTRIBUTIONS.items() if suffix.startswith(key)), None)
        found.append(((int(match[1]), int(match[2])), dist))
    if not found:
        return None
    (major, minor), dist = min(found, key=lambda f: f[0])
    return Kubernetes(version=f"{major}.{minor}", distribution=dist)


async def fetch_cluster(client: httpx.AsyncClient, settings: Settings) -> Cluster:
    url = f"{settings.prometheus_url.rstrip('/')}/api/v1/query"
    results = await asyncio.gather(
        *(query_series(client, url, {"query": q}) for q in QUERIES.values()),
        return_exceptions=True,
    )
    answered: dict[str, list[dict]] = {}
    for name, result in zip(QUERIES, results, strict=True):
        if isinstance(result, Exception):
            logger.warning("cluster query %s failed: %s", name, result)
        elif isinstance(result, BaseException):
            raise result
        else:
            answered[name] = result
    if not any(answered.values()):
        raise RuntimeError("Prometheus returned no cluster data")

    def series(name: str) -> list[dict]:
        return answered.get(name, [])

    known = _by(series("nodes"), "node")
    ready = _by(series("ready"), "node")
    uptime = _by(series("uptime"), "nodename")
    used = _by(series("used"), "node")
    capacity = _by(series("capacity"), "node")
    ready_known = bool(ready) or ("ready" in answered and bool(known))

    nodes = [
        ClusterNode(
            name=name,
            ready=name in ready if ready_known else None,
            uptime_s=int(uptime[name]) if name in uptime else None,
            storage_used=int(used[name]) if name in used else None,
            storage_total=int(capacity[name]) if name in capacity else None,
        )
        for name in sorted({*known, *ready, *uptime, *used, *capacity})
    ]
    storage = [
        (n.storage_used, n.storage_total)
        for n in nodes
        if n.storage_used is not None and n.storage_total is not None
    ]
    return Cluster(
        nodes_total=len(known) if known else None,
        nodes_ready=len(ready) if ready_known else None,
        pods=_count(series("pods")),
        workloads=_count(series("workloads")),
        services=_count(series("services")),
        kubernetes=_kubernetes(series("nodes")),
        nodes=nodes,
        storage_used=sum(u for u, _ in storage) if storage else None,
        storage_total=sum(t for _, t in storage) if storage else None,
        cpu_temp_c=_celsius(series("cpu_temp")),
        nvme_temp_c=_celsius(series("nvme_temp")),
    )
