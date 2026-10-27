from datetime import UTC, datetime, timedelta

import httpx

API = "https://ws.audioscrobbler.com/2.0/"


def playing_payload() -> dict:
    return {
        "recenttracks": {
            "track": [
                {
                    "artist": {"#text": "Some Artist"},
                    "name": "Some Track",
                    "url": "https://www.last.fm/music/x",
                    "album": {"#text": ""},
                    "@attr": {"nowplaying": "true"},
                }
            ]
        }
    }


async def test_status_never_500_when_sources_fail(client, respx_mock):
    respx_mock.get(API).mock(return_value=httpx.Response(500))
    resp = await client.get("/api/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["music"] is None
    assert body["server"] is None
    assert body["weather"] is None


async def test_status_never_500_when_upstream_unreachable(client, respx_mock):
    respx_mock.get(API).mock(side_effect=httpx.ConnectTimeout("slow"))
    resp = await client.get("/api/status")
    assert resp.status_code == 200
    assert resp.json()["music"] is None


async def test_status_returns_music(client, respx_mock):
    respx_mock.get(API).mock(return_value=httpx.Response(200, json=playing_payload()))
    resp = await client.get("/api/status")
    assert resp.status_code == 200
    music = resp.json()["music"]
    assert music == {
        "state": "playing",
        "track": "Some Track",
        "artist": "Some Artist",
        "album": None,
        "image": None,
        "url": "https://www.last.fm/music/x",
        "played_at": None,
    }


async def test_status_generated_at_is_iso_utc(client, respx_mock):
    respx_mock.get(API).mock(return_value=httpx.Response(500))
    body = (await client.get("/api/status")).json()
    stamp = body["generated_at"]
    assert stamp.endswith("Z")
    assert len(stamp) == len("2026-10-27T09:00:00Z")
    parsed = datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
    assert abs(datetime.now(UTC) - parsed) < timedelta(seconds=5)


async def test_status_cache_header(client, respx_mock):
    respx_mock.get(API).mock(return_value=httpx.Response(500))
    resp = await client.get("/api/status")
    assert resp.headers["cache-control"] == "public, max-age=15"


async def test_healthz(client):
    resp = await client.get("/api/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
