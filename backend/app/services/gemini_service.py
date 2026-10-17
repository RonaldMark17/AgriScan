import base64
import json
import logging
from pathlib import Path
from typing import Any

import httpx

from app.core.config import get_settings
from app.services.ml_service import DiseaseDetection

logger = logging.getLogger(__name__)
settings = get_settings()

GEMINI_API_URL_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"

PHILIPPINES_DISEASE_PROMPT = """
You are AgriScan's Chief Agronomist and Senior Plant Pathologist specializing EXCLUSIVELY in the Republic of the Philippines (Luzon, Visayas, Mindanao).
Standards reference: Philippine Department of Agriculture (DA), Bureau of Plant Industry (DA-BPI), Philippine Rice Research Institute (PhilRice), and PCARRD.

Analyze the uploaded image carefully.

CRITICAL PHILIPPINES-ONLY RULES:
1. ONLY diagnose crops cultivated and grown in the Philippines. Examples:
   - Palay / Rice (e.g. IR64, Dinorado, RC varieties)
   - Mais / Corn (Yellow & White flint)
   - Saging / Banana (Saba, Cardaba, Lakatan, Cavendish)
   - Mangga / Mango (Carabao, Pico)
   - Niyog / Coconut
   - Calamansi
   - Tubo / Sugarcane
   - Kamoteng Kahoy / Cassava & Kamote / Sweet Potato
   - Gabi / Taro
   - Gulay / Vegetables (Ampalaya, Talong, Kamatis, Pechay, Sitaw, Kalabasa, Sibuyas)
   - Kape / Coffee & Cacao & Abaca
2. If the image is NOT a plant, leaf, crop fruit, or agricultural symptom (e.g. animal, human, vehicle, household furniture, or temperate non-Philippine crop like wheat, cranberries, barley), set:
   - disease_name: "Invalid crop or leaf image"
   - confidence: 0.1
   - cause: "The image is not a recognizable Philippine crop, leaf, or agricultural plant part."
   - treatment: "Please upload a clear close-up photo of an affected Philippine crop leaf or plant part."
3. If healthy, set disease_name: "Healthy crop", severity: "mild", confidence_band: "high".
4. If diseased, identify the exact disease common in the Philippines (e.g. Bacterial Leaf Blight, Rice Blast, Tungro, Anthracnose, Downy Mildew, Citrus Greening/Huanglongbing, Sigatoka, etc.).
5. Treatments MUST reference practical Philippine management: cultural practices, sanitation, organic remedies (e.g. neem extract, trichoderma), and Fertilizer and Pesticide Authority (FPA) approved active ingredients.

Respond ONLY with a valid JSON object matching this schema:
{
  "crop_label": "Crop Name (e.g. Rice (Palay), Mango (Mangga))",
  "disease_name": "Disease Name or Healthy Crop",
  "confidence": 0.94,
  "severity": "mild|moderate|severe|critical",
  "confidence_band": "high|medium|low",
  "cause": "Concise explanation of the pathogen or issue in Philippine tropical climate",
  "treatment": "Actionable, step-by-step treatment guidance tailored for Filipino farmers",
  "immediate_actions": ["Action 1", "Action 2", "Action 3"],
  "affected_area_percentage": 15.0,
  "disease_stage": "early|mid|late|advanced",
  "visual_symptoms": ["Symptom 1", "Symptom 2"],
  "reliability_score": 0.95
}
"""

PHILIPPINES_SOIL_PROMPT_TEMPLATE = """
You are AgriScan's Chief Soil Agronomist and Cropping Specialist strictly for the PHILIPPINES.
Reference standards: Bureau of Soils and Water Management (DA-BSWM), PhilRice, and Department of Agriculture (DA).

Analyze the following soil and field data from a Philippine farm:
- Soil Type: {soil_type}
- Soil pH: {ph_level}
- Soil Moisture: {moisture_percent}%
- Soil Temperature: {soil_temperature_c}°C
- Nitrogen: {nitrogen_level}
- Phosphorus: {phosphorus_level}
- Potassium: {potassium_level}
- Drainage: {drainage}
- Sunlight: {sunlight}
- Season: {season}
- Province / Region: {province}
- Live Weather: {weather_summary}

CRITICAL PHILIPPINES CONSTRAINTS:
1. Recommend ONLY crops that are agronomically and economically viable in the Philippines and suitable for {province}.
2. Take into account Philippine climate seasons (Amihan, Habagat, Dry Season, Wet Season) and typhoon/monsoon risks.
3. Recommend the top 4-6 most suitable Philippine crops ranked by suitability percentage (0 to 100).
4. Provide practical soil preparation steps (e.g. agricultural lime dosage, organic compost incorporation, drainage furrows).

Respond ONLY with a valid JSON object matching this schema:
{{
  "best_crop": "Top Crop Name (e.g. Rice (Palay))",
  "confidence": 0.90,
  "soil_summary": "Concise agronomic evaluation of this soil in Philippine conditions",
  "soil_actions": ["Immediate soil action 1", "Action 2", "Action 3"],
  "recommendations": [
    {{
      "crop": "Crop Name",
      "suitability": 88,
      "reason": "Why this crop thrives in this soil, pH, and Philippine province/season",
      "planting_window": "Best months to plant in the Philippines",
      "watering": "Watering or irrigation instructions",
      "fertilizer": "Fertilizer schedule (NPK, compost, lime)",
      "risk_flags": ["Potential Philippine weather or pest risks"]
    }}
  ]
}}
"""


async def detect_disease_with_gemini(
    image_path: str | Path,
    crop_type_hint: str | None = None,
) -> DiseaseDetection | None:
    """Diagnose plant diseases from an image using Google Gemini Multimodal Vision API."""
    api_key = settings.gemini_api_key
    if not api_key or not settings.use_gemini_ai:
        return None

    path = Path(image_path)
    if not path.exists():
        logger.warning("Image path does not exist for Gemini detection: %s", image_path)
        return None

    try:
        image_bytes = path.read_bytes()
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        suffix = path.suffix.lower()
        mime_type = "image/png" if suffix == ".png" else "image/webp" if suffix == ".webp" else "image/jpeg"

        hint_text = f"\nUser noted crop type hint: {crop_type_hint}\n" if crop_type_hint else ""
        full_prompt = PHILIPPINES_DISEASE_PROMPT + hint_text

        model_name = settings.gemini_model or "gemini-flash-latest"
        url = GEMINI_API_URL_TEMPLATE.format(model=model_name, key=api_key)

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": full_prompt},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": image_b64,
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.2,
            },
        }

        async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=10.0)) as client:
            response = await client.post(url, json=payload)

        if response.status_code != 200:
            logger.error("Gemini Disease Detection API error: %s - %s", response.status_code, response.text[:200])
            return None

        result_json = response.json()
        candidates = result_json.get("candidates", [])
        if not candidates:
            return None

        text_content = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        data = json.loads(text_content)

        return DiseaseDetection(
            disease_name=data.get("disease_name") or "Healthy crop",
            confidence=float(data.get("confidence", 0.90)),
            cause=data.get("cause") or "Evaluated by Gemini AI under Philippine agricultural standards.",
            treatment=data.get("treatment") or "Follow standard Philippine Good Agricultural Practices (PhilGAP).",
            crop_label=data.get("crop_label"),
            analysis_mode="gemini-ai",
            severity=data.get("severity", "mild"),
            confidence_band=data.get("confidence_band", "high"),
            visual_symptoms=data.get("visual_symptoms", []),
            affected_area_percentage=float(data.get("affected_area_percentage", 10.0)),
            disease_stage=data.get("disease_stage", "early"),
            immediate_actions=data.get("immediate_actions", []),
            reliability_score=float(data.get("reliability_score", 0.95)),
        )

    except Exception as exc:
        logger.exception("Gemini plant disease detection failed gracefully, falling back to local model: %s", exc)
        return None


async def recommend_crops_with_gemini(
    *,
    soil_type: str,
    ph_level: float | None,
    moisture_percent: float | None,
    soil_temperature_c: float | None,
    nitrogen_level: str | None,
    phosphorus_level: str | None,
    potassium_level: str | None,
    drainage: str | None,
    sunlight: str | None,
    season: str | None,
    province: str | None,
    weather: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Generate tailored Philippine soil crop recommendations using Gemini API."""
    api_key = settings.gemini_api_key
    if not api_key or not settings.use_gemini_ai:
        return None

    try:
        weather_summary = "Warm tropical climate"
        if weather:
            desc = weather.get("description") or weather.get("summary")
            temp = weather.get("temperature")
            weather_summary = f"{desc}, {temp}°C" if temp else str(desc or "Tropical Philippine weather")

        prompt = PHILIPPINES_SOIL_PROMPT_TEMPLATE.format(
            soil_type=soil_type or "Loam",
            ph_level=ph_level if ph_level is not None else "Not tested (assume ~6.0)",
            moisture_percent=moisture_percent if moisture_percent is not None else "Moderate (~50%)",
            soil_temperature_c=soil_temperature_c if soil_temperature_c is not None else "28",
            nitrogen_level=nitrogen_level or "medium",
            phosphorus_level=phosphorus_level or "medium",
            potassium_level=potassium_level or "medium",
            drainage=drainage or "moderate",
            sunlight=sunlight or "full sun",
            season=season or "regular season",
            province=province or "Philippines",
            weather_summary=weather_summary,
        )

        model_name = settings.gemini_model or "gemini-flash-latest"
        url = GEMINI_API_URL_TEMPLATE.format(model=model_name, key=api_key)

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.2,
            },
        }

        async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=10.0)) as client:
            response = await client.post(url, json=payload)

        if response.status_code != 200:
            logger.error("Gemini Soil Recommendation API error: %s - %s", response.status_code, response.text[:200])
            return None

        result_json = response.json()
        candidates = result_json.get("candidates", [])
        if not candidates:
            return None

        text_content = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        data = json.loads(text_content)

        return {
            "best_crop": data.get("best_crop", "Rice"),
            "confidence": float(data.get("confidence", 0.90)),
            "soil_summary": data.get("soil_summary", "Analyzed using Gemini AI under Philippine agro-climatic conditions."),
            "soil_actions": data.get("soil_actions", ["Follow DA-BSWM recommended soil management"]),
            "recommendations": data.get("recommendations", []),
            "analysis_mode": "gemini-ai",
        }

    except Exception as exc:
        logger.exception("Gemini soil crop recommendation failed gracefully, falling back to local model: %s", exc)
        return None
