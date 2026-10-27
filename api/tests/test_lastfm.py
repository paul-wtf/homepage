from datetime import UTC, datetime, timedelta

import httpx
import respx

from homepage_api.settings import Settings
from homepage_api.sources.lastfm import fetch_music

API = "https://ws.audioscrobbler.com/2.0/"
NOW = datetime(2026, 10, 27, 9, 0, tzinfo=UTC)


def track(
    *,
    now_playing: bool = False,
    uts: int | None = None,
    album: str = "Some Album",
    images: bool = True,
) -> dict:
    t: dict = {
        "artist": {"mbid": "", "#text": "Some Artist"},
        "name": "Some Track",
        "url": "https://www.last.fm/music/Some+Artist/_/Some+Track",
        "mbid": "",
        "album": {"mbid": "", "#text": album},
    }
    if images:
        t["image"] = [
            {"size": "small", "#text": "https://img/small.png"},
            {"size": "extralarge", "#text": "https://img/xl.png"},
        ]
    if now_playing:
        t["@attr"] = {"nowplaying": "true"}
    if uts is not None:
        t["date"] = {"uts": str(uts), "#text": "27 Oct 2026, 07:00"}
    return t


def payload(*tracks: dict, bare: bool = False) -> dict:
    body: list | dict = list(tracks)
    if bare:
        body = tracks[0]
    return {"recenttracks": {"track": body, "@attr": {"user": "someone", "total": "1"}}}


def mock(respx_mock: respx.MockRouter, json: dict, status: int = 200) -> respx.Route:
    return respx_mock.get(API).mock(return_value=httpx.Response(status, json=json))


async def run(settings: Settings):
    async with httpx.AsyncClient(timeout=3.0) as client:
        return await fetch_music(client, settings, NOW)


async def test_lastfm_now_playing(respx_mock, settings):
    route = mock(
        respx_mock,
        payload(track(now_playing=True), track(uts=int((NOW - timedelta(hours=1)).timestamp()))),
    )
    music = await run(settings)
    assert music is not None
    assert music.state == "playing"
    assert music.played_at is None
    assert music.track == "Some Track"
    assert music.artist == "Some Artist"
    assert music.album == "Some Album"
    assert music.image == "https://img/xl.png"
    assert music.url == "https://www.last.fm/music/Some+Artist/_/Some+Track"
    params = route.calls.last.request.url.params
    assert params["method"] == "user.getrecenttracks"
    assert params["user"] == "someone"
    assert params["api_key"] == "test-key"
    assert params["format"] == "json"
    assert params["limit"] == "1"


async def test_lastfm_recent_within_6h(respx_mock, settings):
    played = NOW - timedelta(hours=2)
    mock(respx_mock, payload(track(uts=int(played.timestamp()))))
    music = await run(settings)
    assert music is not None
    assert music.state == "recent"
    assert music.played_at == played


async def test_lastfm_bare_object(respx_mock, settings):
    mock(respx_mock, payload(track(now_playing=True), bare=True))
    music = await run(settings)
    assert music is not None
    assert music.state == "playing"


async def test_lastfm_older_than_6h_is_none(respx_mock, settings):
    mock(respx_mock, payload(track(uts=int((NOW - timedelta(hours=6, seconds=1)).timestamp()))))
    assert await run(settings) is None


async def test_lastfm_no_tracks_is_none(respx_mock, settings):
    mock(respx_mock, {"recenttracks": {"track": [], "@attr": {"user": "someone"}}})
    assert await run(settings) is None


async def test_lastfm_missing_album_and_image(respx_mock, settings):
    mock(respx_mock, payload(track(now_playing=True, album="", images=False)))
    music = await run(settings)
    assert music is not None
    assert music.album is None
    assert music.image is None


async def test_lastfm_empty_extralarge_image_is_none(respx_mock, settings):
    t = track(now_playing=True)
    t["image"] = [{"size": "extralarge", "#text": ""}]
    mock(respx_mock, payload(t))
    music = await run(settings)
    assert music is not None
    assert music.image is None


async def test_lastfm_without_key_is_none(respx_mock):
    route = respx_mock.get(API)
    assert await run(Settings(lastfm_api_key=None)) is None
    assert not route.called


async def test_lastfm_upstream_error_raises(respx_mock, settings):
    mock(respx_mock, {}, status=500)
    try:
        await run(settings)
    except httpx.HTTPStatusError:
        return
    raise AssertionError("expected HTTPStatusError")


async def test_lastfm_error_payload_raises(respx_mock, settings):
    mock(respx_mock, {"error": 6, "message": "User not found"})
    try:
        await run(settings)
    except RuntimeError as exc:
        assert "User not found" in str(exc)
        return
    raise AssertionError("expected RuntimeError")
