from datetime import UTC, datetime

import httpx

from app.core.config import get_settings

settings = get_settings()
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

WEATHER_CODE_SUMMARIES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def _open_meteo_summary(weather_code: int | None, is_day: int | None) -> str:
    if weather_code is None:
        return "Weather update unavailable."
    summary = WEATHER_CODE_SUMMARIES.get(weather_code, "Current conditions available.")
    if weather_code == 0 and is_day == 0:
        return "Clear night"
    return summary


async def _get_open_meteo_weather(latitude: float, longitude: float) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            OPEN_METEO_FORECAST_URL,
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": [
                    "temperature_2m",
                    "relative_humidity_2m",
                    "apparent_temperature",
                    "precipitation",
                    "weather_code",
                    "wind_speed_10m",
                    "is_day",
                ],
                "timezone": "auto",
                "wind_speed_unit": "kmh",
            },
        )
        response.raise_for_status()
        data = response.json()

    current = data.get("current", {})
    precipitation = current.get("precipitation")
    return {
        "source": "open-meteo",
        "summary": _open_meteo_summary(current.get("weather_code"), current.get("is_day")),
        "temperature_c": current.get("temperature_2m", 29),
        "humidity": current.get("relative_humidity_2m", 78),
        "apparent_temperature_c": current.get("apparent_temperature"),
        "wind_speed_kph": current.get("wind_speed_10m"),
        "precipitation_mm": precipitation,
        "rain_probability": 0.6 if precipitation and precipitation > 0 else 0.0,
        "observed_at": current.get("time"),
        "timezone": data.get("timezone"),
    }


async def get_weather(latitude: float | None, longitude: float | None) -> dict:
    if latitude is None or longitude is None:
        return {
            "source": "demo",
            "summary": "Add farm GPS coordinates to enable live weather.",
            "temperature_c": 29,
            "humidity": 78,
            "rain_probability": 0.35,
            "wind_speed_kph": 12,
            "apparent_temperature_c": 31,
            "precipitation_mm": 0,
            "observed_at": None,
            "timezone": None,
        }
    if not settings.weather_api_key:
        return await _get_open_meteo_weather(latitude, longitude)

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            f"{settings.weather_api_base_url}/weather",
            params={"lat": latitude, "lon": longitude, "appid": settings.weather_api_key, "units": "metric"},
        )
        response.raise_for_status()
        data = response.json()
    rain_1h = data.get("rain", {}).get("1h")
    rain_3h = data.get("rain", {}).get("3h")
    precipitation = rain_1h if rain_1h is not None else rain_3h
    return {
        "source": "openweathermap",
        "summary": str(data["weather"][0]["description"]).capitalize(),
        "temperature_c": data["main"]["temp"],
        "humidity": data["main"]["humidity"],
        "rain_probability": 0.6 if precipitation and precipitation > 0 else 0.0,
        "wind_speed_kph": round((data.get("wind", {}).get("speed") or 0) * 3.6, 1),
        "apparent_temperature_c": data["main"].get("feels_like"),
        "precipitation_mm": precipitation or 0,
        "observed_at": datetime.fromtimestamp(data["dt"], UTC).isoformat() if data.get("dt") else None,
        "timezone": data.get("timezone"),
    }
