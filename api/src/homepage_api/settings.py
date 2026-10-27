from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    lastfm_api_key: str | None = None
    lastfm_user: str = "SpotifyNutzeer"
    prometheus_url: str = "http://monitoring-kube-prometheus-prometheus.monitoring:9090"
    weather_lat: float | None = None
    weather_lon: float | None = None
