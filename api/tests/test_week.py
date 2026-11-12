import httpx
import pytest

from homepage_api.main import create_app
from homepage_api.settings import Settings
from homepage_api.sources.week import fetch_week

BASE = "https://tw.test"
SHARED = f"{BASE}/shared/tok123"

GRID = [[0] * 24 for _ in range(7)]
GRID[2][21] = 5


@pytest.fixture
def week_settings() -> Settings:
    return Settings(project_urls={}, tidalwave_url=BASE, tidalwave_share_token="tok123")


def mock_share(respx_mock, *, artists=None, tracks=None, summary=None, grid=None):
    respx_mock.get(f"{SHARED}/summary").mock(
        return_value=httpx.Response(
            200,
            json=summary
            or {
                "total_listens": 312,
                "distinct_artists": 40,
                "distinct_tracks": 150,
                "distinct_albums": 60,
                "total_seconds": 64800,
            },
        )
    )
    respx_mock.get(f"{SHARED}/top-artists").mock(
        return_value=httpx.Response(
            200,
            json=artists
            or [
                {"artist": "Kraftklub", "count": 40, "image_url": "https://img.test/k.jpg"},
                {"artist": "AnnenMayKantereit", "count": 31, "image_url": None},
            ],
        )
    )
    respx_mock.get(f"{SHARED}/top-tracks").mock(
        return_value=httpx.Response(
            200,
            json=tracks
            or [{"track": "Songs für Liam", "artist": "Kraftklub", "count": 9, "image_url": None}],
        )
    )
    respx_mock.get(f"{SHARED}/hour-weekday").mock(
        return_value=httpx.Response(200, json=grid or GRID)
    )


async def run(settings: Settings):
    async with httpx.AsyncClient(timeout=3.0) as client:
        return await fetch_week(client, settings)


async def test_week_none_without_token(respx_mock):
    assert await run(Settings(tidalwave_share_token=None)) is None
    assert not respx_mock.calls


async def test_week_reads_the_share(respx_mock, week_settings):
    mock_share(respx_mock)
    week = await run(week_settings)
    assert week is not None
    assert week.listens == 312
    assert week.seconds == 64800
    assert [(a.name, a.count, a.image) for a in week.artists] == [
        ("Kraftklub", 40, "https://img.test/k.jpg"),
        ("AnnenMayKantereit", 31, None),
    ]
    assert [(t.track, t.artist, t.count) for t in week.tracks] == [
        ("Songs für Liam", "Kraftklub", 9)
    ]
    assert week.grid == GRID
    assert week.url == f"{BASE}/s/tok123"


async def test_week_asks_for_five_artists_and_tracks(respx_mock, week_settings):
    mock_share(respx_mock)
    await run(week_settings)
    for path in ("top-artists", "top-tracks"):
        call = next(c for c in respx_mock.calls if c.request.url.path.endswith(path))
        assert call.request.url.params["limit"] == "5"


async def test_week_drops_non_https_images(respx_mock, week_settings):
    mock_share(
        respx_mock,
        artists=[{"artist": "A", "count": 1, "image_url": "http://img.test/a.jpg"}],
    )
    week = await run(week_settings)
    assert week.artists[0].image is None


async def test_week_revoked_share_raises(respx_mock, week_settings):
    mock_share(respx_mock)
    respx_mock.get(f"{SHARED}/summary").mock(return_value=httpx.Response(404))
    with pytest.raises(RuntimeError, match="404"):
        await run(week_settings)


async def test_week_unreachable_raises(respx_mock, week_settings):
    respx_mock.get(url__startswith=SHARED).mock(side_effect=httpx.ConnectError("refused"))
    with pytest.raises(RuntimeError, match="ConnectError"):
        await run(week_settings)


async def test_week_rejects_a_malformed_grid(respx_mock, week_settings):
    mock_share(respx_mock, grid=[[1, 2, 3]])
    with pytest.raises(RuntimeError, match="grid"):
        await run(week_settings)


def test_week_defaults_point_at_the_public_site():
    settings = Settings()
    assert settings.tidalwave_url == "https://tidalwave.paul.wtf"
    assert settings.tidalwave_share_token is None


@pytest.fixture
async def week_client(week_settings, respx_mock):
    for prefix in (
        "https://ws.audioscrobbler.com/",
        f"{week_settings.prometheus_url}/api/v1/",
        "https://api.open-meteo.com/",
    ):
        respx_mock.get(url__startswith=prefix).mock(return_value=httpx.Response(500))
    app = create_app(week_settings)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as c,
    ):
        yield c


async def test_status_carries_the_week(week_client, respx_mock):
    mock_share(respx_mock)
    body = (await week_client.get("/api/status")).json()
    assert body["week"]["listens"] == 312
    assert body["week"]["artists"][0] == {
        "name": "Kraftklub",
        "count": 40,
        "image": "https://img.test/k.jpg",
    }
    assert body["week"]["url"] == f"{BASE}/s/tok123"


async def test_status_week_is_cached_for_ten_minutes(week_client, respx_mock):
    mock_share(respx_mock)
    await week_client.get("/api/status")
    await week_client.get("/api/status")
    summary = [c for c in respx_mock.calls if c.request.url.path.endswith("/summary")]
    assert len(summary) == 1


async def test_status_week_null_when_tidalwave_is_down(week_client, respx_mock):
    respx_mock.get(url__startswith=SHARED).mock(return_value=httpx.Response(502))
    resp = await week_client.get("/api/status")
    assert resp.status_code == 200
    assert resp.json()["week"] is None
