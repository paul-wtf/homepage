import httpx
import pytest

from homepage_api.main import create_app
from homepage_api.settings import Settings
from homepage_api.sources.projects import fetch_projects

ONE = "https://one.test"
TWO = "https://two.test"


@pytest.fixture
def project_settings() -> Settings:
    return Settings(lastfm_api_key=None, project_urls={"one": ONE, "two": TWO})


async def run(settings: Settings):
    async with httpx.AsyncClient(timeout=3.0) as client:
        return await fetch_projects(client, settings)


async def test_projects_up_and_down(respx_mock, project_settings):
    respx_mock.get(ONE).mock(return_value=httpx.Response(200))
    respx_mock.get(TWO).mock(return_value=httpx.Response(503))
    assert await run(project_settings) == {"one": "up", "two": "down"}


async def test_projects_redirect_is_up_and_client_error_is_down(respx_mock, project_settings):
    respx_mock.get(ONE).mock(return_value=httpx.Response(302, headers={"location": "/login"}))
    respx_mock.get(TWO).mock(return_value=httpx.Response(404))
    assert await run(project_settings) == {"one": "up", "two": "down"}


async def test_projects_timeout_is_down(respx_mock, project_settings):
    respx_mock.get(ONE).mock(side_effect=httpx.ConnectTimeout("slow"))
    respx_mock.get(TWO).mock(side_effect=httpx.ConnectError("refused"))
    assert await run(project_settings) == {"one": "down", "two": "down"}


async def test_projects_none_without_urls(respx_mock):
    assert await run(Settings(project_urls={})) is None


def test_projects_default_urls_are_the_public_sites():
    assert Settings().project_urls == {
        "linkhop": "https://linkhop.paul.wtf",
        "tidalwave": "https://tidalwave.paul.wtf",
    }


def test_projects_urls_come_from_the_environment(monkeypatch):
    monkeypatch.setenv("PROJECT_URLS", '{"linkhop": "http://linkhop.internal:8080"}')
    assert Settings().project_urls == {"linkhop": "http://linkhop.internal:8080"}


@pytest.fixture
async def project_client(project_settings, respx_mock):
    respx_mock.get(url__startswith="https://ws.audioscrobbler.com/").mock(
        return_value=httpx.Response(500)
    )
    respx_mock.get(url__startswith=f"{project_settings.prometheus_url}/api/v1/").mock(
        return_value=httpx.Response(500)
    )
    respx_mock.get(url__startswith="https://api.open-meteo.com/").mock(
        return_value=httpx.Response(500)
    )
    app = create_app(project_settings)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as c,
    ):
        yield c


async def test_status_returns_projects_without_their_urls(project_client, respx_mock):
    respx_mock.get(ONE).mock(return_value=httpx.Response(200))
    respx_mock.get(TWO).mock(side_effect=httpx.ConnectTimeout("slow"))
    resp = await project_client.get("/api/status")
    assert resp.status_code == 200
    assert resp.json()["projects"] == {"one": "up", "two": "down"}
    assert "one.test" not in resp.text
    assert "two.test" not in resp.text


async def test_status_checks_projects_once_per_minute(project_client, respx_mock):
    one = respx_mock.get(ONE).mock(return_value=httpx.Response(200))
    respx_mock.get(TWO).mock(return_value=httpx.Response(200))
    await project_client.get("/api/status")
    await project_client.get("/api/status")
    assert one.call_count == 1


async def test_status_projects_null_when_not_configured(client, sources_down):
    sources_down("music", "server", "weather")
    body = (await client.get("/api/status")).json()
    assert body["projects"] is None
