from datetime import date

from app.services.crop_recommender_model import predict_manual_crop_recommendations


SUPPORTED_CROP_NAMES = (
    "Rice",
    "Corn",
    "Coconut",
    "Banana",
    "Sugarcane",
    "Cassava",
    "Sweet Potato",
    "Tomato",
    "Eggplant",
    "Mung Bean",
    "Mango",
    "Pineapple",
    "Calamansi",
    "Onion",
    "Cabbage",
    "Bitter Gourd",
    "Pepper",
    "Potato",
    "Guava",
    "Cacao",
    "Coffee",
    "Abaca",
    "Pechay",
    "Gabi / Taro",
)

SUPPORTED_CROP_ALIASES = {
    "maize": "Corn",
    "corn": "Corn",
    "mungbean": "Mung Bean",
    "mung bean": "Mung Bean",
    "gabi": "Gabi / Taro",
    "taro": "Gabi / Taro",
    "gabi taro": "Gabi / Taro",
    **{name.lower(): name for name in SUPPORTED_CROP_NAMES},
}

FIELD_INPUT_LIMITS = {
    "ph_level": (3.5, 9.5),
    "moisture_percent": (5.0, 100.0),
    "soil_temperature_c": (10.0, 45.0),
}


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
    {
        "crop": "Coconut",
        "base": 63,
        "reason": "Perennial crop for warm coastal or lowland areas with deep, well-drained soil.",
        "planting_window": "Plant seedlings when rainfall is reliable and field access is stable.",
        "watering": "Keep young palms watered during dry spells until roots establish.",
        "fertilizer": "Use potassium, chloride, and organic matter based on local soil testing.",
    },
    {
        "crop": "Banana",
        "base": 66,
        "reason": "Fits warm loam to alluvial soils with steady moisture and good drainage.",
        "planting_window": "Plant at the start of rains or with dependable irrigation.",
        "watering": "Maintain even moisture, especially during bunch development.",
        "fertilizer": "Apply organic matter and potassium-rich fertilizer in split applications.",
    },
    {
        "crop": "Sugarcane",
        "base": 62,
        "reason": "Works in fertile loam or alluvial fields with full sun and reliable moisture.",
        "planting_window": "Plant setts when soil is moist and drainage channels are prepared.",
        "watering": "Keep soil moist during establishment and elongation, then avoid waterlogging.",
        "fertilizer": "Use nitrogen and potassium according to soil test and ratoon stage.",
    },
    {
        "crop": "Mango",
        "base": 58,
        "reason": "Tree crop for warm well-drained soil and drier flowering windows.",
        "planting_window": "Plant grafted seedlings at the beginning of the rainy season.",
        "watering": "Water young trees regularly, then reduce excess moisture before flowering.",
        "fertilizer": "Use compost and balanced tree fertilizer, avoiding excess nitrogen before flowering.",
    },
    {
        "crop": "Pineapple",
        "base": 59,
        "reason": "Tolerates acidic sandy loam and needs open sun with good drainage.",
        "planting_window": "Plant slips or crowns when rainfall can support early rooting.",
        "watering": "Irrigate lightly during long dry spells and avoid standing water.",
        "fertilizer": "Apply nitrogen and potassium in small scheduled doses.",
    },
    {
        "crop": "Calamansi",
        "base": 57,
        "reason": "Citrus crop for well-drained loam with steady sunlight and moderate moisture.",
        "planting_window": "Plant nursery trees when rains are beginning but fields are not waterlogged.",
        "watering": "Water young trees deeply, then let the root zone drain well.",
        "fertilizer": "Use citrus fertilizer with micronutrients and organic mulch.",
    },
    {
        "crop": "Onion",
        "base": 56,
        "reason": "Performs best in loose, well-drained soil during cooler dry periods.",
        "planting_window": "Plant during the dry season or a low-rainfall window.",
        "watering": "Use shallow, regular irrigation and reduce water near bulb maturity.",
        "fertilizer": "Balance nitrogen early with phosphorus and potassium for bulb formation.",
    },
    {
        "crop": "Cabbage",
        "base": 55,
        "reason": "Cooler-season vegetable for fertile loam and steady moisture.",
        "planting_window": "Plant during cooler months or higher-elevation conditions.",
        "watering": "Keep soil evenly moist and avoid prolonged leaf wetness.",
        "fertilizer": "Use compost plus balanced nutrients before head formation.",
    },
    {
        "crop": "Bitter Gourd",
        "base": 58,
        "reason": "Warm-season vine that fits fertile loam with full sun and trellis support.",
        "planting_window": "Plant when soil is warm and heavy rain is not expected daily.",
        "watering": "Maintain regular moisture during flowering and fruiting.",
        "fertilizer": "Add compost and balanced fertilizer, then side-dress during vine growth.",
    },
    {
        "crop": "Pepper",
        "base": 57,
        "reason": "Needs warm, well-drained loam and moderate moisture for flowering.",
        "planting_window": "Plant during a stable dry or protected rainy period.",
        "watering": "Water consistently but avoid saturated soil around roots.",
        "fertilizer": "Support phosphorus at transplanting and potassium during fruiting.",
    },
    {
        "crop": "Potato",
        "base": 54,
        "reason": "Prefers loose, cool, well-drained soil for tuber formation.",
        "planting_window": "Plant during cooler months or in suitable upland areas.",
        "watering": "Keep soil moist but not waterlogged during tuber bulking.",
        "fertilizer": "Use balanced fertilizer and avoid too much nitrogen late in growth.",
    },
    {
        "crop": "Guava",
        "base": 56,
        "reason": "Hardy fruit tree for warm loam to sandy loam with good drainage.",
        "planting_window": "Plant seedlings at the beginning of rains.",
        "watering": "Water young trees during dry spells and avoid wet feet.",
        "fertilizer": "Use compost and balanced tree fertilizer after establishment.",
    },
    {
        "crop": "Cacao",
        "base": 55,
        "reason": "Tree crop for warm, humid, organic-rich soil with partial shade when young.",
        "planting_window": "Plant when rainfall is reliable and shade trees are ready.",
        "watering": "Keep soil moist but well-drained, especially during establishment.",
        "fertilizer": "Use organic matter plus balanced nutrients based on soil analysis.",
    },
    {
        "crop": "Coffee",
        "base": 54,
        "reason": "Perennial crop for slightly acidic, well-drained soil and moderate shade.",
        "planting_window": "Plant during the rainy season for reliable establishment.",
        "watering": "Maintain moisture for young plants and avoid stagnant water.",
        "fertilizer": "Apply compost and balanced nutrients with attention to potassium.",
    },
    {
        "crop": "Abaca",
        "base": 55,
        "reason": "Fiber crop for humid areas with deep, fertile, well-drained soil.",
        "planting_window": "Plant suckers when rainfall is steady.",
        "watering": "Keep soil moist without prolonged flooding.",
        "fertilizer": "Use organic matter and potassium support for fiber growth.",
    },
]

CLAY_FRIENDLY = {"rice", "gabi taro", "eggplant", "pechay", "cabbage", "sugarcane"}
SANDY_FRIENDLY = {"corn", "cassava", "mung bean", "sweet potato", "pineapple", "calamansi", "guava"}
LOAM_FRIENDLY = {
    "corn",
    "tomato",
    "eggplant",
    "pechay",
    "onion",
    "cabbage",
    "bitter gourd",
    "pepper",
    "potato",
    "banana",
    "mango",
    "cacao",
    "coffee",
    "guava",
    "calamansi",
}
ALLUVIAL_FRIENDLY = {"rice", "corn", "pechay", "onion", "banana", "coconut", "sugarcane", "gabi taro"}
ACID_TOLERANT = {"rice", "cassava", "sweet potato", "pineapple", "coconut", "coffee", "cacao", "banana", "abaca"}
NEUTRAL_PH_FRIENDLY = {"tomato", "eggplant", "pechay", "corn", "onion", "cabbage", "bitter gourd", "pepper", "potato", "mung bean"}
ALKALINE_SENSITIVE = {"tomato", "pechay", "onion", "cabbage", "potato", "coffee", "cacao", "pepper"}
HIGH_MOISTURE_FRIENDLY = {"rice", "gabi taro", "sugarcane", "coconut", "banana", "cacao", "abaca"}
LOW_MOISTURE_FRIENDLY = {"cassava", "mung bean", "sweet potato", "pineapple", "calamansi", "corn", "guava"}
MODERATE_MOISTURE_FRIENDLY = {"corn", "tomato", "eggplant", "pechay", "onion", "cabbage", "bitter gourd", "pepper", "potato", "mango", "guava"}
WARM_SOIL_FRIENDLY = {
    "corn",
    "eggplant",
    "cassava",
    "mung bean",
    "sweet potato",
    "pineapple",
    "banana",
    "mango",
    "coconut",
    "cacao",
    "coffee",
    "sugarcane",
    "bitter gourd",
    "pepper",
    "abaca",
}
COOL_SOIL_FRIENDLY = {"pechay", "cabbage", "potato", "onion", "tomato"}
FULL_SUN_FRIENDLY = {
    "corn",
    "tomato",
    "eggplant",
    "cassava",
    "mung bean",
    "banana",
    "mango",
    "pineapple",
    "calamansi",
    "bitter gourd",
    "pepper",
    "sugarcane",
    "guava",
    "coconut",
}
PARTIAL_SHADE_FRIENDLY = {"pechay", "gabi taro", "cacao", "coffee", "abaca"}
DRY_SEASON_FRIENDLY = {"corn", "cassava", "mung bean", "sweet potato", "onion", "tomato", "pepper", "mango", "pineapple"}
WET_SEASON_FRIENDLY = {"rice", "gabi taro", "sugarcane", "coconut", "banana", "abaca", "cacao"}


def _normalize_crop_name(value: str | None) -> str:
    normalized = (value or "").strip().lower().replace("_", " ").replace("-", " ")
    return " ".join(normalized.replace("/", " ").split())


def _canonical_supported_crop_name(value: str | None) -> str | None:
    normalized = _normalize_crop_name(value)
    if not normalized:
        return None
    return SUPPORTED_CROP_ALIASES.get(normalized)


def _soil_input_guardrail(
    ph_level: float | None,
    moisture_percent: float | None,
    soil_temperature_c: float | None,
) -> dict:
    cap = 98
    penalty = 0
    warnings: list[str] = []

    if ph_level is not None:
        if ph_level < 3.5 or ph_level > 9.5:
            cap = min(cap, 35)
            penalty += 35
            warnings.append("Recheck the pH reading. Productive soil is usually between pH 3.5 and 9.5.")
        elif ph_level < 4.5 or ph_level > 8.8:
            cap = min(cap, 55)
            penalty += 18
            warnings.append("The pH is outside the safe range for most crops; correct soil pH before planting.")
        elif ph_level < 5.2 or ph_level > 8.2:
            cap = min(cap, 72)
            penalty += 8
            warnings.append("The pH is stressful for many crops and lowers suitability.")

    if moisture_percent is not None:
        if moisture_percent < 5:
            cap = min(cap, 40)
            penalty += 30
            warnings.append("Soil moisture is near dry. Irrigate or recheck the moisture meter before choosing a crop.")
        elif moisture_percent < 15:
            cap = min(cap, 58)
            penalty += 12
            warnings.append("Soil moisture is very low, so water-demanding crops should be delayed.")
        elif moisture_percent > 95:
            cap = min(cap, 45)
            penalty += 25
            warnings.append("Soil moisture is saturated. Improve drainage before planting most crops.")
        elif moisture_percent > 85:
            cap = min(cap, 65)
            penalty += 10
            warnings.append("Soil moisture is high and may reduce crops that dislike waterlogging.")

    if soil_temperature_c is not None:
        if soil_temperature_c < 10 or soil_temperature_c > 45:
            cap = min(cap, 40)
            penalty += 30
            warnings.append("Recheck soil temperature. A crop bed reading should normally be between 10C and 45C.")
        elif soil_temperature_c < 18 or soil_temperature_c > 38:
            cap = min(cap, 60)
            penalty += 12
            warnings.append("Soil temperature is stressful and lowers planting suitability.")

    return {"cap": cap, "penalty": penalty, "warnings": warnings}


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
    guardrail = _soil_input_guardrail(ph_level, moisture_percent, soil_temperature_c)

    candidates = CROP_RECOMMENDATION_TEMPLATES

    scored = []
    for candidate in candidates:
        score = candidate["base"]
        crop = _normalize_crop_name(candidate["crop"])

        if "clay" in soil:
            score += 12 if crop in CLAY_FRIENDLY else -4
        if "sandy" in soil:
            score += 12 if crop in SANDY_FRIENDLY else -5
        if "loam" in soil:
            score += 10 if crop in LOAM_FRIENDLY else 4
        if "alluvial" in soil:
            score += 12 if crop in ALLUVIAL_FRIENDLY else 5

        if ph_level is not None:
            if 6.0 <= ph_level <= 7.0:
                score += 9 if crop in NEUTRAL_PH_FRIENDLY else 4
            elif ph_level < 5.6:
                score += 8 if crop in ACID_TOLERANT else -10
            elif ph_level > 7.5:
                score += -8 if crop in ALKALINE_SENSITIVE else 2

        if moisture_percent is not None:
            if moisture_percent >= 65:
                score += 12 if crop in HIGH_MOISTURE_FRIENDLY else -6
            elif moisture_percent <= 35:
                score += 10 if crop in LOW_MOISTURE_FRIENDLY else -5
            else:
                score += 8 if crop in MODERATE_MOISTURE_FRIENDLY else 3

        if soil_temperature_c is not None:
            if soil_temperature_c >= 30:
                score += 8 if crop in WARM_SOIL_FRIENDLY else 0
                score -= 5 if crop in COOL_SOIL_FRIENDLY else 0
            elif 22 <= soil_temperature_c <= 29:
                score += 7 if crop in (NEUTRAL_PH_FRIENDLY | MODERATE_MOISTURE_FRIENDLY) else 3
            elif soil_temperature_c < 22:
                score += 5 if crop in COOL_SOIL_FRIENDLY else -4

        if "poor" in drainage_value or "water" in drainage_value:
            score += 13 if crop in HIGH_MOISTURE_FRIENDLY else -8
        elif "good" in drainage_value:
            score += 9 if crop in (LOW_MOISTURE_FRIENDLY | MODERATE_MOISTURE_FRIENDLY) else 1

        if "partial" in sunlight_value:
            score += 6 if crop in PARTIAL_SHADE_FRIENDLY else -3
        elif "full" in sunlight_value:
            score += 6 if crop in FULL_SUN_FRIENDLY else 2

        if "rain" in season_value or "wet" in season_value:
            score += 8 if crop in WET_SEASON_FRIENDLY else -2
        elif "dry" in season_value:
            score += 8 if crop in DRY_SEASON_FRIENDLY else -3

        if nitrogen == "low":
            score += 7 if crop == "mung bean" else -2
        if phosphorus == "low":
            score -= 3 if crop in {"tomato", "corn", "sweet potato", "onion", "potato"} else 0
        if potassium == "low":
            score -= 4 if crop in {"tomato", "cassava", "sweet potato", "banana", "coconut", "pineapple", "potato"} else 0

        if live_weather:
            if rain_probability is not None and rain_probability >= 0.55:
                score += 10 if crop in WET_SEASON_FRIENDLY else -2
                score -= 6 if crop == "tomato" else 0
            elif rain_probability is not None and rain_probability <= 0.25 and moisture_percent is not None and moisture_percent <= 40:
                score += 8 if crop in LOW_MOISTURE_FRIENDLY else 0
                score -= 5 if crop in HIGH_MOISTURE_FRIENDLY else 0

            if precipitation is not None and precipitation >= 1:
                score += 6 if crop in HIGH_MOISTURE_FRIENDLY else 0
                score -= 4 if crop in {"tomato", "pechay"} else 0

            if temperature is not None:
                if temperature >= 32:
                    score += 6 if crop in WARM_SOIL_FRIENDLY else 0
                    score -= 4 if crop in {"pechay", "tomato"} else 0
                elif 24 <= temperature <= 30:
                    score += 5 if crop in {"tomato", "pechay", "corn", "eggplant", "banana", "coconut"} else 0

            if humidity is not None and humidity >= 82:
                score += 4 if crop in WET_SEASON_FRIENDLY else 0
                score -= 6 if crop == "tomato" else 0

        final_score = max(20, min(guardrail["cap"], round(score - guardrail["penalty"])))
        scored.append({**candidate, "suitability": final_score, "suitability_cap": guardrail["cap"]})

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
        air_temperature_c=temperature,
        humidity_percent=humidity,
        rainfall_mm=_model_rainfall_mm(season_value, moisture_percent, drainage_value, rain_probability, precipitation),
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
    if guardrail["warnings"]:
        recommendation_basis.insert(0, "Suitability was capped because one or more soil readings are outside normal planting ranges.")

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
        "soil_warnings": guardrail["warnings"],
        "scan_valid": not guardrail["warnings"],
        "soil_actions": _soil_actions(
            ph_level,
            moisture_percent,
            soil_temperature_c,
            nitrogen,
            phosphorus,
            potassium,
            drainage_value,
            live_weather,
            guardrail["warnings"],
        ),
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
            "f1_score": model_prediction.get("f1_score") if model_prediction else None,
            "top_3_accuracy": model_prediction.get("top_3_accuracy") if model_prediction else None,
            "features": model_prediction.get("model_features") if model_prediction else None,
        },
    }


def _blend_model_recommendations(model_prediction: dict, scored: list[dict]) -> list[dict]:
    scored_by_crop = {_normalize_crop_name(item["crop"]): item for item in scored}
    ranked: list[dict] = []
    seen: set[str] = set()

    for prediction in model_prediction.get("predictions", []):
        crop_name = str(prediction.get("crop", ""))
        canonical_crop = _canonical_supported_crop_name(crop_name)
        if canonical_crop is None:
            continue
        crop_key = _normalize_crop_name(canonical_crop)
        if crop_key in seen:
            continue
        rule_item = scored_by_crop.get(crop_key)
        if rule_item is None:
            continue

        probability = float(prediction.get("probability") or 0)
        if probability <= 0.001:
            continue
        model_score = 60 + (probability * 38)
        suitability_cap = int(rule_item.get("suitability_cap", 98))
        suitability = max(20, min(suitability_cap, round((model_score * 0.68) + (rule_item["suitability"] * 0.32))))
        ranked.append(
            {
                **rule_item,
                "crop": canonical_crop,
                "suitability": suitability,
                "model_confidence": round(probability, 2),
                "rule_suitability": rule_item["suitability"],
            }
        )
        seen.add(crop_key)

    for rule_item in sorted(scored, key=lambda item: item["suitability"], reverse=True):
        crop_key = _normalize_crop_name(rule_item["crop"])
        if crop_key not in seen:
            ranked.append({**rule_item, "model_confidence": 0, "rule_suitability": rule_item["suitability"]})
            seen.add(crop_key)
        if len(ranked) >= 4:
            break

    return sorted(ranked, key=lambda item: item["suitability"], reverse=True)[:4]


def _generic_crop_template(crop_name: str) -> dict:
    name = crop_name.strip() or "Recommended crop"
    return {
        "crop": name,
        "base": 64,
        "reason": f"The trained crop dataset matched the entered soil nutrients and weather conditions to {name}.",
        "planting_window": "Plant when local weather, seed availability, and farm water supply are suitable.",
        "watering": "Match irrigation to crop stage and avoid prolonged water stress or waterlogging.",
        "fertilizer": "Use a soil-test based fertilizer plan and adjust nitrogen, phosphorus, and potassium before planting.",
        "suitability": 64,
    }


def _soil_summary(
    soil_type: str,
    ph_level: float | None,
    moisture_percent: float | None,
    drainage: str,
    soil_temperature_c: float | None = None,
) -> str:
    details = [f"{soil_type} soil"]
    if ph_level is not None:
        if ph_level < 3.5:
            details.append("extremely acidic pH")
        elif ph_level < 5.6:
            details.append("acidic pH")
        elif ph_level <= 7.2:
            details.append("near-neutral pH")
        elif ph_level > 9.5:
            details.append("extremely alkaline pH")
        else:
            details.append("alkaline pH")
    if moisture_percent is not None:
        if moisture_percent < 5:
            details.append("near-dry moisture")
        elif moisture_percent >= 65:
            details.append("high moisture")
        elif moisture_percent <= 35:
            details.append("low moisture")
        else:
            details.append("moderate moisture")
    if soil_temperature_c is not None:
        if soil_temperature_c < 10:
            details.append("very cold soil")
        elif soil_temperature_c > 45:
            details.append("very hot soil")
        elif soil_temperature_c >= 30:
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
    guardrail_warnings: list[str] | None = None,
) -> list[str]:
    actions: list[str] = []
    if guardrail_warnings:
        actions.extend(guardrail_warnings)
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


def _model_rainfall_mm(
    season: str,
    moisture_percent: float | None,
    drainage: str,
    rain_probability: float | None,
    precipitation_mm: float | None,
) -> float | None:
    if precipitation_mm is not None and precipitation_mm >= 20:
        return min(float(precipitation_mm), 350.0)

    if "wet" in season or "rain" in season:
        rainfall = 215.0
    elif "dry" in season:
        rainfall = 65.0
    else:
        rainfall = 130.0

    if rain_probability is not None:
        rainfall += (float(rain_probability) - 0.35) * 90
    if precipitation_mm is not None:
        rainfall += min(float(precipitation_mm), 20.0) * 2.5
    if moisture_percent is not None:
        if moisture_percent >= 70:
            rainfall += 25
        elif moisture_percent <= 35:
            rainfall -= 25
    if "water" in drainage:
        rainfall += 35
    elif "poor" in drainage:
        rainfall += 15
    elif "good" in drainage:
        rainfall -= 10
    return max(20.0, min(350.0, round(rainfall, 2)))


def _recommendation_basis(soil_summary: str, weather: dict | None, location_label: str | None) -> list[str]:
    basis = [f"Matched against {soil_summary.lower()}"]
    if location_label:
        basis.append(f"Using current location: {location_label}")
    weather_summary = _weather_summary(weather)
    if weather_summary:
        basis.append(f"Live weather considered: {weather_summary}")
    return basis
