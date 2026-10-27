from datetime import UTC, datetime, timedelta

import httpx

from homepage_api.models import Music
from homepage_api.settings import Settings

API_URL = "https://ws.audioscrobbler.com/2.0/"
RECENT_WINDOW = timedelta(hours=6)


async def fetch_music(client: httpx.AsyncClient, settings: Settings, now: datetime) -> Music | None:
    if not settings.lastfm_api_key:
        return None
    try:
        resp = await client.get(
            API_URL,
            params={
                "method": "user.getrecenttracks",
                "user": settings.lastfm_user,
                "api_key": settings.lastfm_api_key,
                "format": "json",
                "limit": "1",
            },
        )
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(f"Last.fm HTTP {exc.response.status_code}") from None
    except (httpx.HTTPError, ValueError) as exc:
        raise RuntimeError(f"Last.fm request failed: {type(exc).__name__}") from None
    if "error" in data:
        raise RuntimeError(f"Last.fm error {data['error']}: {data.get('message', '')}")
    return _parse_music(data, now)


def _parse_music(data: dict, now: datetime) -> Music | None:
    tracks = data.get("recenttracks", {}).get("track") or []
    if isinstance(tracks, dict):
        tracks = [tracks]
    if not tracks:
        return None
    t = tracks[0]
    if t.get("@attr", {}).get("nowplaying") == "true":
        state, played_at = "playing", None
    elif "date" in t:
        played_at = datetime.fromtimestamp(int(t["date"]["uts"]), tz=UTC)
        if now - played_at > RECENT_WINDOW:
            return None
        state = "recent"
    else:
        return None
    return Music(
        state=state,
        track=t["name"],
        artist=t["artist"]["#text"],
        album=(t.get("album") or {}).get("#text") or None,
        image=_extralarge_image(t),
        url=t.get("url") or None,
        played_at=played_at,
    )


def _extralarge_image(track: dict) -> str | None:
    for img in track.get("image") or []:
        if img.get("size") == "extralarge":
            return img.get("#text") or None
    return None
