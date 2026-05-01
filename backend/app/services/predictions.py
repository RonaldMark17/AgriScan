from datetime import date

from app.services.crop_recommender_model import predict_manual_crop_recommendations


CROP_RECOMMENDATION_TEMPLATES = [
    {
        "crop": "Rice",
        "base": 72,
        "reason": "Performs well in clay or alluvial soils with reliable water supply.",
        "planting_window": "Best at the start of the rainy season or when irrigation is available.",
        "watering": "Keep soil consistently moist during establishment.",
        "fertilizer": "Use split nitrogen application and avoid excess nitrogen during humid periods.",
    },
    {
        "crop": "Corn",
        "base": 70,
        "reason": "Fits well-drained loam to sandy loam soils with good sunlight.",
        "planting_window": "Plant when soil is moist but not waterlogged.",
        "watering": "Water during tasseling and grain filling if rainfall is low.",
        "fertilizer": "Side-dress nitrogen during vegetative growth.",
    },
    {
        "crop": "Tomato",
        "base": 68,
        "reason": "Needs well-drained loam soil with balanced moisture and near-neutral pH.",
        "planting_window": "Plant during cooler dry months or protected rainy-season production.",
        "watering": "Use consistent watering and avoid wetting leaves.",
        "fertilizer": "Support calcium and potassium to reduce fruit disorders.",
    },
    {
        "crop": "Eggplant",
        "base": 67,
        "reason": "Adaptable to loam and clay loam soils with warm Philippine conditions.",
        "planting_window": "Suitable for year-round planting with pest monitoring.",
        "watering": "Maintain steady moisture without flooding.",
        "fertilizer": "Apply compost and balanced NPK before flowering.",
    },
    {
        "crop": "Pechay",
        "base": 64,
        "reason": "Fast-growing leafy vegetable for fertile loam soils.",
        "planting_window": "Plant in short cycles when heavy rain is manageable.",
        "watering": "Water lightly and regularly.",
        "fertilizer": "Use nitrogen-rich organic fertilizer for leaf growth.",
    },
    {
        "crop": "Cassava",
        "base": 63,
        "reason": "Tolerates sandy or light soils and lower moisture better than many vegetables.",
        "planting_window": "Plant at the beginning of rains for establishment.",
        "watering": "Needs little irrigation after establishment.",
        "fertilizer": "Add potassium support for root development.",
    },
    {
        "crop": "Mung Bean",
        "base": 62,
        "reason": "Good legume option for sandy loam and lower nitrogen soils.",
        "planting_window": "Best after rice or during a drier window.",
        "watering": "Avoid waterlogging and irrigate lightly during flowering.",
        "fertilizer": "Use inoculant or compost; avoid heavy nitrogen.",
    },
    {
        "crop": "Sweet Potato",
        "base": 61,
        "reason": "Works well in loose sandy loam soils with moderate fertility.",
        "planting_window": "Plant when soil is warm and rainfall is steady.",
        "watering": "Keep moist during vine establishment, then reduce watering.",
        "fertilizer": "Avoid excess nitrogen; support potassium for tuber growth.",
    },
    {
        "crop": "Gabi / Taro",
        "base": 60,
        "reason": "Suitable for moist clay soils and areas that stay wet.",
        "planting_window": "Plant during rainy months or in irrigated plots.",
        "watering": "Maintain high soil moisture.",
        "fertilizer": "Use compost and balanced nutrients before corm expansion.",
    },
]


def build_smart_recommendation(crop_type: str, soil_type: str | None, weather: dict) -> dict:
    crop = crop_type.lower()
    temperature = weather.get("temperature_c", 29)
    humidity = weather.get("humidity", 75)
    rain_probability = weather.get("rain_probability") or 0.25

    watering = "Moderate watering in early morning."
    if rain_probability > 0.5:
        watering = "Delay irrigation; rainfall risk is elevated."
    elif temperature >= 33:
        watering = "Increase watering frequency and monitor soil moisture in afternoon heat."

    fertilizer = "Use soil-test based fertilizer plan through the local agriculture office."
    if "rice" in crop:
        fertilizer = "Split nitrogen application and avoid over-fertilizing during disease-prone humid periods."
    elif "corn" in crop:
        fertilizer = "Apply balanced NPK and side-dress nitrogen at vegetative stage."
    elif "tomato" in crop:
        fertilizer = "Use calcium-supporting fertilizer to reduce fruit disorders and maintain potassium."

    planting_window = "Plant at the start of a stable rainy period or when irrigation is reliable."
    if humidity > 85:
        planting_window = "High humidity may increase disease pressure; choose resistant varieties and monitor closely."

    return {
        "generated_on": date.today().isoformat(),
        "crop": crop_type,
        "soil_type": soil_type,
        "yield_prediction": "Medium to high with proper pest monitoring and nutrient scheduling.",
        "best_planting_time": planting_window,
        "watering_recommendation": watering,
        "fertilizer_recommendation": fertilizer,
        "crop_recommendation": _crop_recommendation(soil_type, temperature),
    }


def _crop_recommendation(soil_type: str | None, temperature: float) -> str:
    soil = (soil_type or "").lower()
    if "clay" in soil:
        return "Rice, taro, and water-tolerant vegetables are good candidates if drainage is managed."
    if "sandy" in soil:
        return "Corn, peanut, mung bean, and drought-tolerant vegetables may perform well with irrigation."
    if temperature > 32:
        return "Prioritize heat-tolerant varieties of corn, eggplant, okra, and mung bean."
    return "Rice, corn, tomato, eggplant, and leafy vegetables are suitable with local variety selection."


def build_soil_crop_recommendation(
    soil_type: str,
    ph_level: float | None = None,
    moisture_percent: float | None = None,
    soil_temperature_c: float | None = None,
    nitrogen_level: str | None = None,
    phosphorus_level: str | None = None,
    potassium_level: str | None = None,
    drainage: str | None = None,
    sunlight: str | None = None,
    season: str | None = None,
    province: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    location_label: str | None = None,
    weather: dict | None = None,
) -> dict:
    soil = soil_type.lower()
    drainage_value = (drainage or "moderate").lower()
    sunlight_value = (sunlight or "full sun").lower()
    season_value = (season or "regular season").lower()
    nitrogen = (nitrogen_level or "medium").lower()
    phosphorus = (phosphorus_level or "medium").lower()
    potassium = (potassium_level or "medium").lower()
    live_weather = weather if weather and weather.get("source") not in {None, "demo"} else None
    temperature = live_weather.get("temperature_c") if live_weather else None
    humidity = live_weather.get("humidity") if live_weather else None
    rain_probability = live_weather.get("rain_probability") if live_weather else None
    precipitation = live_weather.get("precipitation_mm") if live_weather else None

    candidates = CROP_RECOMMENDATION_TEMPLATES

    scored = []
    for candidate in candidates:
        score = candidate["base"]
        crop = candidate["crop"].lower()

        if "clay" in soil:
            score += 12 if crop in {"rice", "gabi / taro", "eggplant"} else -4
        if "sandy" in soil:
            score += 12 if crop in {"corn", "cassava", "mung bean", "sweet potato"} else -5
        if "loam" in soil:
            score += 10 if crop in {"corn", "tomato", "eggplant", "pechay"} else 4
        if "alluvial" in soil:
            score += 12 if crop in {"rice", "corn", "pechay"} else 5

        if ph_level is not None:
            if 6.0 <= ph_level <= 7.0:
                score += 9 if crop in {"tomato", "eggplant", "pechay", "corn"} else 4
            elif ph_level < 5.6:
                score += 8 if crop in {"rice", "cassava", "sweet potato"} else -8
            elif ph_level > 7.5:
                score -= 7 if crop in {"tomato", "pechay"} else 2

        if moisture_percent is not None:
            if moisture_percent >= 65:
                score += 12 if crop in {"rice", "gabi / taro"} else -6
            elif moisture_percent <= 35:
                score += 10 if crop in {"cassava", "mung bean", "sweet potato", "corn"} else -5
            else:
                score += 8 if crop in {"corn", "tomato", "eggplant", "pechay"} else 3

        if soil_temperature_c is not None:
            if soil_temperature_c >= 30:
                score += 8 if crop in {"corn", "eggplant", "cassava", "mung bean", "sweet potato"} else 0
                score -= 5 if crop in {"pechay", "tomato"} else 0
            elif 22 <= soil_temperature_c <= 29:
                score += 7 if crop in {"tomato", "corn", "eggplant", "pechay"} else 3
            elif soil_temperature_c < 22:
                score += 5 if crop in {"pechay", "tomato"} else -2

        if "poor" in drainage_value or "water" in drainage_value:
            score += 13 if crop in {"rice", "gabi / taro"} else -8
        elif "good" in drainage_value:
            score += 9 if crop in {"corn", "tomato", "eggplant", "mung bean", "sweet potato"} else 1

        if "partial" in sunlight_value:
            score += 6 if crop in {"pechay", "gabi / taro"} else -3
        elif "full" in sunlight_value:
            score += 6 if crop in {"corn", "tomato", "eggplant", "cassava", "mung bean"} else 2

        if "rain" in season_value or "wet" in season_value:
            score += 8 if crop in {"rice", "gabi / taro"} else -2
        elif "dry" in season_value:
            score += 8 if crop in {"corn", "cassava", "mung bean", "sweet potato"} else -3

        if nitrogen == "low":
            score += 7 if crop == "mung bean" else -2
        if phosphorus == "low":
            score -= 3 if crop in {"tomato", "corn", "sweet potato"} else 0
        if potassium == "low":
            score -= 4 if crop in {"tomato", "cassava", "sweet potato"} else 0

        if live_weather:
            if rain_probability is not None and rain_probability >= 0.55:
                score += 10 if crop in {"rice", "gabi / taro"} else -2
                score -= 6 if crop == "tomato" else 0
            elif rain_probability is not None and rain_probability <= 0.25 and moisture_percent is not None and moisture_percent <= 40:
                score += 8 if crop in {"corn", "cassava", "mung bean", "sweet potato"} else 0
                score -= 5 if crop in {"rice", "gabi / taro"} else 0

            if precipitation is not None and precipitation >= 1:
                score += 6 if crop in {"rice", "gabi / taro"} else 0
                score -= 4 if crop in {"tomato", "pechay"} else 0

            if temperature is not None:
                if temperature >= 32:
                    score += 6 if crop in {"corn", "eggplant", "cassava", "mung bean", "sweet potato"} else 0
                    score -= 4 if crop in {"pechay", "tomato"} else 0
                elif 24 <= temperature <= 30:
                    score += 5 if crop in {"tomato", "pechay", "corn"} else 0

            if humidity is not None and humidity >= 82:
                score += 4 if crop in {"rice", "gabi / taro"} else 0
                score -= 6 if crop == "tomato" else 0

        scored.append({**candidate, "suitability": max(45, min(98, round(score)))})

    model_prediction = predict_manual_crop_recommendations(
        soil_type=soil_type,
        ph_level=ph_level,
        moisture_percent=moisture_percent,
        soil_temperature_c=soil_temperature_c,
        nitrogen_level=nitrogen_level,
        phosphorus_level=phosphorus_level,
        potassium_level=potassium_level,
        drainage=drainage,
        sunlight=sunlight,
        season=season,
    )
    if model_prediction:
        recommendations = _blend_model_recommendations(model_prediction, scored)
    else:
        recommendations = sorted(scored, key=lambda item: item["suitability"], reverse=True)[:4]
    best = recommendations[0]
    soil_summary = _soil_summary(soil_type, ph_level, moisture_percent, drainage_value, soil_temperature_c)
    resolved_location_label = _resolve_location_label(location_label, province, latitude, longitude)
    recommendation_basis = _recommendation_basis(soil_summary, live_weather, resolved_location_label)
    if model_prediction:
        recommendation_basis.insert(0, "Ranked by the trained Manual Scan crop model, with agronomy rules used as guardrails.")

    return {
        "generated_on": date.today().isoformat(),
        "province": province,
        "soil_type": soil_type,
        "ph_level": ph_level,
        "moisture_percent": moisture_percent,
        "soil_temperature_c": soil_temperature_c,
        "best_crop": best["crop"],
        "confidence": round(best["suitability"] / 100, 2),
        "soil_summary": soil_summary,
        "recommendations": recommendations,
        "soil_actions": _soil_actions(ph_level, moisture_percent, soil_temperature_c, nitrogen, phosphorus, potassium, drainage_value, live_weather),
        "location": {
            "label": resolved_location_label,
            "latitude": latitude,
            "longitude": longitude,
        },
        "weather": weather,
        "weather_summary": _weather_summary(live_weather),
        "recommendation_basis": recommendation_basis,
        "recommendation_model": {
            "source": model_prediction["source"] if model_prediction else "rules",
            "version": model_prediction["model_version"] if model_prediction else "rule-based-v1",
            "accuracy": model_prediction.get("accuracy") if model_prediction else None,
            "top_3_accuracy": model_prediction.get("top_3_accuracy") if model_prediction else None,
        },
    }


def _blend_model_recommendations(model_prediction: dict, scored: list[dict]) -> list[dict]:
    scored_by_crop = {item["crop"].lower(): item for item in scored}
    ranked: list[dict] = []
    seen: set[str] = set()

    for prediction in model_prediction.get("predictions", []):
        crop_name = str(prediction.get("crop", ""))
        crop_key = crop_name.lower()
        rule_item = scored_by_crop.get(crop_key)
        if rule_item is None:
            continue

        probability = float(prediction.get("probability") or 0)
        model_score = 60 + (probability * 38)
        suitability = max(45, min(98, round((model_score * 0.68) + (rule_item["suitability"] * 0.32))))
        ranked.append(
            {
                **rule_item,
                "suitability": suitability,
                "model_confidence": round(probability, 2),
                "rule_suitability": rule_item["suitability"],
            }
        )
        seen.add(crop_key)

    for rule_item in sorted(scored, key=lambda item: item["suitability"], reverse=True):
        crop_key = rule_item["crop"].lower()
        if crop_key not in seen:
            ranked.append({**rule_item, "model_confidence": 0, "rule_suitability": rule_item["suitability"]})
            seen.add(crop_key)
        if len(ranked) >= 4:
            break

    return sorted(ranked, key=lambda item: item["suitability"], reverse=True)[:4]


def _soil_summary(
    soil_type: str,
    ph_level: float | None,
    moisture_percent: float | None,
    drainage: str,
    soil_temperature_c: float | None = None,
) -> str:
    details = [f"{soil_type} soil"]
    if ph_level is not None:
        if ph_level < 5.6:
            details.append("acidic pH")
        elif ph_level <= 7.2:
            details.append("near-neutral pH")
        else:
            details.append("alkaline pH")
    if moisture_percent is not None:
        if moisture_percent >= 65:
            details.append("high moisture")
        elif moisture_percent <= 35:
            details.append("low moisture")
        else:
            details.append("moderate moisture")
    if soil_temperature_c is not None:
        if soil_temperature_c >= 30:
            details.append("warm soil")
        elif soil_temperature_c < 22:
            details.append("cool soil")
        else:
            details.append("balanced soil temperature")
    details.append(f"{drainage} drainage")
    return ", ".join(details).capitalize() + "."


def _soil_actions(
    ph_level: float | None,
    moisture_percent: float | None,
    soil_temperature_c: float | None,
    nitrogen: str,
    phosphorus: str,
    potassium: str,
    drainage: str,
    weather: dict | None = None,
) -> list[str]:
    actions: list[str] = []
    if ph_level is not None and ph_level < 5.6:
        actions.append("Consider liming before planting pH-sensitive vegetables.")
    if ph_level is not None and ph_level > 7.5:
        actions.append("Add compost and confirm alkalinity with a soil test before fertilizer application.")
    if moisture_percent is not None and moisture_percent >= 65:
        actions.append("Improve canals or raised beds if planting crops that dislike waterlogging.")
    if moisture_percent is not None and moisture_percent <= 35:
        actions.append("Add mulch and plan irrigation before planting water-demanding crops.")
    if soil_temperature_c is not None and soil_temperature_c >= 30:
        actions.append("Soil is warm, so add mulch or crop cover to reduce moisture loss during midday heat.")
    if soil_temperature_c is not None and soil_temperature_c < 22:
        actions.append("Cool soil can slow early growth, so plant once the bed has warmed or use light mulch.")
    if nitrogen == "low":
        actions.append("Add compost or nitrogen support, or rotate with legumes such as mung bean.")
    if phosphorus == "low":
        actions.append("Use soil-test guided phosphorus fertilizer for root establishment.")
    if potassium == "low":
        actions.append("Add potassium support for fruiting or root crops.")
    if "poor" in drainage:
        actions.append("Use raised beds for vegetables or choose water-tolerant crops.")
    if weather and weather.get("rain_probability", 0) >= 0.55:
        actions.append("Current rain risk is elevated, so prepare drainage canals and seed protection before planting.")
    if weather and (weather.get("temperature_c") or 0) >= 32:
        actions.append("Afternoon heat is high, so mulch early and schedule watering before 9 AM.")
    return actions or ["Maintain organic matter and repeat soil observation before each planting cycle."]


def _resolve_location_label(
    location_label: str | None,
    province: str | None,
    latitude: float | None,
    longitude: float | None,
) -> str | None:
    if location_label and location_label.strip():
        return location_label.strip()
    if province and province.strip():
        return province.strip()
    if latitude is not None and longitude is not None:
        return f"{latitude:.5f}, {longitude:.5f}"
    return None


def _weather_summary(weather: dict | None) -> str | None:
    if not weather:
        return None

    summary = weather.get("summary")
    temperature = weather.get("temperature_c")
    humidity = weather.get("humidity")
    parts = []
    if summary:
        parts.append(str(summary))
    if temperature is not None:
        parts.append(f"{round(float(temperature))}C")
    if humidity is not None:
        parts.append(f"{round(float(humidity))}% humidity")
    return ", ".join(parts) if parts else None


def _recommendation_basis(soil_summary: str, weather: dict | None, location_label: str | None) -> list[str]:
    basis = [f"Matched against {soil_summary.lower()}"]
    if location_label:
        basis.append(f"Using current location: {location_label}")
    weather_summary = _weather_summary(weather)
    if weather_summary:
        basis.append(f"Live weather considered: {weather_summary}")
    return basis
