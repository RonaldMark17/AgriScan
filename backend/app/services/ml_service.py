import logging
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import numpy as np
from PIL import Image

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
BACKEND_DIR = Path(__file__).resolve().parents[2]

VISUAL_MEMORY_FEATURE_KEYS = (
    "green_leaf_ratio",
    "lesion_ratio",
    "lesion_within_plant",
    "yellow_ratio",
    "rust_ratio",
    "dark_lesion_ratio",
    "edge_lesion_ratio",
    "component_count",
    "max_component_area_ratio",
    "max_component_aspect",
    "green_component_count",
    "max_green_area_ratio",
    "max_green_aspect",
    "green_edge_ratio",
    "adjacent_nonleaf_ratio",
    "banana_fruit_ratio",
    "fruit_component_count",
    "max_fruit_area_ratio",
    "max_fruit_aspect",
    "chroma_green_ratio",
    "natural_green_ratio",
    "center_green_ratio",
    "center_chroma_green_ratio",
    "center_natural_green_ratio",
    "center_lesion_ratio",
    "center_fruit_ratio",
    "center_neutral_ratio",
    "center_tan_ratio",
    "contrast",
)

VISUAL_MEMORY_DISTANCE_SCALES = {
    "contrast": 80.0,
    "component_count": 35.0,
    "green_component_count": 25.0,
    "fruit_component_count": 25.0,
    "max_component_aspect": 8.0,
    "max_green_aspect": 8.0,
    "max_fruit_aspect": 8.0,
}

VISUAL_MEMORY_STRICT_DISTANCE = 0.055
VISUAL_MEMORY_HINTED_DISTANCE = 0.16


@dataclass
class DiseaseDetection:
    disease_name: str
    confidence: float
    cause: str
    treatment: str
    crop_label: str | None = None
    analysis_mode: str = "ml"
    reference_url: str | None = None
    reference_title: str | None = None
    detections: list[dict[str, Any]] | None = None


CLASS_METADATA: dict[str, dict[str, str]] = {
    "pest_leaf_damage": {
        "name": "Pest-related leaf damage",
        "cause": "Chewing or sucking insects are causing visible lesions, holes, or discoloration on the leaf surface.",
        "treatment": "Inspect leaf undersides, remove heavily affected leaves, and follow integrated pest management before using any DA-approved pesticide.",
    },
    "healthy": {
        "name": "Healthy crop",
        "cause": "No major disease pattern was detected by the model.",
        "treatment": "Continue regular monitoring, balanced watering, sanitation, and nutrient management.",
    },
    "review_needed": {
        "name": "Crop scan needs review",
        "cause": "AgriScan could not safely match the uploaded image to one specific crop disease from the visible patterns.",
        "treatment": "Retake a close, well-lit photo of one affected leaf or fruit, select the crop type, and confirm with a local agriculture officer before applying treatment.",
    },
    "invalid_crop_image": {
        "name": "Invalid crop or leaf image",
        "cause": "The uploaded photo does not appear to be a crop, leaf, fruit, or plant part that AgriScan can diagnose.",
        "treatment": "Upload a clear close-up photo of one crop leaf, fruit, stem, or plant part. Avoid animals, people, tools, vehicles, and indoor objects.",
    },
    "leaf_spot_or_blight": {
        "name": "Leaf spot or blight symptoms",
        "cause": "The image shows brown or yellow necrotic patches on leaf tissue, which is consistent with a leaf spot or blight pattern.",
        "treatment": "Remove heavily affected leaves, improve airflow, avoid wetting foliage, and confirm the specific disease with a local agriculture officer before spraying.",
    },
    "banana_fruit_rot": {
        "name": "Banana fruit rot symptoms",
        "cause": "The image shows dark, sunken, or spreading lesions on banana fruit tissue instead of a leaf-only disease pattern.",
        "treatment": "Remove badly affected fruit, keep bunches dry and protected from injury, improve sanitation, and ask local agriculture support to confirm anthracnose, crown rot, or another postharvest rot before treatment.",
    },
    "banana_crown_rot": {
        "name": "Banana crown or bunch rot symptoms",
        "cause": "The image shows dark decay around the banana crown, cut ends, or bunch tissue, which is more consistent with bunch or postharvest rot than a leaf blight.",
        "treatment": "Separate affected hands, avoid wounding fruit during harvest, clean tools and handling surfaces, and confirm locally before applying any postharvest treatment.",
    },
    "corn_ear_pest_damage": {
        "name": "Corn earworm or borer damage",
        "cause": "The image shows damaged corn kernels or husk tissue, which is more consistent with ear-feeding pest damage than a leaf disease.",
        "treatment": "Inspect nearby ears for larvae and frass, remove badly damaged ears, improve field sanitation, and follow local corn IPM thresholds before using any pesticide.",
    },
    "corn_stalk_rot": {
        "name": "Corn stalk rot symptoms",
        "cause": "The image shows browning, decay, or lesions on corn stalk tissue instead of a leaf-only disease pattern.",
        "treatment": "Remove heavily affected stalks after harvest, improve field drainage and residue management, avoid plant stress where practical, and confirm the stalk rot cause with a local agriculture officer.",
    },
}

DEFAULT_LABELS = [
    "rice_healthy",
    "rice_bacterial_leaf_blight",
    "rice_blast",
    "rice_brown_spot",
    "rice_tungro_virus",
    "rice_hispa",
    "rice_leaf_folder",
    "rice_brown_plant_hopper",
    "corn_healthy",
    "corn_gray_leaf_spot",
    "corn_common_rust",
    "corn_northern_leaf_blight",
    "tomato_healthy",
    "tomato_bacterial_spot",
    "tomato_early_blight",
    "tomato_late_blight",
    "pepper_healthy",
    "pepper_bacterial_spot",
    "potato_healthy",
    "potato_early_blight",
    "potato_late_blight",
    "banana_healthy",
    "banana_black_sigatoka",
    "banana_bract_mosaic_virus",
    "banana_insect_pest",
    "banana_moko_disease",
    "banana_panama_disease",
    "banana_yellow_sigatoka",
    "mango_healthy",
    "mango_anthracnose",
    "mango_bacterial_canker",
    "mango_cutting_weevil",
    "mango_die_back",
    "mango_gall_midge",
    "mango_powdery_mildew",
    "mango_sooty_mould",
    "guava_healthy",
    "guava_phytophthora",
    "guava_red_rust",
    "guava_scab",
    "guava_styler_and_root",
]

CROP_DISPLAY_NAMES = {
    "rice": "Rice",
    "corn": "Corn",
    "coconut": "Coconut",
    "sugarcane": "Sugarcane",
    "cassava": "Cassava",
    "sweet_potato": "Sweet Potato",
    "tomato": "Tomato",
    "eggplant": "Eggplant",
    "mung_bean": "Mung Bean",
    "pepper": "Pepper",
    "potato": "Potato",
    "banana": "Banana",
    "mango": "Mango",
    "pineapple": "Pineapple",
    "calamansi": "Calamansi",
    "onion": "Onion",
    "cabbage": "Cabbage",
    "pechay": "Pechay",
    "gabi_taro": "Gabi / Taro",
    "bitter_gourd": "Bitter Gourd",
    "guava": "Guava",
    "cacao": "Cacao",
    "coffee": "Coffee",
    "abaca": "Abaca",
}

LEGACY_CLASS_TO_CROP = {
    "rice_bacterial_leaf_blight": "rice",
    "corn_leaf_blight": "corn",
    "tomato_late_blight": "tomato",
    "pest_leaf_damage": None,
    "healthy": None,
}

CLASS_ALIASES = {
    "bacterial_leaf_blight": "rice_bacterial_leaf_blight",
    "bacterialblight": "rice_bacterial_leaf_blight",
    "bacterial_blight": "rice_bacterial_leaf_blight",
    "rice_brownspot": "rice_brown_spot",
    "brownspot": "rice_brown_spot",
    "tungro_virus": "rice_tungro_virus",
    "brown_plant_hopper": "rice_brown_plant_hopper",
    "corn_leaf_blight": "corn_northern_leaf_blight",
    "corn_(maize)___cercospora_leaf_spot_gray_leaf_spot": "corn_gray_leaf_spot",
    "corn_gray_leaf_spot": "corn_gray_leaf_spot",
    "corn_(maize)___common_rust_": "corn_common_rust",
    "corn_rust_leaf": "corn_common_rust",
    "corn_(maize)___northern_leaf_blight": "corn_northern_leaf_blight",
    "corn___northern_leaf_blight": "corn_northern_leaf_blight",
    "northern_leaf_blight": "corn_northern_leaf_blight",
    "tomato___bacterial_spot": "tomato_bacterial_spot",
    "tomato___early_blight": "tomato_early_blight",
    "tomato___late_blight": "tomato_late_blight",
    "late_blight": "tomato_late_blight",
    "tomato___leaf_mold": "tomato_leaf_mold",
    "tomato___septoria_leaf_spot": "tomato_septoria_leaf_spot",
    "tomato___spider_mites_two_spotted_spider_mite": "tomato_spider_mites",
    "spider_mites": "tomato_spider_mites",
    "tomato___target_spot": "tomato_target_spot",
    "tomato___tomato_yellow_leaf_curl_virus": "tomato_yellow_leaf_curl_virus",
    "tomato___tomato_mosaic_virus": "tomato_mosaic_virus",
    "tomato_tomato_mosaic_virus": "tomato_mosaic_virus",
    "pepper,_bell___bacterial_spot": "pepper_bacterial_spot",
    "pepper,_bell___healthy": "pepper_healthy",
    "potato___early_blight": "potato_early_blight",
    "potato___late_blight": "potato_late_blight",
    "potato___healthy": "potato_healthy",
    "banana_healthy_leaf": "banana_healthy",
    "black_sigatoka": "banana_black_sigatoka",
    "bract_mosaic_virus": "banana_bract_mosaic_virus",
    "insect_pest": "banana_insect_pest",
    "moko_disease": "banana_moko_disease",
    "panama_disease": "banana_panama_disease",
    "yellow_sigatoka": "banana_yellow_sigatoka",
    "anthracnose": "mango_anthracnose",
    "bacterial_canker": "mango_bacterial_canker",
    "cutting_weevil": "mango_cutting_weevil",
    "die_back": "mango_die_back",
    "gall_midge": "mango_gall_midge",
    "phoma": "mango_phoma_blight",
    "phoma_blight": "mango_phoma_blight",
    "powdery_mildew": "mango_powdery_mildew",
    "sooty_mould": "mango_sooty_mould",
    "phytopthora": "guava_phytophthora",
    "red_rust": "guava_red_rust",
    "styler_and_root": "guava_styler_and_root",
    "healthy": "healthy",
}

CROP_ALIASES = {
    "palay": "rice",
    "rice": "rice",
    "mais": "corn",
    "maize": "corn",
    "corn": "corn",
    "niyog": "coconut",
    "coconut": "coconut",
    "sugar cane": "sugarcane",
    "sugarcane": "sugarcane",
    "tubo": "sugarcane",
    "kamoteng kahoy": "cassava",
    "kamote kahoy": "cassava",
    "cassava": "cassava",
    "camote": "sweet_potato",
    "kamote": "sweet_potato",
    "sweet potato": "sweet_potato",
    "sweet_potato": "sweet_potato",
    "kamatis": "tomato",
    "tomato": "tomato",
    "tomatoes": "tomato",
    "talong": "eggplant",
    "eggplant": "eggplant",
    "aubergine": "eggplant",
    "mongo": "mung_bean",
    "monggo": "mung_bean",
    "mung bean": "mung_bean",
    "mungbean": "mung_bean",
    "mung_bean": "mung_bean",
    "sili": "pepper",
    "chili": "pepper",
    "chilli": "pepper",
    "bell pepper": "pepper",
    "pepper": "pepper",
    "patatas": "potato",
    "potato": "potato",
    "saging": "banana",
    "banana": "banana",
    "mangga": "mango",
    "mango": "mango",
    "pinya": "pineapple",
    "pineapple": "pineapple",
    "kalamansi": "calamansi",
    "calamansi": "calamansi",
    "sibuyas": "onion",
    "onion": "onion",
    "repolyo": "cabbage",
    "cabbage": "cabbage",
    "pechay": "pechay",
    "bok choy": "pechay",
    "bokchoi": "pechay",
    "pak choi": "pechay",
    "pakchoy": "pechay",
    "gabi": "gabi_taro",
    "taro": "gabi_taro",
    "gabi taro": "gabi_taro",
    "ampalaya": "bitter_gourd",
    "bitter gourd": "bitter_gourd",
    "bitter_gourd": "bitter_gourd",
    "bayabas": "guava",
    "guava": "guava",
    "cacao": "cacao",
    "cocoa": "cacao",
    "kape": "coffee",
    "coffee": "coffee",
    "abaka": "abaca",
    "abaca": "abaca",
}

UNSUPPORTED_CROP_NAME_GUARDS = {
    "black pepper",
    "peppercorn",
    "peppercorns",
    "pepper corns",
    "paminta",
}

UNSUPPORTED_CROP_ALIASES = {
    "lettuce": "Lettuce",
    "mustard": "Mustard",
    "mustasa": "Mustard",
    "okra": "Okra",
    "lady finger": "Okra",
    "ladyfinger": "Okra",
    "jute": "Jute",
    "saluyot": "Jute",
    "kangkong": "Water Spinach",
    "water spinach": "Water Spinach",
    "spinach": "Spinach",
    "squash": "Squash",
    "kalabasa": "Squash",
    "cucumber": "Cucumber",
    "pipino": "Cucumber",
    "watermelon": "Watermelon",
    "melon": "Melon",
    "papaya": "Papaya",
    "langka": "Jackfruit",
    "jackfruit": "Jackfruit",
    "durian": "Durian",
    "rambutan": "Rambutan",
    "lanzones": "Lanzones",
    "chayote": "Chayote",
    "sayote": "Chayote",
    "sitaw": "Yardlong Bean",
    "yardlong bean": "Yardlong Bean",
    "string bean": "String Bean",
    "sigarilyas": "Winged Bean / Sigarilyas",
    "winged bean": "Winged Bean / Sigarilyas",
    "soybean": "Soybean",
    "peanut": "Peanut",
    "mani": "Peanut",
    "singkamas": "Singkamas / Jicama",
    "jicama": "Singkamas / Jicama",
    "yam bean": "Singkamas / Jicama",
    "mexican turnip": "Singkamas / Jicama",
    "black pepper": "Black Pepper",
    "peppercorn": "Black Pepper",
    "peppercorns": "Black Pepper",
    "pepper corns": "Black Pepper",
    "paminta": "Black Pepper",
    "sesame": "Sesame",
    "sunflower": "Sunflower",
    "strawberry": "Strawberry",
    "grape": "Grape",
    "orange": "Orange",
    "lemon": "Lemon",
    "lime": "Lime",
    "orchid": "Orchid",
    "rose": "Rose",
}

DISEASE_PROFILES = {
    "healthy": {
        "name": "Healthy crop",
        "cause": "No major disease pattern was detected by the model.",
        "treatment": "Continue regular monitoring, good field sanitation, balanced watering, and proper nutrition.",
    },
    "bacterial_leaf_blight": {
        "name": "Bacterial leaf blight",
        "cause": "A bacterial infection is spreading through splashing water, wind-driven rain, or infected planting material.",
        "treatment": "Use clean seed or seedlings, improve drainage, reduce excess nitrogen, and ask the local agriculture office about approved bactericide guidance.",
    },
    "blast": {
        "name": "Blast",
        "cause": "A fungal disease is attacking the leaves and can spread faster in humid, crowded field conditions.",
        "treatment": "Improve spacing and airflow, avoid heavy late nitrogen, remove badly infected material, and use resistant varieties or approved fungicide when advised.",
    },
    "brown_spot": {
        "name": "Brown spot",
        "cause": "Fungal spotting is developing on stressed leaves, often made worse by poor nutrition or prolonged moisture.",
        "treatment": "Correct nutrient imbalance, keep the field clean, avoid prolonged leaf wetness, and use approved fungicide only if field pressure is high.",
    },
    "tungro_virus": {
        "name": "Tungro virus",
        "cause": "A virus is being spread by insect vectors, leading to yellowing, stunting, and reduced vigor.",
        "treatment": "Rogue severely affected plants, control insect vectors early, synchronize planting where possible, and use tolerant varieties.",
    },
    "hispa": {
        "name": "Hispa damage",
        "cause": "Leaf-feeding hispa insects are scraping or boring leaf tissue and reducing photosynthetic area.",
        "treatment": "Scout the field closely, remove heavily affected leaves when practical, and follow integrated pest management for hispa control.",
    },
    "leaf_folder": {
        "name": "Leaf folder damage",
        "cause": "Leaf-folder larvae are folding and feeding inside the leaves, causing visible drying and reduced leaf area.",
        "treatment": "Monitor larval activity, preserve natural enemies, and use threshold-based pest control if infestations increase.",
    },
    "brown_plant_hopper": {
        "name": "Brown plant hopper damage",
        "cause": "Sap-sucking hoppers are stressing the crop and can trigger yellowing, wilting, and hopper-burn patches.",
        "treatment": "Avoid unnecessary insecticide sprays that kill beneficial insects, manage water carefully, and follow local hopper IPM thresholds.",
    },
    "gray_leaf_spot": {
        "name": "Gray leaf spot",
        "cause": "A fungal leaf-spot disease is favored by humid weather and infected crop residue.",
        "treatment": "Rotate crops, bury or remove infected residue, improve airflow, and use resistant varieties or approved fungicide if needed.",
    },
    "common_rust": {
        "name": "Common rust",
        "cause": "Rust spores are infecting leaf tissue, especially under cool to mild humid conditions.",
        "treatment": "Scout early, plant resistant varieties where possible, maintain good field hygiene, and apply approved fungicide if pressure becomes severe.",
    },
    "northern_leaf_blight": {
        "name": "Northern leaf blight",
        "cause": "A fungal infection is causing elongated lesions and can spread in humid fields with infected residue.",
        "treatment": "Rotate crops, remove residue, plant tolerant varieties, and follow local fungicide advice when disease pressure is high.",
    },
    "late_blight": {
        "name": "Late blight",
        "cause": "A fast-moving water mold infection is favored by cool, wet, and cloudy conditions.",
        "treatment": "Remove affected leaves, keep foliage dry, improve airflow, and apply protective fungicide early when disease risk is confirmed.",
    },
    "early_blight": {
        "name": "Early blight",
        "cause": "A fungal disease is creating dark concentric lesions, often when plants are stressed or older leaves stay wet.",
        "treatment": "Remove older infected leaves, mulch or stake plants to limit splash, and use approved fungicide if symptoms spread quickly.",
    },
    "bacterial_spot": {
        "name": "Bacterial spot",
        "cause": "A bacterial pathogen is causing spotting and tissue breakdown that spreads through water splash and handling.",
        "treatment": "Avoid working in wet plants, prune infected leaves, improve airflow, and follow copper-based or approved bactericide guidance locally.",
    },
    "leaf_mold": {
        "name": "Leaf mold",
        "cause": "Fungal growth is developing where humidity remains high and airflow is poor.",
        "treatment": "Lower humidity around the crop, prune crowded growth, avoid overhead watering, and use approved fungicide if spread continues.",
    },
    "septoria_leaf_spot": {
        "name": "Septoria leaf spot",
        "cause": "A fungal leaf-spot disease is spreading upward from lower foliage through splashing water.",
        "treatment": "Remove lower infected leaves, keep irrigation off the foliage, mulch the soil surface, and rotate away from susceptible crops.",
    },
    "target_spot": {
        "name": "Target spot",
        "cause": "A fungal disease is producing circular target-like lesions under warm, humid conditions.",
        "treatment": "Improve airflow, remove infected leaves, avoid excess nitrogen, and use approved fungicide if the outbreak expands.",
    },
    "yellow_leaf_curl_virus": {
        "name": "Yellow leaf curl virus",
        "cause": "A viral infection is being spread by insect vectors and is causing curling, yellowing, and stunting.",
        "treatment": "Remove severely infected plants, manage whiteflies early, use reflective mulch or netting when practical, and plant tolerant varieties.",
    },
    "mosaic_virus": {
        "name": "Mosaic virus",
        "cause": "A virus is causing mottling and distortion, often spread by sap contact, tools, or insect vectors.",
        "treatment": "Disinfect tools, remove severely affected plants, control insect vectors, and avoid handling plants when they are wet.",
    },
    "spider_mites": {
        "name": "Spider mite damage",
        "cause": "Spider mites are feeding on the leaf tissue and causing stippling, bronzing, and webbing under dry conditions.",
        "treatment": "Inspect the underside of leaves, raise humidity when appropriate, wash off light infestations, and use mite-targeted controls if needed.",
    },
    "black_sigatoka": {
        "name": "Black Sigatoka",
        "cause": "A fungal banana leaf disease is reducing healthy leaf area and can weaken fruit filling if unmanaged.",
        "treatment": "Remove heavily infected leaves, improve air movement, avoid overcrowding, and follow recommended fungicide rotation if confirmed locally.",
    },
    "yellow_sigatoka": {
        "name": "Yellow Sigatoka",
        "cause": "A fungal banana leaf disease is causing streaking and spots that reduce photosynthesis over time.",
        "treatment": "Prune infected leaves, keep plantations well ventilated, and follow local disease-management advice for Sigatoka control.",
    },
    "panama_disease": {
        "name": "Panama disease",
        "cause": "A soil-borne wilt pathogen is affecting the banana plant through the roots and vascular tissue.",
        "treatment": "Isolate affected mats, improve sanitation, avoid moving contaminated soil, and coordinate with agriculture officers on resistant varieties and containment.",
    },
    "moko_disease": {
        "name": "Moko disease",
        "cause": "A bacterial wilt disease is spreading through infected tools, insects, and planting material.",
        "treatment": "Disinfect tools strictly, rogue infected plants and mats, control insect movement where relevant, and avoid replanting susceptible material in the same spot.",
    },
    "bract_mosaic_virus": {
        "name": "Bract mosaic virus",
        "cause": "A viral banana disease is causing mottling and distortion in infected plant tissues.",
        "treatment": "Remove infected plants, use clean planting material, control aphids or other vectors, and maintain strict field sanitation.",
    },
    "insect_pest": {
        "name": "Insect pest damage",
        "cause": "Visible feeding, chewing, or sap-sucking damage indicates an active pest pressure on the crop.",
        "treatment": "Confirm the pest species in the field, preserve beneficial insects, and use threshold-based pest management before spraying.",
    },
    "anthracnose": {
        "name": "Anthracnose",
        "cause": "A fungal disease is creating dark, sunken, or spreading lesions on leaves or fruit tissues.",
        "treatment": "Prune infected tissues, avoid prolonged wetness, improve airflow, and use approved fungicide or protective spray when recommended.",
    },
    "phoma_blight": {
        "name": "Phoma blight",
        "cause": "A fungal blight is causing large brown to black necrotic patches and leaf dieback, commonly seen on infected mango foliage.",
        "treatment": "Prune and destroy infected leaves or twigs, improve canopy airflow, avoid overhead watering, and confirm local fungicide guidance before spraying.",
    },
    "fruit_rot": {
        "name": "Fruit rot symptoms",
        "cause": "Dark, sunken, or spreading lesions are affecting the fruit surface rather than only the leaves.",
        "treatment": "Remove affected fruit, reduce handling wounds, improve field and postharvest sanitation, and confirm the exact rot with local agriculture support.",
    },
    "crown_rot": {
        "name": "Crown or bunch rot symptoms",
        "cause": "Dark rot is concentrated near the fruit crown, cut ends, or bunch attachment area.",
        "treatment": "Separate affected hands, sanitize tools and containers, avoid harvest injuries, and follow local postharvest disease guidance.",
    },
    "bacterial_canker": {
        "name": "Bacterial canker",
        "cause": "A bacterial infection is entering through wounds or natural openings and damaging plant tissue.",
        "treatment": "Prune and destroy infected parts, disinfect tools, avoid overhead irrigation, and ask local crop specialists about approved bactericide options.",
    },
    "cutting_weevil": {
        "name": "Cutting weevil damage",
        "cause": "Weevil feeding is damaging plant tissues and reducing healthy leaf area or vigor.",
        "treatment": "Inspect regularly for adult insects and fresh feeding marks, remove heavily damaged tissue, and apply IPM controls suited to weevils.",
    },
    "die_back": {
        "name": "Die-back",
        "cause": "Progressive tissue death is moving back from the tips, often linked to fungal infection, stress, or secondary infections.",
        "treatment": "Prune back to healthy tissue, improve sanitation, reduce stress, and protect wounds using locally recommended management practices.",
    },
    "gall_midge": {
        "name": "Gall midge damage",
        "cause": "Gall midge infestation is distorting tender tissues and reducing normal growth.",
        "treatment": "Scout tender flushes, prune infested material if practical, and follow integrated pest management steps for gall midge.",
    },
    "powdery_mildew": {
        "name": "Powdery mildew",
        "cause": "A fungal disease is producing white powdery growth on leaf surfaces in humid or poorly ventilated conditions.",
        "treatment": "Improve airflow, prune crowded growth, avoid excessive nitrogen, and apply approved sulfur or fungicide products when needed.",
    },
    "sooty_mould": {
        "name": "Sooty mould",
        "cause": "Sooty fungal growth is developing on honeydew left by sap-sucking insects such as aphids, mealybugs, or scales.",
        "treatment": "Control the insect source first, wash off light mould where practical, and improve monitoring for recurring sap-sucking pests.",
    },
    "phytophthora": {
        "name": "Phytophthora disease",
        "cause": "A water mold infection is favored by wet soil, splash, and prolonged humidity.",
        "treatment": "Improve drainage, reduce standing water, remove infected tissues, and follow crop-specific oomycete management guidance locally.",
    },
    "red_rust": {
        "name": "Red rust",
        "cause": "A rust-type disease is infecting the leaf surface and reducing healthy photosynthetic area.",
        "treatment": "Prune infected foliage, improve canopy ventilation, and use approved fungicide guidance if symptoms continue to spread.",
    },
    "scab": {
        "name": "Scab",
        "cause": "Scab lesions are forming because of a pathogen favored by moisture and young susceptible tissues.",
        "treatment": "Remove infected tissues, protect new flushes, improve airflow, and use crop-specific fungicide guidance when needed.",
    },
    "styler_and_root": {
        "name": "Styler and root disorder",
        "cause": "The model detected symptoms matching a guava styler-and-root problem pattern in the dataset labels.",
        "treatment": "Inspect the roots and lower plant parts closely, improve drainage and sanitation, and confirm the diagnosis with a local agriculture specialist.",
    },
}

DISEASE_PROFILES.update(
    {
        "sheath_blight": {
            "name": "Sheath blight",
            "cause": "A fungal infection is spreading on lower leaves or sheaths, often favored by dense canopy humidity.",
            "treatment": "Improve spacing and airflow, avoid excess nitrogen, remove infected debris, and follow local fungicide guidance if disease pressure rises.",
        },
        "bacterial_blight": {
            "name": "Bacterial blight",
            "cause": "A bacterial disease is causing water-soaked, yellow, or brown damaged tissue.",
            "treatment": "Use clean planting material, avoid working wet plants, improve field sanitation, and follow local bactericide guidance if confirmed.",
        },
        "leaf_spot_or_blight": {
            "name": "Leaf spot or blight symptoms",
            "cause": "Leaf tissue shows spotting, blighting, or necrotic patches that can come from fungal, bacterial, or stress-related causes.",
            "treatment": "Remove badly affected leaves, improve airflow, reduce leaf wetness, and confirm the crop-specific cause locally before spraying.",
        },
        "leaf_blight": {
            "name": "Leaf blight",
            "cause": "A leaf-blighting infection is causing expanding brown or yellow damaged tissue.",
            "treatment": "Remove heavily affected leaves, improve airflow, avoid wet foliage, and confirm locally before applying crop-specific treatment.",
        },
        "bud_rot": {
            "name": "Bud rot",
            "cause": "Rot is affecting the growing point, commonly favored by wet conditions and infected plant debris.",
            "treatment": "Remove badly affected tissue, improve drainage and sanitation, and seek local advice quickly because bud rot can kill the plant.",
        },
        "root_wilt": {
            "name": "Root wilt",
            "cause": "Root or vascular stress is reducing plant vigor and causing wilt-like symptoms.",
            "treatment": "Improve drainage, remove severely affected plants, avoid moving contaminated soil, and confirm the cause with local agriculture support.",
        },
        "rhinoceros_beetle_damage": {
            "name": "Rhinoceros beetle damage",
            "cause": "Beetle feeding is damaging young tissue and can leave cut, bored, or notched plant parts.",
            "treatment": "Remove breeding sites, inspect crowns or leaf bases, use traps where recommended, and follow local integrated pest management.",
        },
        "scale_insect_damage": {
            "name": "Scale insect damage",
            "cause": "Scale insects are feeding on sap and weakening leaves, stems, or fruit.",
            "treatment": "Prune heavy infestations, conserve natural enemies, wash light infestations, and use locally approved controls only when thresholds are met.",
        },
        "lethal_yellowing": {
            "name": "Lethal yellowing",
            "cause": "A phytoplasma-like disease pattern is causing progressive yellowing and decline.",
            "treatment": "Report suspected cases locally, remove severely affected palms, control vectors where advised, and use resistant planting material.",
        },
        "red_rot": {
            "name": "Red rot",
            "cause": "A fungal rot is damaging internal stalk or stem tissue and reducing plant strength.",
            "treatment": "Remove infected stalks, use clean planting material, rotate crops, and avoid replanting from diseased setts.",
        },
        "smut": {
            "name": "Smut",
            "cause": "A fungal smut disease is infecting growing tissue and can spread through planting material or spores.",
            "treatment": "Remove infected plants, use disease-free planting material, and plant resistant varieties when available.",
        },
        "rust": {
            "name": "Rust",
            "cause": "Rust spores are infecting leaves and creating orange to brown pustules or streaks.",
            "treatment": "Use resistant varieties, remove badly infected leaves when practical, and apply approved fungicide only when local guidance recommends it.",
        },
        "mosaic_virus": {
            "name": "Mosaic virus",
            "cause": "A virus is causing mottled, distorted, or yellow-green patterned leaves.",
            "treatment": "Remove severely affected plants, control insect vectors, disinfect tools, and use clean planting material.",
        },
        "leaf_scald": {
            "name": "Leaf scald",
            "cause": "A bacterial disease is causing leaf streaking, scalding, and decline.",
            "treatment": "Use clean planting material, rogue infected stools, sanitize tools, and avoid moving infected stalks to new fields.",
        },
        "borer_damage": {
            "name": "Borer damage",
            "cause": "Boring insects are tunneling into stems, shoots, or fruit and weakening the crop.",
            "treatment": "Remove infested parts, monitor for entry holes or frass, conserve natural enemies, and follow local borer IPM thresholds.",
        },
        "mosaic_disease": {
            "name": "Mosaic disease",
            "cause": "A viral disease is causing mottling, distortion, and reduced plant vigor.",
            "treatment": "Use clean planting material, remove infected plants early, and control insect vectors where recommended.",
        },
        "brown_streak_disease": {
            "name": "Brown streak disease",
            "cause": "A viral disease is causing streaking, chlorosis, or root quality loss.",
            "treatment": "Use certified clean planting material, remove symptomatic plants, and manage whitefly vectors with local guidance.",
        },
        "mealybug_damage": {
            "name": "Mealybug damage",
            "cause": "Mealybugs are feeding on sap and may spread disease while weakening plant growth.",
            "treatment": "Inspect undersides and growing points, prune heavy infestations, conserve natural enemies, and follow local IPM controls.",
        },
        "feathery_mottle_virus": {
            "name": "Feathery mottle virus",
            "cause": "A viral disease is producing mottled or feathery leaf patterns and reducing vigor.",
            "treatment": "Use clean vines or cuttings, remove infected plants, and manage aphid vectors where needed.",
        },
        "weevil_damage": {
            "name": "Weevil damage",
            "cause": "Weevil feeding or tunneling is damaging vines, stems, roots, or fruit.",
            "treatment": "Remove infested material, use clean planting stock, rotate fields, and follow crop-specific weevil IPM.",
        },
        "stem_rot": {
            "name": "Stem rot",
            "cause": "A rot organism is damaging stems, especially where moisture, wounds, or poor drainage are present.",
            "treatment": "Remove infected stems, improve drainage and airflow, avoid wounds, and use clean planting material.",
        },
        "bacterial_wilt": {
            "name": "Bacterial wilt",
            "cause": "A bacterial pathogen is blocking water movement and causing wilting or collapse.",
            "treatment": "Remove infected plants, sanitize tools, improve rotation, and avoid moving contaminated soil or water.",
        },
        "phomopsis_blight": {
            "name": "Phomopsis blight",
            "cause": "A fungal blight is causing spots, dieback, or fruit lesions under humid conditions.",
            "treatment": "Prune infected parts, improve airflow, avoid overhead watering, and follow local fungicide guidance if confirmed.",
        },
        "cercospora_leaf_spot": {
            "name": "Cercospora leaf spot",
            "cause": "A fungal leaf spot is forming under warm, humid conditions.",
            "treatment": "Remove infected leaves, improve spacing, reduce leaf wetness, and use resistant varieties or fungicide when advised.",
        },
        "flea_beetle_damage": {
            "name": "Flea beetle damage",
            "cause": "Small beetles are chewing holes and pits into leaf tissue.",
            "treatment": "Scout young plants, remove weeds that host pests, use row covers where practical, and follow local IPM thresholds.",
        },
        "fruit_and_shoot_borer_damage": {
            "name": "Fruit and shoot borer damage",
            "cause": "Borer larvae are tunneling into shoots or fruit and causing wilting, holes, or rot.",
            "treatment": "Remove infested shoots and fruit, use pheromone traps where available, and follow local borer management guidance.",
        },
        "yellow_mosaic_virus": {
            "name": "Yellow mosaic virus",
            "cause": "A virus is causing yellow mosaic patterns and reduced vigor, usually spread by insect vectors.",
            "treatment": "Remove infected plants, manage whiteflies or vectors early, and use resistant varieties when available.",
        },
        "heart_rot": {
            "name": "Heart rot",
            "cause": "Rot is developing in the central growing tissues, often after prolonged wet conditions.",
            "treatment": "Improve drainage, remove infected plants or tissue, avoid water collecting in crowns, and confirm locally before treatment.",
        },
        "mealybug_wilt": {
            "name": "Mealybug wilt",
            "cause": "Mealybug feeding and associated pathogens are causing wilting or reddening symptoms.",
            "treatment": "Control mealybug vectors, remove heavily affected plants, manage ants, and use clean planting material.",
        },
        "root_rot": {
            "name": "Root rot",
            "cause": "Root disease is reducing water uptake, commonly favored by poor drainage or infected soil.",
            "treatment": "Improve drainage, avoid overwatering, remove badly affected plants, and use clean planting material or rotation.",
        },
        "citrus_canker": {
            "name": "Citrus canker",
            "cause": "A bacterial disease is producing corky lesions on leaves, stems, or fruit.",
            "treatment": "Prune infected parts, disinfect tools, avoid working wet plants, and follow local citrus disease protocols.",
        },
        "citrus_greening": {
            "name": "Citrus greening",
            "cause": "A systemic disease spread by psyllids is causing mottling, yellowing, and decline.",
            "treatment": "Report suspected cases, control psyllid vectors, remove severely infected trees, and use disease-free planting material.",
        },
        "melanose": {
            "name": "Melanose",
            "cause": "A fungal disease is causing small dark rough spots on leaves, twigs, or fruit.",
            "treatment": "Prune dead twigs, improve airflow, reduce prolonged wetness, and use protective spray only when locally advised.",
        },
        "leaf_miner_damage": {
            "name": "Leaf miner damage",
            "cause": "Leaf miner larvae are tunneling inside leaves and leaving winding trails or distorted new growth.",
            "treatment": "Protect new flushes, conserve natural enemies, prune heavy damage, and use local citrus leaf miner IPM.",
        },
        "purple_blotch": {
            "name": "Purple blotch",
            "cause": "A fungal disease is causing purple-brown leaf lesions, especially in humid weather.",
            "treatment": "Improve airflow, avoid overhead watering, remove infected debris, and follow local fungicide timing if needed.",
        },
        "downy_mildew": {
            "name": "Downy mildew",
            "cause": "A moisture-loving pathogen is causing yellowing, fuzzy growth, or angular leaf spots.",
            "treatment": "Improve ventilation, avoid wet foliage, remove infected leaves, and use protective treatment when local risk is high.",
        },
        "basal_rot": {
            "name": "Basal rot",
            "cause": "Rot is developing near the base or root plate and can spread through soil or infected planting material.",
            "treatment": "Use clean planting material, improve drainage, remove infected plants, and rotate away from susceptible crops.",
        },
        "twister_disease": {
            "name": "Twister disease",
            "cause": "A disease complex is causing twisted, distorted leaves and poor growth.",
            "treatment": "Remove severely affected plants, improve field drainage and airflow, and confirm the cause locally before treatment.",
        },
        "thrips_damage": {
            "name": "Thrips damage",
            "cause": "Thrips are scraping plant tissue and causing silvering, scarring, or distorted growth.",
            "treatment": "Scout regularly, remove weeds, conserve natural enemies, and use threshold-based thrips control.",
        },
        "black_rot": {
            "name": "Black rot",
            "cause": "A bacterial disease is causing dark veins, V-shaped lesions, or tissue collapse.",
            "treatment": "Use clean seed or transplants, remove infected debris, avoid overhead irrigation, and rotate with non-host crops.",
        },
        "clubroot": {
            "name": "Clubroot",
            "cause": "A soil-borne disease is deforming roots and reducing water uptake.",
            "treatment": "Improve soil pH and drainage, remove infected roots, avoid moving contaminated soil, and rotate away from brassicas.",
        },
        "alternaria_leaf_spot": {
            "name": "Alternaria leaf spot",
            "cause": "A fungal disease is producing circular or target-like leaf spots.",
            "treatment": "Remove infected leaves, improve airflow, avoid leaf wetness, and use approved fungicide if symptoms spread.",
        },
        "diamondback_moth_damage": {
            "name": "Diamondback moth damage",
            "cause": "Larvae are feeding on leaves and creating holes or windowpane damage.",
            "treatment": "Scout leaf undersides, preserve beneficial insects, use netting when practical, and rotate approved controls to avoid resistance.",
        },
        "fruit_fly_damage": {
            "name": "Fruit fly damage",
            "cause": "Fruit flies are laying eggs in fruit, leading to punctures, larvae, and decay.",
            "treatment": "Remove infested fruit, use traps and field sanitation, bag fruit where practical, and follow local fruit fly control programs.",
        },
        "black_scurf": {
            "name": "Black scurf",
            "cause": "A soil-borne fungus is producing dark scurf or stem canker symptoms.",
            "treatment": "Use clean seed pieces, rotate crops, improve drainage, and avoid planting in contaminated soil when possible.",
        },
        "black_pod_rot": {
            "name": "Black pod rot",
            "cause": "A water mold infection is rotting pods under wet, humid conditions.",
            "treatment": "Remove infected pods, prune for airflow, improve sanitation, and follow local protective spray guidance.",
        },
        "frosty_pod_rot": {
            "name": "Frosty pod rot",
            "cause": "A fungal pod disease is causing abnormal pod growth, rot, or pale fungal covering.",
            "treatment": "Remove infected pods early, sanitize tools, prune for airflow, and report severe cases to local agriculture support.",
        },
        "vascular_streak_dieback": {
            "name": "Vascular streak dieback",
            "cause": "A fungal disease is affecting vascular tissue and causing leaf yellowing, dieback, and decline.",
            "treatment": "Prune infected branches, improve shade and airflow balance, and use tolerant planting material where available.",
        },
        "pod_borer_damage": {
            "name": "Pod borer damage",
            "cause": "Borer larvae are damaging pods and reducing yield quality.",
            "treatment": "Harvest regularly, remove infested pods, use sanitation and bagging where practical, and follow local borer IPM.",
        },
        "cherelle_wilt": {
            "name": "Cherelle wilt",
            "cause": "Young pods are wilting or drying due to stress, poor pollination, or disease pressure.",
            "treatment": "Improve tree nutrition and moisture balance, prune for airflow, and remove diseased or dead young pods.",
        },
        "leaf_rust": {
            "name": "Leaf rust",
            "cause": "Rust spores are infecting leaf tissue and reducing healthy leaf area.",
            "treatment": "Prune for airflow, remove badly infected leaves, use resistant varieties where possible, and follow local fungicide guidance.",
        },
        "berry_disease": {
            "name": "Berry disease",
            "cause": "A fungal disease is affecting berries or fruit tissue and can spread in wet conditions.",
            "treatment": "Remove infected berries, improve airflow, avoid prolonged wetness, and use protective treatments when recommended locally.",
        },
        "brown_eye_spot": {
            "name": "Brown eye spot",
            "cause": "A fungal leaf spot is causing brown lesions with pale centers and can increase under stress.",
            "treatment": "Improve nutrition and airflow, remove infected debris, avoid overhead watering, and use approved fungicide only when needed.",
        },
        "berry_borer_damage": {
            "name": "Berry borer damage",
            "cause": "Borer insects are entering berries or fruit and causing holes, frass, and quality loss.",
            "treatment": "Harvest ripe fruit promptly, remove infested berries, use traps where available, and follow local borer IPM.",
        },
        "bunchy_top_virus": {
            "name": "Bunchy top virus",
            "cause": "A viral disease is causing bunched, narrow, or stunted new growth.",
            "treatment": "Remove infected plants, control aphid or insect vectors, and use clean planting material.",
        },
        "fusarium_wilt": {
            "name": "Fusarium wilt",
            "cause": "A soil-borne fungus is blocking water movement and causing wilt or yellowing.",
            "treatment": "Remove infected plants, improve sanitation, avoid moving contaminated soil, and use resistant or clean planting material.",
        },
    }
)

NON_CROP_IMAGE_KEYWORDS = (
    "dog",
    "cat",
    "pug",
    "terrier",
    "spaniel",
    "retriever",
    "shepherd",
    "shih",
    "lhasa",
    "chihuahua",
    "poodle",
    "malamute",
    "corgi",
    "collie",
    "greyhound",
    "mastiff",
    "rottweiler",
    "schnauzer",
    "dachshund",
    "boxer",
    "hound",
    "husky",
    "wolf",
    "fox",
    "bear",
    "lion",
    "tiger",
    "leopard",
    "jaguar",
    "monkey",
    "ape",
    "gorilla",
    "orangutan",
    "baboon",
    "lemur",
    "horse",
    "zebra",
    "cow",
    "ox",
    "buffalo",
    "goat",
    "sheep",
    "ram",
    "deer",
    "gazelle",
    "pig",
    "boar",
    "rabbit",
    "hare",
    "hamster",
    "guinea_pig",
    "bird",
    "eagle",
    "owl",
    "hen",
    "cock",
    "duck",
    "goose",
    "parrot",
    "penguin",
    "fish",
    "shark",
    "ray",
    "whale",
    "dolphin",
    "seal",
    "otter",
    "snake",
    "lizard",
    "turtle",
    "frog",
    "toad",
    "spider",
    "butterfly",
    "beetle",
    "bee",
    "human",
    "person",
    "face",
    "baby",
    "stage",
    "spotlight",
    "studio",
    "theater",
    "theatre",
    "microphone",
    "racket",
    "ballplayer",
    "lab_coat",
    "keyboard",
    "laptop",
    "computer",
    "screen",
    "monitor",
    "phone",
    "chair",
    "table",
    "mug",
    "bottle",
    "car",
    "truck",
    "bus",
    "bicycle",
    "motorcycle",
)

NON_CROP_FILENAME_TERMS = (
    "dog",
    "dogs",
    "cat",
    "cats",
    "puppy",
    "puppies",
    "kitten",
    "wolf",
    "wolves",
    "horse",
    "cow",
    "goat",
    "sheep",
    "pig",
    "bird",
    "person",
    "people",
    "human",
    "face",
    "car",
    "truck",
    "bus",
    "motorcycle",
    "bicycle",
    "phone",
    "laptop",
    "computer",
    "keyboard",
)

ONLINE_DISEASE_REFERENCES: dict[str, dict[str, str]] = {
    "healthy": {
        "title": "UMN Extension - Plant disease diagnosis",
        "url": "https://extension.umn.edu/plant-diseases/diagnosing-plant-diseases",
        "query": "extension healthy plant leaf disease diagnosis signs",
    },
    "pest_leaf_damage": {
        "title": "UC IPM - Agriculture pests",
        "url": "https://ipm.ucanr.edu/pmg/",
        "query": "extension crop leaf chewing holes insect damage integrated pest management",
    },
    "leaf_spot_or_blight": {
        "title": "UMN Extension - Vegetable crop disease management",
        "url": "https://extension.umn.edu/vegetables/disease-management",
        "query": "extension crop leaf spot blight symptoms management",
    },
    "tomato_early_blight": {
        "title": "UMN Extension - Early blight in tomato",
        "url": "https://extension.umn.edu/diseases/early-blight-tomato",
        "query": "extension tomato early blight symptoms management concentric rings",
    },
    "tomato_septoria_leaf_spot": {
        "title": "UMN Extension - Tomato leaf spot diseases",
        "url": "https://extension.umn.edu/vegetables/disease-management",
        "query": "extension tomato septoria leaf spot symptoms management",
    },
    "banana_fruit_rot": {
        "title": "Pacific Pests, Pathogens & Weeds - Banana tip rot and anthracnose",
        "url": "https://apps.lucidcentral.org/pppw_v11/pdf/web_full/banana_tip_rot_125.pdf",
        "query": "banana anthracnose fruit rot symptoms management extension",
    },
    "banana_crown_rot": {
        "title": "APS Plant Disease - Crown rot of bananas",
        "url": "https://www.apsnet.org/publications/plantdisease/2010/June/Pages/94_6_648.aspx",
        "query": "banana crown rot bunch rot symptoms management",
    },
    "rice_bacterial_leaf_blight": {
        "title": "IRRI Rice Doctor - Bacterial blight",
        "url": "https://www.knowledgebank.irri.org/decision-tools/rice-doctor/rice-doctor-fact-sheets/item/bacterial-blight",
        "query": "IRRI rice bacterial leaf blight symptoms management",
    },
    "rice_blast": {
        "title": "IRRI Rice Knowledge Bank - Rice diseases",
        "url": "https://www.knowledgebank.irri.org/step-by-step-production/growth/pests-and-diseases/diseases",
        "query": "IRRI rice blast leaf symptoms management",
    },
    "rice_brown_spot": {
        "title": "IRRI Rice Knowledge Bank - Rice diseases",
        "url": "https://www.knowledgebank.irri.org/step-by-step-production/growth/pests-and-diseases/diseases",
        "query": "IRRI rice brown spot symptoms management",
    },
    "rice_tungro_virus": {
        "title": "IRRI Rice Knowledge Bank - Tungro",
        "url": "https://www.knowledgebank.irri.org/training/fact-sheets/pest-management/diseases/item/tungro",
        "query": "IRRI rice tungro symptoms management",
    },
    "corn_gray_leaf_spot": {
        "title": "UMN Extension - Gray leaf spot on corn",
        "url": "https://extension.umn.edu/corn-pest-management/gray-leaf-spot-corn",
        "query": "extension gray leaf spot corn symptoms management",
    },
    "corn_northern_leaf_blight": {
        "title": "UMN Extension - Northern corn leaf blight",
        "url": "https://extension.umn.edu/corn-pest-management/northern-corn-leaf-blight",
        "query": "extension northern corn leaf blight symptoms management",
    },
    "corn_common_rust": {
        "title": "UMN Extension - Common rust on corn",
        "url": "https://extension.umn.edu/corn-pest-management/common-rust-corn",
        "query": "extension common rust corn symptoms management",
    },
    "tomato_late_blight": {
        "title": "USU Extension - Late blight",
        "url": "https://extension.usu.edu/vegetableguide/tomato-pepper-eggplant/late-blight",
        "query": "extension tomato late blight symptoms management",
    },
    "potato_late_blight": {
        "title": "USU Extension - Late blight",
        "url": "https://extension.usu.edu/vegetableguide/tomato-pepper-eggplant/late-blight",
        "query": "extension potato late blight symptoms management",
    },
}


class CropDiseaseDetector:
    def __init__(self) -> None:
        self._model = None
        self._model_type = "tensorflow"
        self._labels = list(DEFAULT_LABELS)
        self._general_validator_model = None
        self._general_validator_loaded = False
        self._loaded_model_path: Path | None = None
        self._loaded_model_mtime: float | None = None
        self._missing_ultralytics_logged = False
        self._visual_memory_examples: list[dict[str, Any]] = []
        self._visual_memory_path: Path | None = None
        self._visual_memory_mtime: float | None = None

    def _resolve_backend_path(self, configured_path: str | Path) -> Path:
        path = Path(configured_path)
        if path.is_absolute():
            return path
        if path.parts and path.parts[0] in {"app", "uploads", "static", "data"}:
            return (BACKEND_DIR / path).resolve()
        return (Path.cwd() / path).resolve()

    def _load_model(self) -> None:
        model_path = self._resolve_model_path(Path(settings.model_path))
        current_mtime = model_path.stat().st_mtime if model_path.exists() else None
        if self._model is not None and self._loaded_model_path is not None:
            same_path = self._loaded_model_path.resolve() == model_path.resolve()
            same_mtime = self._loaded_model_mtime == current_mtime
            if same_path and same_mtime:
                return
            logger.info("Reloading disease model from %s", model_path)
            self._model = None
            self._model_type = "tensorflow"
            self._labels = list(DEFAULT_LABELS)

        if not model_path.exists():
            logger.warning("ML model not found at %s. Using deterministic image heuristic fallback.", model_path)
            self._loaded_model_path = None
            self._loaded_model_mtime = None
            return

        self._loaded_model_path = model_path
        self._loaded_model_mtime = current_mtime
        self._labels = self._load_labels(model_path)
        if model_path.suffix == ".pt":
            self._load_ultralytics_model(model_path)
            return
        try:
            import tensorflow as tf

            self._model_type = "tensorflow"
            self._model = tf.keras.models.load_model(model_path)
        except Exception:
            logger.exception("Could not load TensorFlow model. Using fallback detector.")
            self._model = None
            self._loaded_model_path = None
            self._loaded_model_mtime = None

    def _resolve_model_path(self, configured_path: Path) -> Path:
        latest_trained = self._find_latest_trained_model()
        if configured_path.exists():
            if latest_trained is not None and latest_trained.resolve() != configured_path.resolve():
                try:
                    if latest_trained.stat().st_mtime > configured_path.stat().st_mtime:
                        logger.info(
                            "Using newer trained disease model at %s instead of configured model %s",
                            latest_trained,
                            configured_path,
                        )
                        return latest_trained
                except OSError:
                    logger.exception("Could not compare configured model and latest trained model timestamps.")
            return configured_path
        if not configured_path.suffix:
            keras_path = configured_path.with_suffix(".keras")
            if keras_path.exists():
                return keras_path
            pt_path = configured_path.with_suffix(".pt")
            if pt_path.exists():
                return pt_path
        if latest_trained is not None:
            logger.info("Using latest trained disease model at %s", latest_trained)
            return latest_trained
        return configured_path

    def _find_latest_trained_model(self) -> Path | None:
        candidates: list[Path] = []
        search_roots = [
            Path("app/ml/artifacts"),
            Path("app/ml/runs"),
            Path("app/ml"),
        ]

        for root in search_roots:
            if not root.exists():
                continue
            candidates.extend(root.rglob("best.pt"))
            candidates.extend(root.rglob("*.keras"))

        if not candidates:
            return None

        return max(candidates, key=lambda path: path.stat().st_mtime)

    def _load_labels(self, model_path: Path) -> list[str]:
        labels_path = Path(settings.model_labels_path)
        if not labels_path.exists():
            labels_path = model_path.with_name("labels.json")
        if not labels_path.exists():
            return list(DEFAULT_LABELS)
        try:
            labels = json.loads(labels_path.read_text(encoding="utf-8"))
            if isinstance(labels, list) and all(isinstance(item, str) for item in labels):
                return labels
        except Exception:
            logger.exception("Could not read model labels from %s.", labels_path)
        return list(DEFAULT_LABELS)

    def _load_ultralytics_model(self, model_path: Path) -> None:
        try:
            from ultralytics import YOLO

            self._model_type = "ultralytics"
            self._model = YOLO(str(model_path))
        except ModuleNotFoundError:
            if not self._missing_ultralytics_logged:
                logger.warning("Ultralytics is not installed. Using fallback disease detector.")
                self._missing_ultralytics_logged = True
            self._model = None
            self._loaded_model_path = None
            self._loaded_model_mtime = None
        except Exception:
            logger.exception("Could not load Ultralytics YOLO model. Using fallback detector.")
            self._model = None
            self._loaded_model_path = None
            self._loaded_model_mtime = None

    def _load_visual_memory_examples(self) -> list[dict[str, Any]]:
        memory_path = self._resolve_backend_path(settings.visual_memory_path)
        current_mtime = memory_path.stat().st_mtime if memory_path.exists() else None
        if self._visual_memory_path == memory_path and self._visual_memory_mtime == current_mtime:
            return self._visual_memory_examples

        self._visual_memory_path = memory_path
        self._visual_memory_mtime = current_mtime
        self._visual_memory_examples = []
        if not memory_path.exists():
            return self._visual_memory_examples

        try:
            data = json.loads(memory_path.read_text(encoding="utf-8"))
        except Exception:
            logger.exception("Could not load visual memory examples from %s.", memory_path)
            return self._visual_memory_examples

        examples = data.get("examples") if isinstance(data, dict) else data
        if not isinstance(examples, list):
            return self._visual_memory_examples

        for example in examples:
            if not isinstance(example, dict) or not isinstance(example.get("feature_signature"), dict):
                continue
            class_key = str(example.get("class_key") or "").strip()
            if not class_key:
                continue
            self._visual_memory_examples.append(example)
        return self._visual_memory_examples

    def _plant_subject_mask(self, normalized_array: np.ndarray) -> np.ndarray:
        red = normalized_array[:, :, 0]
        green = normalized_array[:, :, 1]
        blue = normalized_array[:, :, 2]
        max_channel = np.max(normalized_array, axis=2)
        min_channel = np.min(normalized_array, axis=2)
        saturation = max_channel - min_channel

        green_leaf = (green > red * 1.05) & (green > blue * 1.05) & (green > 0.15) & (saturation > 0.08)
        brown_or_dark = (
            (red > 0.20)
            & (green > 0.08)
            & (blue < 0.42)
            & (red >= green * 0.82)
            & (green > blue * 1.02)
            & (saturation > 0.07)
            & (max_channel < 0.86)
        )
        yellow_or_kernel = (
            (red > 0.36)
            & (green > 0.30)
            & (blue < 0.58)
            & (red > blue * 1.08)
            & (green > blue * 1.05)
            & (red < green * 1.65)
            & (green < red * 1.65)
            & (saturation > 0.045)
        )
        tan_stem_or_husk = (
            (red > 0.34)
            & (green > 0.22)
            & (blue > 0.10)
            & (red > green * 0.92)
            & (green > blue * 1.02)
            & (saturation > 0.07)
            & (max_channel < 0.92)
        )
        red_purple_bulb = (
            (red > 0.24)
            & (blue > 0.10)
            & (red > green * 1.06)
            & (red >= blue * 0.90)
            & (saturation > 0.08)
            & (max_channel > 0.28)
            & (max_channel < 0.98)
        )
        return green_leaf | brown_or_dark | yellow_or_kernel | tan_stem_or_husk | red_purple_bulb

    def _subject_focus_image(self, image_path: str, size: int) -> Image.Image:
        image = Image.open(image_path).convert("RGB")
        working = image.resize((size, size))
        array = np.asarray(working, dtype=np.uint8)
        normalized = array.astype(np.float32) / 255.0
        subject_mask = self._plant_subject_mask(normalized)
        if float(np.mean(subject_mask)) < 0.025:
            return working

        selected_mask = subject_mask.copy()
        try:
            import cv2

            mask = subject_mask.astype("uint8")
            kernel = np.ones((3, 3), dtype=np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
            count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
            selected_mask = np.zeros_like(mask, dtype=bool)
            height, width = mask.shape
            center_left = width * 0.18
            center_right = width * 0.82
            center_top = height * 0.18
            center_bottom = height * 0.82
            largest_area = 0
            largest_index = 0
            for index in range(1, count):
                area = int(stats[index, cv2.CC_STAT_AREA])
                if area > largest_area:
                    largest_area = area
                    largest_index = index
                if area < max(18, int(mask.size * 0.002)):
                    continue
                x = int(stats[index, cv2.CC_STAT_LEFT])
                y = int(stats[index, cv2.CC_STAT_TOP])
                component_width = int(stats[index, cv2.CC_STAT_WIDTH])
                component_height = int(stats[index, cv2.CC_STAT_HEIGHT])
                overlaps_center = (
                    x < center_right
                    and x + component_width > center_left
                    and y < center_bottom
                    and y + component_height > center_top
                )
                large_component = area >= mask.size * 0.015
                if overlaps_center or large_component:
                    selected_mask |= labels == index
            if not np.any(selected_mask) and largest_index:
                selected_mask = labels == largest_index
            selected_mask = cv2.dilate(selected_mask.astype("uint8"), kernel, iterations=2).astype(bool)
        except Exception:
            logger.debug("OpenCV subject focus unavailable; using raw color mask.", exc_info=True)

        if not np.any(selected_mask):
            return working

        y_positions, x_positions = np.where(selected_mask)
        top = int(y_positions.min())
        bottom = int(y_positions.max()) + 1
        left = int(x_positions.min())
        right = int(x_positions.max()) + 1
        padding = max(4, int(max(bottom - top, right - left) * 0.14))
        top = max(0, top - padding)
        bottom = min(size, bottom + padding)
        left = max(0, left - padding)
        right = min(size, right + padding)
        if bottom - top < size * 0.18 or right - left < size * 0.18:
            return working

        focused_array = array.copy()
        focused_array[~selected_mask] = np.array([244, 245, 240], dtype=np.uint8)
        focused = Image.fromarray(focused_array, mode="RGB").crop((left, top, right, bottom)).resize((size, size))
        return focused

    def _preprocess(self, image_path: str) -> np.ndarray:
        image = self._subject_focus_image(image_path, 224)
        array = np.asarray(image, dtype=np.float32)
        return np.expand_dims(array, axis=0)

    def _load_general_validator(self) -> None:
        if self._general_validator_loaded:
            return

        self._general_validator_loaded = True
        try:
            import tensorflow as tf

            self._general_validator_model = tf.keras.applications.MobileNetV2(weights="imagenet")
        except ModuleNotFoundError:
            logger.warning("TensorFlow is not installed. Falling back to crop-image heuristics only.")
            self._general_validator_model = None
        except Exception:
            logger.exception("Could not load general image validator. Falling back to crop-image heuristics only.")
            self._general_validator_model = None

    def _is_obvious_non_crop_image(self, image_path: str) -> bool:
        self._load_general_validator()
        if self._general_validator_model is None:
            return self._fails_basic_crop_signal(image_path)

        try:
            import tensorflow as tf

            image = Image.open(image_path).convert("RGB").resize((224, 224))
            array = np.asarray(image, dtype=np.float32)
            batch = np.expand_dims(array, axis=0)
            preprocessed = tf.keras.applications.mobilenet_v2.preprocess_input(batch.copy())
            predictions = self._general_validator_model.predict(preprocessed, verbose=0)
            decoded = tf.keras.applications.mobilenet_v2.decode_predictions(predictions, top=5)[0]

            top_label = str(decoded[0][1]).lower().replace("_", " ")
            top_score = float(decoded[0][2])
            if top_score >= 0.55 and any(keyword in top_label for keyword in NON_CROP_IMAGE_KEYWORDS):
                logger.info("Rejected obvious non-crop image: %s (%.2f)", top_label, top_score)
                return True
            for _, label, score in decoded:
                label_text = str(label).lower().replace("_", " ")
                score_value = float(score)
                if score_value >= 0.12 and any(keyword in label_text for keyword in NON_CROP_IMAGE_KEYWORDS):
                    logger.info("Rejected likely non-crop image: %s (%.2f)", label_text, score_value)
                    return True
        except Exception:
            logger.exception("General image validator failed; using basic crop-signal heuristic.")

        return self._fails_basic_crop_signal(image_path)

    def _fails_basic_crop_signal(self, image_path: str) -> bool:
        image = Image.open(image_path).convert("RGB").resize((160, 160))
        array = np.asarray(image, dtype=np.float32) / 255.0
        red = array[:, :, 0]
        green = array[:, :, 1]
        blue = array[:, :, 2]
        max_channel = np.max(array, axis=2)
        min_channel = np.min(array, axis=2)
        saturation = max_channel - min_channel

        green_leaf_pixels = (green > red * 1.05) & (green > blue * 1.05) & (green > 0.15) & (saturation > 0.08)
        chroma_green_pixels = (
            green_leaf_pixels
            & (green > 0.42)
            & (red < 0.25)
            & (blue < 0.32)
            & (saturation > 0.36)
        )
        natural_green_pixels = green_leaf_pixels & ~chroma_green_pixels
        disease_tone_pixels = (
            (red > 0.32)
            & (green > 0.18)
            & (blue < red * 0.9)
            & (saturation > 0.12)
            & ((green > blue * 1.08) | (green > 0.35))
        )
        red_purple_bulb_pixels = (
            (red > 0.24)
            & (blue > 0.10)
            & (red > green * 1.06)
            & (red >= blue * 0.90)
            & (saturation > 0.08)
            & (max_channel > 0.28)
            & (max_channel < 0.98)
        )
        plant_pixels = green_leaf_pixels | disease_tone_pixels | red_purple_bulb_pixels

        green_dominant_ratio = float(np.mean(green_leaf_pixels))
        chroma_green_ratio = float(np.mean(chroma_green_pixels))
        natural_green_ratio = float(np.mean(natural_green_pixels))
        warm_plant_ratio = float(np.mean(disease_tone_pixels))
        red_purple_bulb_ratio = float(np.mean(red_purple_bulb_pixels))
        overall_signal = max(green_dominant_ratio, warm_plant_ratio, red_purple_bulb_ratio)
        nonwhite_mask = (red < 0.95) | (green < 0.95) | (blue < 0.95)
        nonwhite_ratio = float(np.mean(nonwhite_mask))
        plant_within_nonwhite = float(np.mean(plant_pixels[nonwhite_mask])) if np.any(nonwhite_mask) else 0.0

        height, width = green.shape
        center_mask = np.zeros(green.shape, dtype=bool)
        center_mask[height // 4 : 3 * height // 4, width // 4 : 3 * width // 4] = True
        center_green_ratio = float(np.mean(green_leaf_pixels[center_mask]))
        center_chroma_green_ratio = float(np.mean(chroma_green_pixels[center_mask]))
        center_natural_green_ratio = float(np.mean(natural_green_pixels[center_mask]))
        center_plant_ratio = float(np.mean(plant_pixels[center_mask]))
        center_red_purple_bulb_ratio = float(np.mean(red_purple_bulb_pixels[center_mask]))

        neutral_subject_pixels = (saturation < 0.18) & (max_channel > 0.25) & (max_channel < 0.95)
        tan_subject_pixels = (
            (red > 0.42)
            & (green > 0.25)
            & (blue > 0.12)
            & (red > green * 1.08)
            & (green > blue * 1.05)
            & (saturation > 0.10)
        )
        neutral_subject_ratio = float(np.mean(neutral_subject_pixels))
        center_neutral_subject_ratio = float(np.mean(neutral_subject_pixels[center_mask]))
        center_tan_subject_ratio = float(np.mean(tan_subject_pixels[center_mask]))
        red_purple_crop_subject = (
            red_purple_bulb_ratio >= 0.08
            and center_red_purple_bulb_ratio >= 0.10
            and green_dominant_ratio < 0.12
        )

        centered_non_leaf_subject = (
            center_green_ratio < 0.08
            and green_dominant_ratio < 0.38
            and center_plant_ratio < 0.65
            and (center_tan_subject_ratio > 0.20 or neutral_subject_ratio > 0.34)
            and not red_purple_crop_subject
        )
        animal_on_green_background = (
            green_dominant_ratio >= 0.12
            and center_green_ratio < 0.04
            and center_tan_subject_ratio >= 0.28
            and center_neutral_subject_ratio >= 0.16
            and center_natural_green_ratio / max(natural_green_ratio, 0.001) < 0.35
        )
        has_crop_signal = (
            nonwhite_ratio >= 0.05
            and plant_within_nonwhite >= 0.35
            and (
                overall_signal >= 0.12
                or center_green_ratio >= 0.12
                or center_plant_ratio >= 0.35
                or red_purple_crop_subject
            )
        )
        synthetic_green_background = (
            chroma_green_ratio >= 0.35
            and center_chroma_green_ratio >= 0.22
            and chroma_green_ratio / max(green_dominant_ratio, 0.001) >= 0.55
            and natural_green_ratio <= 0.18
            and center_natural_green_ratio <= 0.20
            and warm_plant_ratio < 0.08
        )

        return synthetic_green_background or animal_on_green_background or centered_non_leaf_subject or not has_crop_signal

    def _extract_leaf_features(self, image_path: str) -> dict[str, float]:
        image = self._subject_focus_image(image_path, 160)
        array = np.asarray(image, dtype=np.float32)
        normalized_array = array / 255.0
        red_channel = normalized_array[:, :, 0]
        green_channel = normalized_array[:, :, 1]
        blue_channel = normalized_array[:, :, 2]
        contrast = float(array.std())
        max_channel = np.max(normalized_array, axis=2)
        min_channel = np.min(normalized_array, axis=2)
        saturation = max_channel - min_channel
        green_leaf_pixels = (
            (green_channel > red_channel * 1.05)
            & (green_channel > blue_channel * 1.05)
            & (green_channel > 0.15)
            & (saturation > 0.08)
        )
        brown_lesion_pixels = (
            (red_channel > 0.23)
            & (green_channel > 0.12)
            & (blue_channel < 0.38)
            & (red_channel > green_channel * 1.02)
            & (saturation > 0.10)
            & (max_channel < 0.82)
        )
        dark_lesion_pixels = (
            (red_channel > 0.14)
            & (green_channel > 0.08)
            & (blue_channel < 0.28)
            & (red_channel >= green_channel * 0.85)
            & (green_channel > blue_channel * 1.08)
            & (saturation > 0.08)
            & (max_channel < 0.55)
        )
        yellow_halo_pixels = (
            (red_channel > 0.45)
            & (green_channel > 0.35)
            & (blue_channel < 0.25)
            & (red_channel > green_channel * 0.85)
            & (green_channel > blue_channel * 1.2)
            & (saturation > 0.16)
        )
        lesion_pixels = (brown_lesion_pixels | dark_lesion_pixels | yellow_halo_pixels) & ~green_leaf_pixels
        plant_pixels = green_leaf_pixels | lesion_pixels
        yellow_pixels = (
            (red_channel > 0.45)
            & (green_channel > 0.42)
            & (blue_channel < 0.32)
            & (green_channel > blue_channel * 1.15)
        )
        rust_pixels = (
            (red_channel > 0.48)
            & (green_channel > 0.20)
            & (green_channel < 0.48)
            & (blue_channel < 0.24)
            & (red_channel > green_channel * 1.20)
        )
        red_purple_bulb_pixels = (
            (red_channel > 0.24)
            & (blue_channel > 0.10)
            & (red_channel > green_channel * 1.06)
            & (red_channel >= blue_channel * 0.90)
            & (saturation > 0.08)
            & (max_channel > 0.28)
            & (max_channel < 0.98)
            & ~green_leaf_pixels
        )
        plant_pixels = green_leaf_pixels | lesion_pixels | red_purple_bulb_pixels
        banana_fruit_pixels = (
            (red_channel > 0.36)
            & (green_channel > 0.32)
            & (blue_channel < 0.55)
            & (red_channel > blue_channel * 1.12)
            & (green_channel > blue_channel * 1.10)
            & (red_channel < green_channel * 1.45)
            & (green_channel < red_channel * 1.55)
            & (saturation > 0.05)
            & ~green_leaf_pixels
        )
        chroma_green_pixels = (
            green_leaf_pixels
            & (green_channel > 0.42)
            & (red_channel < 0.25)
            & (blue_channel < 0.32)
            & (saturation > 0.36)
        )
        natural_green_pixels = green_leaf_pixels & ~chroma_green_pixels
        lesion_ratio = float(np.mean(lesion_pixels))
        lesion_within_plant = float(np.sum(lesion_pixels) / max(int(np.sum(plant_pixels)), 1))
        edge_mask = np.zeros(lesion_pixels.shape, dtype=bool)
        edge_width = max(8, lesion_pixels.shape[0] // 12)
        edge_mask[:edge_width, :] = True
        edge_mask[-edge_width:, :] = True
        edge_mask[:, :edge_width] = True
        edge_mask[:, -edge_width:] = True
        height, width = green_leaf_pixels.shape
        center_mask = np.zeros(green_leaf_pixels.shape, dtype=bool)
        center_mask[height // 4 : 3 * height // 4, width // 4 : 3 * width // 4] = True
        neutral_subject_pixels = (saturation < 0.18) & (max_channel > 0.25) & (max_channel < 0.95)
        tan_subject_pixels = (
            (red_channel > 0.42)
            & (green_channel > 0.25)
            & (blue_channel > 0.12)
            & (red_channel > green_channel * 1.08)
            & (green_channel > blue_channel * 1.05)
            & (saturation > 0.10)
        )

        component_count = 0
        max_component_area_ratio = 0.0
        max_component_aspect = 1.0
        green_component_count = 0
        max_green_area_ratio = 0.0
        max_green_aspect = 1.0
        green_edge_ratio = 0.0
        adjacent_nonleaf_ratio = 0.0
        fruit_component_count = 0
        max_fruit_area_ratio = 0.0
        max_fruit_aspect = 1.0
        try:
            import cv2

            mask = lesion_pixels.astype("uint8")
            count, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
            for index in range(1, count):
                area = int(stats[index, cv2.CC_STAT_AREA])
                if area < 18:
                    continue
                width = max(int(stats[index, cv2.CC_STAT_WIDTH]), 1)
                height = max(int(stats[index, cv2.CC_STAT_HEIGHT]), 1)
                component_count += 1
                max_component_area_ratio = max(max_component_area_ratio, area / mask.size)
                max_component_aspect = max(max_component_aspect, max(width / height, height / width))

            green_mask = green_leaf_pixels.astype("uint8")
            green_count, _, green_stats, _ = cv2.connectedComponentsWithStats(green_mask, connectivity=8)
            for index in range(1, green_count):
                area = int(green_stats[index, cv2.CC_STAT_AREA])
                if area < 24:
                    continue
                width = max(int(green_stats[index, cv2.CC_STAT_WIDTH]), 1)
                height = max(int(green_stats[index, cv2.CC_STAT_HEIGHT]), 1)
                green_component_count += 1
                max_green_area_ratio = max(max_green_area_ratio, area / green_mask.size)
                max_green_aspect = max(max_green_aspect, max(width / height, height / width))

            kernel = np.ones((3, 3), dtype=np.uint8)
            eroded_green = cv2.erode(green_mask, kernel, iterations=1)
            green_edge_pixels = green_mask.astype(bool) & ~eroded_green.astype(bool)
            green_edge_ratio = float(np.sum(green_edge_pixels) / max(int(np.sum(green_mask)), 1))

            dilated_green = cv2.dilate(green_mask, kernel, iterations=2).astype(bool)
            adjacent_zone = dilated_green & ~green_mask.astype(bool)
            neutral_or_background = (saturation < 0.28) & (max_channel > 0.18) & (max_channel < 0.88)
            adjacent_nonleaf_ratio = float(np.sum(neutral_or_background & adjacent_zone) / max(int(np.sum(green_mask)), 1))

            fruit_mask = banana_fruit_pixels.astype("uint8")
            fruit_count, _, fruit_stats, _ = cv2.connectedComponentsWithStats(fruit_mask, connectivity=8)
            for index in range(1, fruit_count):
                area = int(fruit_stats[index, cv2.CC_STAT_AREA])
                if area < 32:
                    continue
                width = max(int(fruit_stats[index, cv2.CC_STAT_WIDTH]), 1)
                height = max(int(fruit_stats[index, cv2.CC_STAT_HEIGHT]), 1)
                fruit_component_count += 1
                max_fruit_area_ratio = max(max_fruit_area_ratio, area / fruit_mask.size)
                max_fruit_aspect = max(max_fruit_aspect, max(width / height, height / width))
        except Exception:
            logger.debug("OpenCV component analysis unavailable; using aggregate image features only.", exc_info=True)

        return {
            "red_mean": float(array[:, :, 0].mean()),
            "green_mean": float(array[:, :, 1].mean()),
            "blue_mean": float(array[:, :, 2].mean()),
            "contrast": contrast,
            "green_leaf_ratio": float(np.mean(green_leaf_pixels)),
            "lesion_ratio": lesion_ratio,
            "lesion_within_plant": lesion_within_plant,
            "yellow_ratio": float(np.mean(yellow_pixels)),
            "rust_ratio": float(np.mean(rust_pixels)),
            "dark_lesion_ratio": float(np.mean(dark_lesion_pixels)),
            "edge_lesion_ratio": float(np.mean(lesion_pixels[edge_mask])),
            "component_count": float(component_count),
            "max_component_area_ratio": max_component_area_ratio,
            "max_component_aspect": max_component_aspect,
            "green_component_count": float(green_component_count),
            "max_green_area_ratio": max_green_area_ratio,
            "max_green_aspect": max_green_aspect,
            "green_edge_ratio": green_edge_ratio,
            "adjacent_nonleaf_ratio": adjacent_nonleaf_ratio,
            "banana_fruit_ratio": float(np.mean(banana_fruit_pixels)),
            "red_purple_bulb_ratio": float(np.mean(red_purple_bulb_pixels)),
            "fruit_component_count": float(fruit_component_count),
            "max_fruit_area_ratio": max_fruit_area_ratio,
            "max_fruit_aspect": max_fruit_aspect,
            "chroma_green_ratio": float(np.mean(chroma_green_pixels)),
            "natural_green_ratio": float(np.mean(natural_green_pixels)),
            "center_green_ratio": float(np.mean(green_leaf_pixels[center_mask])),
            "center_chroma_green_ratio": float(np.mean(chroma_green_pixels[center_mask])),
            "center_natural_green_ratio": float(np.mean(natural_green_pixels[center_mask])),
            "center_lesion_ratio": float(np.mean(lesion_pixels[center_mask])),
            "center_fruit_ratio": float(np.mean(banana_fruit_pixels[center_mask])),
            "center_red_purple_bulb_ratio": float(np.mean(red_purple_bulb_pixels[center_mask])),
            "center_neutral_ratio": float(np.mean(neutral_subject_pixels[center_mask])),
            "center_tan_ratio": float(np.mean(tan_subject_pixels[center_mask])),
        }

    def _visual_memory_signature(self, features: dict[str, float]) -> dict[str, float]:
        return {key: round(float(features.get(key, 0.0)), 5) for key in VISUAL_MEMORY_FEATURE_KEYS}

    def _visual_memory_distance(self, first: dict[str, Any], second: dict[str, Any]) -> float:
        distances = []
        for key in VISUAL_MEMORY_FEATURE_KEYS:
            try:
                left = float(first.get(key, 0.0))
                right = float(second.get(key, 0.0))
            except (TypeError, ValueError):
                continue
            scale = VISUAL_MEMORY_DISTANCE_SCALES.get(key, 1.0)
            distances.append(min(abs(left - right) / scale, 1.0))
        if not distances:
            return 1.0
        return sum(distances) / len(distances)

    def _image_quality_report(self, image_path: str, features: dict[str, float]) -> dict[str, Any]:
        warnings: list[dict[str, str]] = []

        def add_warning(code: str, title: str, message: str, severity: str = "warning") -> None:
            warnings.append(
                {
                    "code": code,
                    "severity": severity,
                    "title": title,
                    "message": message,
                }
            )

        metrics: dict[str, float | int] = {}
        try:
            with Image.open(image_path) as image:
                image = image.convert("RGB")
                width, height = image.size
                resized = image.resize((min(width, 320), min(height, 320)))
                gray = np.asarray(resized.convert("L"), dtype=np.float32)
                brightness = float(gray.mean())
                contrast = float(gray.std())
                horizontal_gradient = np.abs(np.diff(gray, axis=1)).mean() if gray.shape[1] > 1 else 0.0
                vertical_gradient = np.abs(np.diff(gray, axis=0)).mean() if gray.shape[0] > 1 else 0.0
                sharpness = float((horizontal_gradient + vertical_gradient) / 2)
                metrics = {
                    "width": int(width),
                    "height": int(height),
                    "brightness": round(brightness, 2),
                    "contrast": round(contrast, 2),
                    "sharpness": round(sharpness, 2),
                    "plant_subject_ratio": round(
                        float(
                            features.get("green_leaf_ratio", 0.0)
                            + features.get("banana_fruit_ratio", 0.0)
                            + features.get("red_purple_bulb_ratio", 0.0)
                        ),
                        4,
                    ),
                }
        except Exception:
            logger.exception("Could not compute image quality metrics for %s.", image_path)
            return {"kind": "quality_report", "overall": "unknown", "metrics": metrics, "warnings": warnings}

        if min(int(metrics.get("width", 0)), int(metrics.get("height", 0))) < 320:
            add_warning(
                "low_resolution",
                "Low image resolution",
                "Retake or upload a larger photo so small lesions and pest damage are visible.",
            )
        if float(metrics.get("brightness", 0.0)) < 45:
            add_warning(
                "too_dark",
                "Photo is too dark",
                "Use natural light or move closer to the crop before scanning.",
            )
        if float(metrics.get("brightness", 0.0)) > 225:
            add_warning(
                "overexposed",
                "Photo is overexposed",
                "Avoid harsh glare because pale disease spots can disappear.",
            )
        if float(metrics.get("contrast", 0.0)) < 18:
            add_warning(
                "low_contrast",
                "Low contrast",
                "Place the affected leaf, fruit, or stem against a clearer background.",
            )
        if float(metrics.get("sharpness", 0.0)) < 4.5:
            add_warning(
                "blurry",
                "Photo may be blurry",
                "Hold the camera steady and tap the crop area to focus.",
            )
        if (
            not self._has_crop_part_signal(features, None)
            and features.get("center_green_ratio", 0.0) < 0.08
            and features.get("center_fruit_ratio", 0.0) < 0.08
            and features.get("center_red_purple_bulb_ratio", 0.0) < 0.08
        ):
            add_warning(
                "subject_not_centered",
                "Crop subject is not clear",
                "Center one affected crop part in the frame instead of a wide scene.",
            )

        overall = "needs_better_photo" if warnings else "good"
        return {"kind": "quality_report", "overall": overall, "metrics": metrics, "warnings": warnings}

    def _quality_warning_entries(self, report: dict[str, Any]) -> list[dict[str, Any]]:
        warnings = report.get("warnings")
        if not isinstance(warnings, list):
            return []
        return [
            {
                "kind": "quality_warning",
                "code": warning.get("code"),
                "severity": warning.get("severity", "warning"),
                "title": warning.get("title"),
                "message": warning.get("message"),
            }
            for warning in warnings
            if isinstance(warning, dict)
        ]

    def _pipeline_stage_entries(
        self,
        detection: DiseaseDetection,
        features: dict[str, float],
        crop_type: str | None,
        quality_report: dict[str, Any],
    ) -> list[dict[str, Any]]:
        invalid = detection.disease_name == "Invalid crop or leaf image"
        review = "review" in (detection.disease_name or "").lower() or detection.confidence < 0.58
        selected_crop = self._normalize_crop_type(crop_type)
        detected_crop = self._normalize_crop_type(detection.crop_label)
        crop_part_visible = self._has_crop_part_signal(features, selected_crop or detected_crop)
        quality_ok = not quality_report.get("warnings")

        return [
            {
                "kind": "pipeline_stage",
                "stage": "image_quality",
                "label": "Image quality",
                "status": "pass" if quality_ok else "warning",
                "detail": "Photo quality is usable." if quality_ok else "Photo can still be analyzed, but a clearer image would improve accuracy.",
            },
            {
                "kind": "pipeline_stage",
                "stage": "valid_crop_image",
                "label": "Crop image check",
                "status": "fail" if invalid else "pass",
                "detail": "A crop or plant part was found." if not invalid else "The upload did not look like a diagnosable crop image.",
            },
            {
                "kind": "pipeline_stage",
                "stage": "crop_identification",
                "label": "Crop identification",
                "status": "pass" if detection.crop_label and not invalid else "review",
                "detail": detection.crop_label or "Crop could not be identified confidently.",
            },
            {
                "kind": "pipeline_stage",
                "stage": "crop_part_check",
                "label": "Plant part check",
                "status": "pass" if crop_part_visible else "warning",
                "detail": "Leaf, fruit, stem, or root features are visible." if crop_part_visible else "Retake closer to one affected plant part.",
            },
            {
                "kind": "pipeline_stage",
                "stage": "disease_classification",
                "label": "Disease classification",
                "status": "review" if review else "pass",
                "detail": f"{detection.disease_name} ({round(detection.confidence * 100)}%).",
            },
        ]

    def _append_unique_alternative(
        self,
        alternatives: list[dict[str, Any]],
        seen: set[tuple[str, str]],
        *,
        class_key: str,
        confidence: float,
        crop_label: str | None,
        source: str,
        primary: DiseaseDetection,
    ) -> None:
        canonical_key = self._canonical_key_for_label(class_key)
        metadata = self._metadata_for_key(canonical_key)
        disease_name = metadata["name"]
        display_crop = crop_label or self._crop_label_from_key(canonical_key) or "General crop leaf"
        identity = (display_crop.lower(), disease_name.lower())
        primary_identity = ((primary.crop_label or "").lower(), (primary.disease_name or "").lower())
        if identity == primary_identity or identity in seen:
            return
        seen.add(identity)
        alternatives.append(
            {
                "kind": "alternative",
                "label": disease_name,
                "class_key": canonical_key,
                "crop_label": display_crop,
                "confidence": round(max(0.0, min(float(confidence), 0.96)), 4),
                "source": source,
            }
        )

    def _heuristic_alternatives(
        self,
        features: dict[str, float],
        crop_type: str | None,
        primary: DiseaseDetection,
    ) -> list[dict[str, Any]]:
        alternatives: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        crop_candidates: list[str | None] = []
        selected_crop = self._normalize_crop_type(crop_type)
        primary_crop = self._normalize_crop_type(primary.crop_label)
        inferred_crop = self._infer_crop_key_from_features(features)
        if selected_crop or primary_crop:
            candidate_source = [selected_crop, primary_crop, None]
        else:
            candidate_source = [inferred_crop, "rice", "corn", "tomato", "banana", "mango", "guava"]
        for crop_key in candidate_source:
            if crop_key not in crop_candidates:
                crop_candidates.append(crop_key)

        for crop_key in crop_candidates:
            key, confidence = self._offline_key_from_features(features, crop_key)
            crop_label = self._display_crop_label(crop_key) if crop_key else self._crop_label_from_key(key)
            if key == "review_needed":
                continue
            self._append_unique_alternative(
                alternatives,
                seen,
                class_key=key,
                confidence=max(confidence - 0.08, 0.45),
                crop_label=crop_label,
                source="visual heuristic",
                primary=primary,
            )

        preferred_crop = selected_crop or primary_crop
        if preferred_crop and len(alternatives) < 3:
            peer_labels = [label for label in (self._labels or DEFAULT_LABELS) if self._crop_key_from_class_key(self._canonical_key_for_label(label)) == preferred_crop]
            for label in peer_labels:
                if len(alternatives) >= 3:
                    break
                peer_key = self._canonical_key_for_label(label)
                if peer_key.endswith("_healthy") and "healthy" not in (primary.disease_name or "").lower():
                    continue
                self._append_unique_alternative(
                    alternatives,
                    seen,
                    class_key=peer_key,
                    confidence=max(primary.confidence - 0.18 - len(alternatives) * 0.04, 0.42),
                    crop_label=self._display_crop_label(preferred_crop),
                    source="same-crop fallback",
                    primary=primary,
                )
        alternatives.sort(key=lambda item: float(item.get("confidence", 0.0)), reverse=True)
        return alternatives[:3]

    def _prediction_alternatives(
        self,
        predictions: np.ndarray,
        labels: list[str],
        *,
        selected_index: int,
        crop_type: str | None,
        primary: DiseaseDetection,
    ) -> list[dict[str, Any]]:
        alternatives: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        selected_crop = self._normalize_crop_type(crop_type)
        top_indices = np.argsort(predictions)[::-1][:8]
        for raw_index in top_indices:
            index = int(raw_index)
            if index == selected_index or index >= len(labels):
                continue
            class_key = self._canonical_key_for_label(labels[index])
            if selected_crop and not self._is_class_compatible_with_crop(class_key, selected_crop):
                continue
            self._append_unique_alternative(
                alternatives,
                seen,
                class_key=class_key,
                confidence=float(predictions[index]),
                crop_label=self._crop_label_from_key(class_key, crop_type=crop_type),
                source="trained classifier",
                primary=primary,
            )
        return alternatives[:3]

    def _enrich_detection(
        self,
        detection: DiseaseDetection,
        features: dict[str, float],
        crop_type: str | None,
        quality_report: dict[str, Any],
        *,
        model_alternatives: list[dict[str, Any]] | None = None,
    ) -> DiseaseDetection:
        existing = [
            item
            for item in (detection.detections or [])
            if not isinstance(item, dict)
            or item.get("kind") not in {"pipeline_stage", "quality_warning", "alternative", "quality_report"}
        ]
        metadata_entries: list[dict[str, Any]] = [
            {"kind": "quality_report", **{key: value for key, value in quality_report.items() if key != "kind"}},
            *self._pipeline_stage_entries(detection, features, crop_type, quality_report),
            *self._quality_warning_entries(quality_report),
        ]

        alternatives = model_alternatives or self._heuristic_alternatives(features, crop_type, detection)
        metadata_entries.extend(alternatives[:3])
        detection.detections = existing + metadata_entries
        return detection

    def _visual_memory_has_text_hint(self, example: dict[str, Any], original_filename: str | None, crop_type: str | None) -> bool:
        context = self._context_text(f"{original_filename or ''} {crop_type or ''}")
        if not context:
            return False

        hint_values = [
            example.get("id"),
            example.get("crop_label"),
            example.get("disease_name"),
            example.get("class_key"),
        ]
        hints = set()
        for value in hint_values:
            for token in re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).split():
                if len(token) >= 4:
                    hints.add(token)
        return any(re.search(rf"\b{re.escape(token)}\b", context) for token in hints)

    def _visual_memory_crop_allowed(self, example: dict[str, Any], selected_crop_key: str | None) -> bool:
        class_key = self._canonical_key_for_label(str(example.get("class_key") or ""))
        if class_key == "invalid_crop_image":
            return selected_crop_key is None
        if str(example.get("crop_scope") or "").lower() == "any":
            return True
        if not selected_crop_key:
            return True
        crop_label = str(example.get("crop_label") or "")
        example_crop_key = self._normalize_crop_type(crop_label)
        if example_crop_key is None:
            return False
        return example_crop_key == selected_crop_key

    def _visual_memory_detection(
        self,
        features: dict[str, float],
        *,
        crop_type: str | None,
        original_filename: str | None,
        allow_online_lookup: bool,
    ) -> DiseaseDetection | None:
        examples = self._load_visual_memory_examples()
        if not examples:
            return None

        signature = self._visual_memory_signature(features)
        selected_crop_key = self._normalize_crop_type(crop_type)
        best_example: dict[str, Any] | None = None
        best_distance = 1.0
        best_has_hint = False

        for example in examples:
            if not self._visual_memory_crop_allowed(example, selected_crop_key):
                continue
            distance = self._visual_memory_distance(signature, example.get("feature_signature") or {})
            has_hint = self._visual_memory_has_text_hint(example, original_filename, crop_type)
            threshold = float(
                example.get(
                    "match_threshold",
                    VISUAL_MEMORY_HINTED_DISTANCE if (selected_crop_key or has_hint) else VISUAL_MEMORY_STRICT_DISTANCE,
                )
            )
            if selected_crop_key or has_hint:
                threshold = max(threshold, VISUAL_MEMORY_HINTED_DISTANCE)
            if distance <= threshold and distance < best_distance:
                best_example = example
                best_distance = distance
                best_has_hint = has_hint

        if best_example is None:
            return None

        class_key = self._canonical_key_for_label(str(best_example.get("class_key") or "review_needed"))
        crop_label = str(best_example.get("crop_label") or "") or self._crop_label_from_key(class_key)
        if str(best_example.get("crop_scope") or "").lower() == "any" and selected_crop_key:
            crop_label = self._display_crop_label(selected_crop_key) or crop_label
        metadata = self._metadata_for_key(class_key)
        base_confidence = float(best_example.get("confidence") or 0.88)
        confidence = max(0.72, min(0.96, base_confidence - best_distance * 1.25))
        if class_key == "invalid_crop_image":
            return DiseaseDetection(
                disease_name=metadata["name"],
                confidence=0.0,
                cause=metadata["cause"],
                treatment=metadata["treatment"],
                crop_label=None,
                analysis_mode="verified visual memory rejection",
            )

        unsupported_crop = crop_label.startswith("Possible ") or (
            crop_label and self._normalize_crop_type(crop_label) is None and class_key in {"healthy", "review_needed"}
        )
        if unsupported_crop and class_key in {"healthy", "review_needed"}:
            display_crop = crop_label.removeprefix("Possible ").strip() or crop_label
            disease_name = "Possible healthy crop" if class_key == "healthy" else "Crop scan needs review"
            cause = (
                f"AgriScan matched this image to a verified {display_crop} sample. "
                "This crop is not in the trained crop list, so the result is shown as a possible crop match."
            )
            treatment = (
                "Compare with a trusted crop reference, monitor for spots, wilting, rot, or pest damage, "
                "and confirm with a local agriculture officer before applying treatment."
            )
            detection = DiseaseDetection(
                disease_name=disease_name,
                confidence=confidence,
                cause=cause,
                treatment=treatment,
                crop_label=crop_label if crop_label.startswith("Possible ") else f"Possible {crop_label}",
                analysis_mode="verified visual memory",
            )
            return self._with_online_reference(detection, class_key, display_crop, allow_online_lookup=allow_online_lookup)

        disease_name = str(best_example.get("disease_name") or metadata["name"])
        cause = metadata["cause"]
        if best_has_hint or selected_crop_key:
            cause = f"{cause} This result matched a verified AgriScan training example."
        detection = DiseaseDetection(
            disease_name=disease_name,
            confidence=confidence,
            cause=cause,
            treatment=metadata["treatment"],
            crop_label=crop_label,
            analysis_mode="verified visual memory",
        )
        return self._with_online_reference(detection, class_key, crop_label, allow_online_lookup=allow_online_lookup)

    def _healthy_key_for_crop(self, crop_key: str | None) -> str:
        if crop_key and f"{crop_key}_healthy" in (self._labels or DEFAULT_LABELS):
            return f"{crop_key}_healthy"
        return "healthy"

    def _has_trained_labels_for_crop(self, crop_key: str | None) -> bool:
        if not crop_key:
            return False
        labels = self._labels or DEFAULT_LABELS
        return any(
            self._crop_key_from_class_key(self._canonical_key_for_label(label)) == crop_key
            for label in labels
        )

    def _confidence_from_features(self, features: dict[str, float], crop_key: str | None, *, matched_pattern: bool) -> float:
        confidence = 0.56 + min(features["lesion_within_plant"] * 0.35, 0.18) + min(features["lesion_ratio"] * 1.5, 0.10)
        if crop_key:
            confidence += 0.08
        if matched_pattern:
            confidence += 0.04
        return min(max(confidence, 0.58), 0.87)

    def _has_strong_visual_disease_signal(self, features: dict[str, float], crop_key: str | None = None) -> bool:
        if crop_key in {None, "rice"} and self._looks_like_healthy_rice_panicle(features):
            return False
        if crop_key in {None, "banana"} and self._looks_like_healthy_banana_bunch(features):
            return False

        structural_damage = (
            features["green_leaf_ratio"] >= 0.14
            and features["lesion_within_plant"] < 0.045
            and features["lesion_ratio"] < 0.045
            and features["adjacent_nonleaf_ratio"] >= 0.08
            and (
                features["green_edge_ratio"] >= 0.18
                or (features["adjacent_nonleaf_ratio"] >= 0.18 and features["contrast"] >= 55)
            )
        )
        high_edge_damage = (
            features["green_leaf_ratio"] >= 0.12
            and features["lesion_ratio"] < 0.035
            and features["contrast"] >= 62
            and features["green_edge_ratio"] >= 0.24
        )
        spotted_leaf = (
            features["component_count"] >= 7
            and features["max_component_area_ratio"] < 0.035
            and features["lesion_ratio"] >= 0.028
        )
        broad_lesion = features["max_component_area_ratio"] >= 0.055 and features["lesion_ratio"] >= 0.035
        yellow_blight = (
            features["yellow_ratio"] >= 0.16
            and features["green_leaf_ratio"] >= 0.18
            and (features["lesion_ratio"] >= 0.03 or features["edge_lesion_ratio"] >= 0.06)
        )

        return (
            structural_damage
            or high_edge_damage
            or spotted_leaf
            or broad_lesion
            or yellow_blight
            or features["lesion_within_plant"] >= 0.075
            or features["lesion_ratio"] >= 0.055
            or features["dark_lesion_ratio"] >= 0.045
            or features["rust_ratio"] >= 0.035
            or features["edge_lesion_ratio"] >= 0.08
        )

    def _freeform_unsupported_crop_label(self, crop_type: str | None) -> str | None:
        if not crop_type or self._normalize_crop_type(crop_type):
            return None
        text = re.sub(r"[^a-z0-9]+", " ", crop_type.lower()).strip()
        if not text or text in {"auto detect", "auto detect crop", "select crop", "unknown"}:
            return None
        if any(re.search(rf"\b{re.escape(term)}\b", text) for term in NON_CROP_FILENAME_TERMS):
            return None
        for alias, label in UNSUPPORTED_CROP_ALIASES.items():
            if re.search(rf"\b{re.escape(alias)}\b", text):
                return label
        words = [word for word in text.split() if word not in {"crop", "plant", "leaf"}]
        if not words:
            return None
        return " ".join(words[:4]).title()

    def _unsupported_crop_label_from_filename(self, original_filename: str | None) -> str | None:
        text = self._context_text(original_filename)
        if not text:
            return None
        for alias, label in UNSUPPORTED_CROP_ALIASES.items():
            if re.search(rf"\b{re.escape(alias)}\b", text):
                return label
        return None

    def _possible_crop_group_label(self, features: dict[str, float]) -> str | None:
        has_leaf_or_plant_subject = self._has_crop_subject_in_foreground(features, None) or (
            features["green_leaf_ratio"] >= 0.16
            and (features["max_green_area_ratio"] >= 0.08 or features["lesion_ratio"] >= 0.035)
        ) or self._has_crop_part_signal(features, None)
        if not has_leaf_or_plant_subject:
            return None
        if features["banana_fruit_ratio"] >= 0.12 or features["max_fruit_area_ratio"] >= 0.10:
            return "Unlisted fruit crop"
        if features["max_green_aspect"] >= 2.3 or (
            features["green_component_count"] >= 3
            and features["max_green_aspect"] >= 1.9
            and features["max_green_area_ratio"] < 0.22
        ):
            return "Unlisted grass-like crop"
        if features["green_leaf_ratio"] >= 0.22 or features["max_green_area_ratio"] >= 0.12:
            return "Unlisted leafy crop"
        return "Unlisted crop"

    def _possible_unsupported_crop_label(
        self,
        features: dict[str, float],
        *,
        original_filename: str | None,
        crop_type: str | None,
        supported_inferred_crop: str | None,
    ) -> str | None:
        normalized_selected_crop = self._normalize_crop_type(crop_type)
        filename_label = self._unsupported_crop_label_from_filename(original_filename)
        if filename_label:
            if (
                normalized_selected_crop
                and supported_inferred_crop == normalized_selected_crop
                and self._is_reliable_visual_crop_inference(features, supported_inferred_crop)
            ):
                return None
            return filename_label

        if normalized_selected_crop:
            return None

        freeform_label = self._freeform_unsupported_crop_label(crop_type)
        if freeform_label:
            if supported_inferred_crop and self._is_reliable_visual_crop_inference(features, supported_inferred_crop):
                return None
            return freeform_label

        filename_crop, _, _ = self._filename_context(original_filename, crop_type)
        if filename_crop:
            return None

        if supported_inferred_crop and self._is_reliable_visual_crop_inference(features, supported_inferred_crop):
            return None
        return self._possible_crop_group_label(features)

    def _possible_unsupported_crop_detection(
        self,
        features: dict[str, float],
        crop_label: str,
        *,
        allow_online_lookup: bool,
    ) -> DiseaseDetection:
        key, confidence = self._offline_key_from_features(features, None)
        class_key = self._canonical_key_for_label(key)
        has_disease_signal = self._has_strong_visual_disease_signal(features, None)
        possible_crop_label = crop_label if crop_label.startswith("Possible ") else f"Possible {crop_label}"

        if class_key in {"healthy", "review_needed"} or class_key.endswith("_healthy") or not has_disease_signal:
            detection = DiseaseDetection(
                disease_name="Possible healthy crop",
                confidence=min(max(confidence if class_key != "review_needed" else 0.58, 0.54), 0.72),
                cause=(
                    f"AgriScan does not have {crop_label} in the trained crop list. "
                    "The visible plant tissue does not show strong disease markers, so it may be healthy."
                ),
                treatment=(
                    "Keep monitoring new leaves or fruit, compare with a trusted crop guide, and retake a close photo "
                    "if spots, yellowing, wilting, or rot appears."
                ),
                crop_label=possible_crop_label,
                analysis_mode="unsupported crop visual analysis",
            )
            reference_key = "healthy"
        elif class_key == "pest_leaf_damage":
            detection = DiseaseDetection(
                disease_name="Possible pest-related leaf damage",
                confidence=min(max(confidence, 0.58), 0.76),
                cause=(
                    f"AgriScan does not have {crop_label} in the trained crop list. "
                    "The visible subject shows chewing, edge damage, holes, or discoloration that can match pest or physical damage."
                ),
                treatment=(
                    "Inspect both sides of nearby leaves for insects or larvae, remove badly damaged tissue when practical, "
                    "and confirm the crop and pest before using pesticide."
                ),
                crop_label=possible_crop_label,
                analysis_mode="unsupported crop visual analysis",
            )
            reference_key = "pest_leaf_damage"
        else:
            detection = DiseaseDetection(
                disease_name="Possible leaf spot or blight symptoms",
                confidence=min(max(confidence, 0.58), 0.78),
                cause=(
                    f"AgriScan does not have {crop_label} in the trained crop list. "
                    "Visible spots, blighting, rust, or necrotic tissue suggest a possible crop disease."
                ),
                treatment=(
                    "Remove heavily affected tissue, improve airflow, avoid wetting foliage, and use the linked crop reference "
                    "or a local agriculture officer to confirm the exact crop disease before treatment."
                ),
                crop_label=possible_crop_label,
                analysis_mode="unsupported crop visual analysis",
            )
            reference_key = "leaf_spot_or_blight"

        detection = self._with_online_reference(
            detection,
            reference_key,
            crop_label,
            allow_online_lookup=allow_online_lookup,
        )
        if detection.reference_url:
            detection.analysis_mode = "online unsupported crop reference"
        return detection

    def _review_needed_detection(
        self,
        *,
        crop_type: str | None = None,
        crop_label: str | None = None,
        confidence: float = 0.52,
        analysis_mode: str = "uncertain visual review",
    ) -> DiseaseDetection:
        meta = self._metadata_for_key("review_needed")
        normalized_crop = self._normalize_crop_type(crop_type)
        label = crop_label or self._display_crop_label(normalized_crop) or "General crop leaf"
        return DiseaseDetection(
            disease_name=meta["name"],
            confidence=min(max(confidence, 0.35), 0.54),
            cause=meta["cause"],
            treatment=meta["treatment"],
            crop_label=label,
            analysis_mode=analysis_mode,
        )

    def _is_non_alert_detection(self, detection: DiseaseDetection) -> bool:
        name = detection.disease_name.strip().lower()
        return name in {
            "healthy",
            "healthy crop",
            "invalid crop or leaf image",
            "low-confidence crop image",
            "crop scan needs review",
            "manual field review needed",
        }

    def _review_if_uncertain(
        self,
        detection: DiseaseDetection,
        features: dict[str, float],
        crop_type: str | None,
        *,
        predicted_key: str | None = None,
        analysis_mode: str | None = None,
    ) -> DiseaseDetection | None:
        if self._is_non_alert_detection(detection):
            return None

        normalized_crop = self._normalize_crop_type(crop_type)
        has_strong_signal = self._has_strong_visual_disease_signal(features, normalized_crop)
        feature_crop = self._infer_crop_key_from_features(features)
        predicted_crop = None
        if predicted_key:
            predicted_crop = self._crop_key_from_class_key(self._canonical_key_for_label(predicted_key))
        if not predicted_crop and detection.crop_label:
            predicted_crop = self._normalize_crop_type(detection.crop_label)

        crop_conflict = bool(not normalized_crop and feature_crop and predicted_crop and feature_crop != predicted_crop)
        weak_threshold = 0.88 if normalized_crop else 0.92
        if crop_conflict and detection.confidence < 0.90:
            return self._review_needed_detection(
                crop_type=crop_type or feature_crop or predicted_crop,
                crop_label=self._display_crop_label(feature_crop) or detection.crop_label,
                confidence=min(detection.confidence, 0.54),
                analysis_mode=analysis_mode or "crop-consistency visual review",
            )
        if not has_strong_signal and detection.confidence < weak_threshold:
            return self._review_needed_detection(
                crop_type=crop_type or feature_crop or predicted_crop,
                crop_label=detection.crop_label or self._display_crop_label(feature_crop),
                confidence=min(detection.confidence, 0.54),
                analysis_mode=analysis_mode or "uncertain visual review",
            )
        return None

    def _context_text(self, value: str | None) -> str:
        if not value:
            return ""
        stem = Path(value).stem
        return re.sub(r"[^a-z0-9]+", " ", stem.lower()).strip()

    def _has_non_crop_filename_context(self, original_filename: str | None) -> bool:
        text = self._context_text(original_filename)
        if not text:
            return False
        if "spider mite" in text or "spider mites" in text:
            return False
        return any(re.search(rf"\b{re.escape(term)}\b", text) for term in NON_CROP_FILENAME_TERMS)

    def _invalid_crop_image_detection(self) -> DiseaseDetection:
        return DiseaseDetection(
            disease_name="Invalid crop or leaf image",
            confidence=0.0,
            cause="The uploaded photo does not appear to be a crop, leaf, fruit, or plant part that AgriScan can diagnose.",
            treatment="Upload a clear close-up photo of one crop leaf, fruit, stem, or plant part. Avoid animals, people, tools, vehicles, and indoor objects.",
            crop_label=None,
            analysis_mode="rejected upload",
        )

    def _looks_like_background_green_scene(self, features: dict[str, float], crop_key: str | None) -> bool:
        if crop_key:
            return False
        has_foreground_crop = self._has_crop_subject_in_foreground(features, crop_key)
        return (
            features["green_leaf_ratio"] >= 0.58
            and features["lesion_ratio"] < 0.018
            and features["green_component_count"] <= 2
            and features["green_edge_ratio"] < 0.08
            and features["adjacent_nonleaf_ratio"] < 0.08
            and features["banana_fruit_ratio"] < 0.18
            and not has_foreground_crop
        )

    def _looks_like_red_purple_bulb(self, features: dict[str, float], crop_key: str | None) -> bool:
        if crop_key not in {None, "onion"}:
            return False
        return (
            features.get("red_purple_bulb_ratio", 0.0) >= 0.08
            and features.get("center_red_purple_bulb_ratio", 0.0) >= 0.10
            and features.get("green_leaf_ratio", 0.0) < 0.12
            and features.get("max_green_area_ratio", 0.0) < 0.08
            and features.get("banana_fruit_ratio", 0.0) < 0.08
        )

    def _has_crop_subject_in_foreground(self, features: dict[str, float], crop_key: str | None) -> bool:
        fruit_or_stem_crop = crop_key in {
            "banana",
            "corn",
            "mango",
            "guava",
            "tomato",
            "pepper",
            "eggplant",
            "cacao",
            "coffee",
        }
        red_purple_bulb = self._looks_like_red_purple_bulb(features, crop_key)
        centered_leaf = (
            features["center_green_ratio"] >= 0.075
            or (features["max_green_area_ratio"] >= 0.12 and features["green_leaf_ratio"] >= 0.18)
        )
        animal_like_center = (
            features["center_green_ratio"] < 0.04
            and features["center_tan_ratio"] >= 0.28
            and features["center_neutral_ratio"] >= 0.16
            and features["center_fruit_ratio"] < 0.14
        )
        centered_disease_tissue = (
            not animal_like_center
            and features["center_lesion_ratio"] >= 0.08
            and (features["center_green_ratio"] >= 0.035 or features["green_leaf_ratio"] >= 0.10)
        )
        centered_fruit_or_stem = (
            (fruit_or_stem_crop or features["center_fruit_ratio"] >= 0.14)
            and features["center_fruit_ratio"] >= 0.18
            and (
                features["center_green_ratio"] >= 0.035
                or features["green_leaf_ratio"] >= 0.10
                or features["lesion_ratio"] >= 0.065
            )
        )
        return centered_leaf or centered_disease_tissue or centered_fruit_or_stem or red_purple_bulb

    def _has_crop_part_signal(self, features: dict[str, float], crop_key: str | None) -> bool:
        if self._has_crop_subject_in_foreground(features, crop_key):
            return True
        if self._looks_like_red_purple_bulb(features, crop_key):
            return True
        if self._looks_like_corn_ear_morphology(features):
            return True
        if self._looks_like_banana_fruit_issue(features, crop_key):
            return True
        if self._looks_like_healthy_rice_panicle(features) or self._looks_like_healthy_banana_bunch(features):
            return True

        produce_signal = (
            features["banana_fruit_ratio"] >= 0.08
            or features["max_fruit_area_ratio"] >= 0.055
            or features["center_fruit_ratio"] >= 0.10
            or (features["fruit_component_count"] >= 2 and features["max_fruit_area_ratio"] >= 0.025)
        )
        diseased_produce = (
            produce_signal
            and features["center_lesion_ratio"] >= 0.055
            and features["lesion_ratio"] >= 0.032
            and (
                features["dark_lesion_ratio"] >= 0.018
                or features["rust_ratio"] >= 0.018
                or features["yellow_ratio"] >= 0.035
                or features["green_leaf_ratio"] >= 0.08
            )
        )
        green_pod_or_leaf_cluster = (
            features["green_leaf_ratio"] >= 0.16
            and features["max_green_area_ratio"] >= 0.07
            and (
                features["center_green_ratio"] >= 0.08
                or features["green_component_count"] >= 3
                or features["max_green_aspect"] >= 1.6
            )
        )
        damaged_plant_tissue = (
            features["green_leaf_ratio"] >= 0.08
            and features["lesion_ratio"] >= 0.035
            and (
                features["center_lesion_ratio"] >= 0.045
                or features["green_edge_ratio"] >= 0.16
                or features["adjacent_nonleaf_ratio"] >= 0.16
            )
        )
        return diseased_produce or green_pod_or_leaf_cluster or damaged_plant_tissue

    def _has_foreground_leaf_disease_signal(self, features: dict[str, float], crop_key: str | None) -> bool:
        if not self._has_strong_visual_disease_signal(features, crop_key):
            return False
        animal_like_center = (
            crop_key is None
            and features["center_tan_ratio"] >= 0.18
            and features["center_neutral_ratio"] >= 0.10
            and features["center_green_ratio"] < 0.45
            and features["green_edge_ratio"] < 0.09
            and features["adjacent_nonleaf_ratio"] < 0.07
        )
        if animal_like_center:
            return False
        centered_spotted_leaf = (
            features["center_green_ratio"] >= 0.07
            and features["center_lesion_ratio"] >= 0.02
            and features["lesion_within_plant"] >= 0.035
        )
        broad_spotted_leaf = (
            features["green_leaf_ratio"] >= 0.18
            and features["max_green_area_ratio"] >= 0.08
            and features["lesion_ratio"] >= 0.025
            and features["component_count"] >= 3
        )
        large_diseased_leaf = (
            features["green_leaf_ratio"] >= 0.30
            and features["max_green_area_ratio"] >= 0.25
            and features["lesion_ratio"] >= 0.035
        )
        return centered_spotted_leaf or broad_spotted_leaf or large_diseased_leaf

    def _is_reliable_visual_crop_inference(self, features: dict[str, float], crop_key: str | None) -> bool:
        if not crop_key:
            return False
        if crop_key == "banana":
            return self._looks_like_healthy_banana_bunch(features) or self._looks_like_banana_fruit_issue(features, None)
        if crop_key == "rice":
            return self._looks_like_healthy_rice_panicle(features)
        if crop_key == "corn":
            return self._looks_like_corn_ear_issue(features, None)
        if crop_key == "mango":
            return self._looks_like_mango_leaf(features)
        if crop_key == "onion":
            return self._looks_like_red_purple_bulb(features, crop_key)
        if crop_key in {"cabbage", "pechay", "gabi_taro"}:
            return (
                features["green_leaf_ratio"] >= 0.25
                and features["center_green_ratio"] >= 0.45
                and features["max_green_area_ratio"] >= 0.25
                and features["center_tan_ratio"] < 0.08
                and features["banana_fruit_ratio"] < 0.08
            )
        if crop_key in {"tomato", "pepper", "potato", "eggplant"}:
            return (
                features["green_leaf_ratio"] >= 0.18
                and features["component_count"] >= 5
                and features["lesion_ratio"] >= 0.025
                and features["banana_fruit_ratio"] < 0.12
            )
        return False

    def validate_selected_crop_type(self, image_path: str, crop_type: str | None) -> str | None:
        selected_crop = self._normalize_crop_type(crop_type)
        if not crop_type or not crop_type.strip():
            return None
        if selected_crop is None:
            return None

        features = self._extract_leaf_features(image_path)
        visual_crop = self._infer_crop_key_from_features(features)
        if (
            visual_crop is None
            or visual_crop == selected_crop
            or not self._is_reliable_visual_crop_inference(features, visual_crop)
        ):
            return None

        selected_label = self._display_crop_label(selected_crop) or self._freeform_unsupported_crop_label(crop_type) or crop_type
        visual_label = self._display_crop_label(visual_crop) or visual_crop.replace("_", " ").title()
        return f"Selected crop is {selected_label}, but the uploaded image looks like {visual_label}. Choose {visual_label} or use Auto detect crop."

    def _looks_like_non_crop_foreground(self, features: dict[str, float], crop_key: str | None) -> bool:
        has_foreground_crop = self._has_crop_subject_in_foreground(features, crop_key)
        if self._has_crop_part_signal(features, crop_key):
            return False
        if self._has_foreground_leaf_disease_signal(features, crop_key):
            return False
        synthetic_green_background = (
            features["chroma_green_ratio"] >= 0.35
            and features["center_chroma_green_ratio"] >= 0.22
            and features["chroma_green_ratio"] / max(features["green_leaf_ratio"], 0.001) >= 0.55
            and features["natural_green_ratio"] <= 0.18
            and features["center_natural_green_ratio"] <= 0.20
            and features["banana_fruit_ratio"] < 0.10
        )
        weak_overall_crop_signal = (
            features["green_leaf_ratio"] < 0.06
            and features["lesion_ratio"] < 0.018
            and features["banana_fruit_ratio"] < 0.08
        )
        background_only_green = (
            features["green_leaf_ratio"] >= 0.08
            and features["center_green_ratio"] < 0.045
            and features["center_fruit_ratio"] < 0.10
            and features["center_lesion_ratio"] < 0.08
        )
        centered_neutral_object = (
            features["center_neutral_ratio"] >= 0.34
            and features["center_green_ratio"] < 0.08
            and features["center_fruit_ratio"] < 0.22
        )
        centered_fur_like_object = (
            features["center_green_ratio"] < 0.07
            and features["center_tan_ratio"] >= 0.18
            and features["center_neutral_ratio"] >= 0.16
            and features["max_green_area_ratio"] < 0.16
            and not has_foreground_crop
        )
        animal_on_green_background = (
            features["green_leaf_ratio"] >= 0.12
            and features["center_green_ratio"] < 0.04
            and features["center_tan_ratio"] >= 0.28
            and features["center_neutral_ratio"] >= 0.16
            and features["center_fruit_ratio"] < 0.14
            and features["center_natural_green_ratio"] / max(features["natural_green_ratio"], 0.001) < 0.35
        )
        animal_on_lawn_subject = (
            features["green_leaf_ratio"] >= 0.45
            and features["max_green_area_ratio"] >= 0.45
            and features["green_component_count"] <= 2
            and features["green_edge_ratio"] < 0.10
            and features["adjacent_nonleaf_ratio"] < 0.07
            and features["center_green_ratio"] < 0.45
            and features["center_tan_ratio"] >= 0.18
            and features["center_neutral_ratio"] >= 0.10
            and features["center_fruit_ratio"] < 0.20
            and features["banana_fruit_ratio"] < 0.14
            and features["fruit_component_count"] <= 4
        )
        centered_animal_or_person = (
            not crop_key
            and features["green_leaf_ratio"] >= 0.20
            and features["center_green_ratio"] < 0.12
            and features["max_green_area_ratio"] < 0.30
            and features["lesion_ratio"] < 0.04
            and features["banana_fruit_ratio"] < 0.08
            and features["center_tan_ratio"] >= 0.12
            and features["center_neutral_ratio"] >= 0.10
            and features["center_lesion_ratio"] < 0.04
        )
        flat_green_background = (
            not crop_key
            and features["green_leaf_ratio"] >= 0.58
            and features["lesion_ratio"] < 0.018
            and features["green_component_count"] <= 2
            and features["green_edge_ratio"] < 0.08
            and features["adjacent_nonleaf_ratio"] < 0.08
            and features["center_fruit_ratio"] < 0.18
            and not has_foreground_crop
        )
        return (
            synthetic_green_background
            or weak_overall_crop_signal
            or background_only_green
            or centered_neutral_object
            or centered_fur_like_object
            or animal_on_green_background
            or animal_on_lawn_subject
            or centered_animal_or_person
            or flat_green_background
        )

    def _filename_context(self, original_filename: str | None, crop_type: str | None = None) -> tuple[str | None, str | None, float]:
        text = self._context_text(original_filename)
        crop_key = self._normalize_crop_type(crop_type)
        if not text:
            return crop_key, None, 0.0

        for alias, canonical in CROP_ALIASES.items():
            if re.search(rf"\b{re.escape(alias)}\b", text):
                crop_key = canonical
                break
        if any(term in text for term in ["banana", "saging", "bunch", "crown"]):
            crop_key = "banana"

        key: str | None = None
        confidence = 0.72
        if "early blight" in text:
            if crop_key == "potato":
                key = "potato_early_blight"
            elif crop_key in {None, "tomato"}:
                key = "tomato_early_blight"
                crop_key = "tomato"
            else:
                key = "leaf_spot_or_blight"
            confidence = 0.88 if key != "leaf_spot_or_blight" else 0.78
        elif "late blight" in text:
            if crop_key == "potato":
                key = "potato_late_blight"
            elif crop_key in {None, "tomato"}:
                key = "tomato_late_blight"
                crop_key = "tomato"
            else:
                key = "leaf_spot_or_blight"
            confidence = 0.86 if key != "leaf_spot_or_blight" else 0.76
        elif "septoria" in text:
            key = "tomato_septoria_leaf_spot"
            crop_key = "tomato"
            confidence = 0.86
        elif "target spot" in text:
            key = "tomato_target_spot"
            crop_key = "tomato"
            confidence = 0.84
        elif "rice blast" in text or (crop_key == "rice" and "blast" in text):
            key = "rice_blast"
            crop_key = "rice"
            confidence = 0.86
        elif crop_key == "mango" and ("phoma" in text or "blight" in text):
            key = "mango_phoma_blight"
            confidence = 0.88 if "phoma" in text else 0.82
        elif crop_key == "mango" and "anthracnose" in text:
            key = "mango_anthracnose"
            confidence = 0.86
        elif crop_key == "mango" and ("canker" in text or "black spot" in text):
            key = "mango_bacterial_canker"
            confidence = 0.82
        elif "northern leaf blight" in text or (crop_key == "corn" and "blight" in text):
            key = "corn_northern_leaf_blight"
            crop_key = "corn"
            confidence = 0.84
        elif "stalk rot" in text or ("stalk" in text and "rot" in text):
            key = "corn_stalk_rot"
            crop_key = crop_key or "corn"
            confidence = 0.84
        elif crop_key == "corn" and any(term in text for term in ["earworm", "borer", "cob", "ear", "kernel", "husk"]):
            key = "corn_ear_pest_damage"
            confidence = 0.84
        elif "sigatoka" in text:
            key = "banana_black_sigatoka" if "black" in text else "banana_yellow_sigatoka"
            crop_key = "banana"
            confidence = 0.84
        elif crop_key == "banana" and any(term in text for term in ["bunch", "crown", "closeup", "close up"]):
            key = "banana_crown_rot"
            confidence = 0.83
        elif crop_key == "banana" and any(term in text for term in ["fruit", "rot", "anthracnose", "black", "disease", "spot"]):
            key = "banana_fruit_rot"
            confidence = 0.82
        elif crop_key == "guava" and ("phytophthora" in text or "phytopthora" in text):
            key = "guava_phytophthora"
            confidence = 0.86
        elif crop_key == "guava" and ("red rust" in text or "rust" in text):
            key = "guava_red_rust"
            confidence = 0.84
        elif crop_key == "guava" and "scab" in text:
            key = "guava_scab"
            confidence = 0.82

        return crop_key, key, confidence

    def _make_detection(
        self,
        key: str,
        confidence: float,
        *,
        crop_type: str | None = None,
        analysis_mode: str,
        allow_online_lookup: bool,
    ) -> DiseaseDetection:
        meta = self._metadata_for_key(key)
        crop_label = self._crop_label_from_key(key, crop_type=crop_type) or "General crop"
        detection = DiseaseDetection(
            meta["name"],
            min(max(confidence, 0.45), 0.91),
            meta["cause"],
            meta["treatment"],
            crop_label=crop_label,
            analysis_mode=analysis_mode,
        )
        return self._with_online_reference(detection, key, crop_type or crop_label, allow_online_lookup=allow_online_lookup)

    def _looks_like_corn_ear_morphology(self, features: dict[str, float]) -> bool:
        kernel_signal = features["banana_fruit_ratio"] >= 0.22 or features["max_fruit_area_ratio"] >= 0.12
        husk_signal = features["green_leaf_ratio"] >= 0.06 or features["green_component_count"] >= 2
        damage_signal = (
            features["lesion_ratio"] >= 0.10
            or features["dark_lesion_ratio"] >= 0.045
            or features["rust_ratio"] >= 0.03
        )
        cob_structure = (
            features["fruit_component_count"] >= 3
            and features["max_fruit_area_ratio"] >= 0.08
            and features["max_fruit_area_ratio"] < 0.34
            and features["center_fruit_ratio"] >= 0.18
        )
        not_leaf_dominant = features["green_leaf_ratio"] < 0.42 and features["max_green_area_ratio"] < 0.28
        not_banana_bunch = not (
            features["green_component_count"] >= 8
            and features["max_green_aspect"] >= 3.0
            and features["max_fruit_area_ratio"] < 0.12
        )
        return kernel_signal and husk_signal and damage_signal and cob_structure and not_leaf_dominant and not_banana_bunch

    def _looks_like_banana_fruit_issue(self, features: dict[str, float], crop_key: str | None) -> bool:
        if self._looks_like_corn_ear_morphology(features):
            return False
        if crop_key not in {None, "banana"}:
            return False
        if self._looks_like_healthy_rice_panicle(features):
            return False
        if crop_key is None and features["green_leaf_ratio"] >= 0.45 and features["max_green_area_ratio"] >= 0.28:
            return False
        fruit_signal = (
            features["banana_fruit_ratio"] >= 0.10
            or features["max_fruit_area_ratio"] >= 0.08
            or (
                features["yellow_ratio"] >= 0.09
                and features["dark_lesion_ratio"] >= 0.035
                and features["green_leaf_ratio"] < 0.28
            )
        )
        decay_signal = features["dark_lesion_ratio"] >= 0.04 or (
            features["lesion_ratio"] >= 0.13
            and features["max_component_area_ratio"] >= 0.06
            and features["rust_ratio"] >= 0.035
        )
        not_leaf_dominant = (
            features["green_leaf_ratio"] < 0.38
            or features["fruit_component_count"] >= 2
            or features["green_component_count"] >= 8
        )
        return fruit_signal and decay_signal and not_leaf_dominant

    def _looks_like_healthy_rice_panicle(self, features: dict[str, float]) -> bool:
        warm_grain_ratio = features["banana_fruit_ratio"] + features["yellow_ratio"]
        mango_blight_like = self._looks_like_mango_leaf(features) and (
            features["dark_lesion_ratio"] >= 0.018
            or features["lesion_ratio"] >= 0.028
            or features["center_tan_ratio"] >= 0.08
        )
        if mango_blight_like:
            return False
        rust_spot_disease = (
            features["component_count"] >= 8
            and features["rust_ratio"] >= 0.025
            and features["lesion_ratio"] >= 0.07
        )
        large_blight_patch = (
            features["max_component_area_ratio"] >= 0.055
            and features["lesion_ratio"] >= 0.10
            and features["dark_lesion_ratio"] >= 0.035
        )
        mature_rice_panicle = (
            features["banana_fruit_ratio"] >= 0.22
            and features["yellow_ratio"] >= 0.16
            and features["green_leaf_ratio"] >= 0.18
            and features["max_green_aspect"] >= 2.40
            and features["fruit_component_count"] >= 6
            and features["max_fruit_area_ratio"] >= 0.10
            and features["max_fruit_area_ratio"] < 0.32
            and features["rust_ratio"] < 0.02
            and features["dark_lesion_ratio"] < 0.24
            and features["lesion_ratio"] < 0.38
        )
        if mature_rice_panicle:
            return True

        grain_panicle_structure = (
            warm_grain_ratio >= 0.12
            and features["green_leaf_ratio"] >= 0.14
            and features["max_green_aspect"] >= 1.65
            and features["fruit_component_count"] >= 3
            and features["max_fruit_area_ratio"] < 0.22
            and features["banana_fruit_ratio"] < 0.34
            and features["dark_lesion_ratio"] < 0.095
            and features["rust_ratio"] < 0.035
            and not rust_spot_disease
            and not large_blight_patch
        )
        if grain_panicle_structure:
            return True

        warm_grain_signal = (
            (features["banana_fruit_ratio"] >= 0.045 and features["yellow_ratio"] >= 0.035)
            or warm_grain_ratio >= 0.11
            or (
                features["fruit_component_count"] >= 4
                and features["max_fruit_area_ratio"] < 0.08
                and features["banana_fruit_ratio"] >= 0.055
            )
        )
        grass_leaf_structure = (
            features["green_leaf_ratio"] >= 0.14
            and (
                features["max_green_aspect"] >= 1.45
                or features["green_component_count"] >= 3
                or (features["max_green_area_ratio"] >= 0.08 and features["green_edge_ratio"] >= 0.14)
            )
        )
        clustered_small_grains = (
            (
                features["fruit_component_count"] >= 3
                and features["max_fruit_area_ratio"] < 0.16
            )
            or (
                features["fruit_component_count"] >= 1
                and features["max_fruit_area_ratio"] < 0.24
                and features["green_component_count"] >= 4
                and features["max_green_aspect"] >= 2.0
            )
            or (
                features["green_leaf_ratio"] >= 0.28
                and features["yellow_ratio"] >= 0.08
                and features["max_green_aspect"] >= 1.8
            )
        )
        rice_canopy_with_grain = (
            features["green_leaf_ratio"] >= 0.42
            and warm_grain_ratio >= 0.045
            and (features["component_count"] >= 3 or features["max_component_aspect"] >= 1.6)
            and features["lesion_ratio"] < 0.16
        )
        rice_grain_canopy = (
            features["green_leaf_ratio"] >= 0.18
            and warm_grain_ratio >= 0.055
            and (
                features["fruit_component_count"] >= 2
                or features["yellow_ratio"] >= 0.05
                or features["banana_fruit_ratio"] >= 0.09
            )
            and features["max_fruit_area_ratio"] < 0.24
            and features["lesion_ratio"] < 0.18
            and features["dark_lesion_ratio"] < 0.13
            and (
                features["max_green_aspect"] >= 1.55
                or features["green_component_count"] >= 3
                or features["yellow_ratio"] >= 0.035
                or (
                    features["green_edge_ratio"] >= 0.18
                    and features["max_green_area_ratio"] < 0.50
                )
            )
        )
        clustered_small_grains = (clustered_small_grains or rice_canopy_with_grain or rice_grain_canopy) and features["banana_fruit_ratio"] < 0.42
        not_rot_like = (
            features["dark_lesion_ratio"] < 0.08
            and features["rust_ratio"] < 0.10
            and not (features["lesion_ratio"] >= 0.18 and features["max_component_area_ratio"] >= 0.14)
        )
        spotted_leaf_disease = (
            features["component_count"] >= 7
            and features["lesion_ratio"] >= 0.028
            and features["lesion_within_plant"] >= 0.045
            and not rice_grain_canopy
        )
        banana_bunch_like = (
            features["max_fruit_area_ratio"] >= 0.24
            and features["banana_fruit_ratio"] >= 0.22
            and features["green_leaf_ratio"] < 0.32
        )
        chewing_or_missing_tissue = (
            features["adjacent_nonleaf_ratio"] >= 0.18
            and features["green_edge_ratio"] >= 0.18
            and features["lesion_ratio"] < 0.055
            and warm_grain_ratio < 0.12
        )
        broad_single_leaf = (
            features["max_green_area_ratio"] >= 0.40
            and features["green_component_count"] <= 6
            and warm_grain_ratio < 0.13
            and features["yellow_ratio"] < 0.08
        )
        leaf_structure = grass_leaf_structure or rice_canopy_with_grain or rice_grain_canopy
        return (
            warm_grain_signal
            and leaf_structure
            and clustered_small_grains
            and not_rot_like
            and not spotted_leaf_disease
            and not rust_spot_disease
            and not banana_bunch_like
            and not chewing_or_missing_tissue
            and not broad_single_leaf
            and not mango_blight_like
        )

    def _rice_panicle_detection(self) -> DiseaseDetection:
        meta = self._metadata_for_key("rice_healthy")
        return DiseaseDetection(
            meta["name"],
            0.80,
            meta["cause"],
            meta["treatment"],
            crop_label="Rice",
            analysis_mode="rice panicle visual analysis",
        )

    def _looks_like_healthy_banana_bunch(self, features: dict[str, float]) -> bool:
        if self._looks_like_healthy_rice_panicle(features):
            return False
        if self._looks_like_mango_leaf(features) and (
            features["center_tan_ratio"] >= 0.08
            or features["lesion_ratio"] >= 0.028
            or features["green_edge_ratio"] >= 0.16
        ):
            return False

        clean_green_banana_bunch = (
            features["green_leaf_ratio"] >= 0.55
            and features["green_component_count"] >= 4
            and features["max_green_area_ratio"] >= 0.35
            and features["max_green_aspect"] >= 2.0
            and features["max_green_aspect"] <= 6.8
            and features["banana_fruit_ratio"] >= 0.06
            and features["fruit_component_count"] >= 3
            and features["lesion_ratio"] < 0.16
            and features["dark_lesion_ratio"] < 0.15
            and features["rust_ratio"] < 0.015
            and features["max_component_area_ratio"] < 0.04
        )
        if clean_green_banana_bunch:
            return True

        green_banana_finger_cluster = (
            features["green_leaf_ratio"] >= 0.42
            and features["green_component_count"] >= 4
            and features["max_green_area_ratio"] < 0.56
            and features["max_green_aspect"] >= 1.20
            and features["max_green_aspect"] <= 6.80
            and features["lesion_ratio"] < 0.18
            and features["dark_lesion_ratio"] < 0.12
            and features["rust_ratio"] < 0.08
            and features["max_component_area_ratio"] < 0.13
            and not (
                features["component_count"] >= 12
                and features["rust_ratio"] >= 0.025
                and features["lesion_ratio"] >= 0.07
            )
        )
        clean_fruit_surface = (
            features["lesion_ratio"] < 0.10
            and features["dark_lesion_ratio"] < 0.06
            and features["rust_ratio"] < 0.07
            and features["max_component_area_ratio"] < 0.09
        )
        spotted_leaf_disease = (
            features["component_count"] >= 7
            and features["dark_lesion_ratio"] >= 0.045
            and features["lesion_within_plant"] >= 0.05
            and features["yellow_ratio"] < 0.035
        )
        clustered_fingers = (
            features["green_component_count"] >= 5
            and features["max_green_area_ratio"] < 0.42
            and features["max_green_aspect"] >= 1.25
            and features["max_green_aspect"] <= 5.8
        )
        dense_green_bunch = (
            features["green_leaf_ratio"] >= 0.50
            and features["max_green_area_ratio"] >= 0.32
            and features["max_green_area_ratio"] < 0.62
            and features["max_green_aspect"] <= 2.4
            and (features["green_component_count"] >= 4 or features["fruit_component_count"] >= 2)
            and features["contrast"] < 68
        )
        fruit_tone_signal = (
            features["banana_fruit_ratio"] >= 0.025
            or features["yellow_ratio"] >= 0.025
            or features["green_leaf_ratio"] >= 0.55
        )
        not_grass_leaf = not (
            features["max_green_aspect"] >= 6.0
            and features["green_component_count"] <= 3
            and features["max_green_area_ratio"] < 0.28
        )
        return (
            fruit_tone_signal
            and (clean_fruit_surface or green_banana_finger_cluster)
            and (clustered_fingers or dense_green_bunch or green_banana_finger_cluster)
            and not spotted_leaf_disease
            and not_grass_leaf
        )

    def _banana_bunch_detection(self) -> DiseaseDetection:
        meta = self._metadata_for_key("banana_healthy")
        return DiseaseDetection(
            meta["name"],
            0.82,
            meta["cause"],
            meta["treatment"],
            crop_label="Banana",
            analysis_mode="banana bunch visual analysis",
        )

    def _looks_like_corn_ear_issue(self, features: dict[str, float], crop_key: str | None) -> bool:
        if crop_key not in {None, "corn", "banana"}:
            return False
        return self._looks_like_corn_ear_morphology(features)

    def _contextual_detection(
        self,
        features: dict[str, float],
        *,
        crop_type: str | None,
        original_filename: str | None,
        allow_online_lookup: bool,
    ) -> DiseaseDetection | None:
        visual_signal = (
            features["green_leaf_ratio"] >= 0.04
            or features["lesion_ratio"] >= 0.018
            or features["banana_fruit_ratio"] >= 0.08
            or features["yellow_ratio"] >= 0.04
        )
        if not visual_signal:
            return None

        hint_crop, hint_key, hint_confidence = self._filename_context(original_filename, crop_type)
        rice_allowed = hint_crop in {None, "rice"}
        banana_allowed = hint_crop in {None, "banana"}
        mango_allowed = hint_crop in {None, "mango"}
        if mango_allowed and self._looks_like_mango_leaf(features):
            key, confidence = self._offline_key_from_features(features, "mango")
            return self._make_detection(
                key,
                max(confidence, 0.78),
                crop_type="mango",
                analysis_mode="mango leaf visual analysis",
                allow_online_lookup=allow_online_lookup,
            )
        if rice_allowed and self._looks_like_healthy_rice_panicle(features):
            return self._rice_panicle_detection()
        if banana_allowed and self._looks_like_healthy_banana_bunch(features):
            return self._banana_bunch_detection()
        if hint_key:
            detection = self._make_detection(
                hint_key,
                hint_confidence,
                crop_type=hint_crop or crop_type,
                analysis_mode="filename-guided visual analysis",
                allow_online_lookup=allow_online_lookup,
            )
            review = self._review_if_uncertain(
                detection,
                features,
                hint_crop or crop_type,
                predicted_key=hint_key,
                analysis_mode="filename-guided visual review",
            )
            return review or detection
        if self._looks_like_corn_ear_issue(features, hint_crop):
            return self._make_detection(
                "corn_ear_pest_damage",
                0.82,
                crop_type="corn",
                analysis_mode="crop-part visual fallback",
                allow_online_lookup=allow_online_lookup,
            )
        if self._looks_like_banana_fruit_issue(features, hint_crop):
            key = "banana_crown_rot" if features["green_component_count"] >= 8 else "banana_fruit_rot"
            return self._make_detection(
                key,
                0.74,
                crop_type="banana",
                analysis_mode="fruit-aware visual fallback",
                allow_online_lookup=allow_online_lookup,
            )
        return None

    def _looks_like_mango_leaf(self, features: dict[str, float]) -> bool:
        broad_lanceolate_leaf = (
            features["green_leaf_ratio"] >= 0.32
            and features["max_green_area_ratio"] >= 0.24
            and features["max_green_aspect"] >= 2.6
            and features["max_green_aspect"] <= 7.5
        )
        dominant_broad_leaf = (
            features["green_leaf_ratio"] >= 0.40
            and features["max_green_area_ratio"] >= 0.30
            and features["green_component_count"] <= 6
            and features["max_fruit_area_ratio"] < 0.08
        )
        broad_blighted_leaf = (
            dominant_broad_leaf
            and features["max_green_aspect"] >= 1.70
            and features["center_green_ratio"] >= 0.28
            and (
                features["center_tan_ratio"] >= 0.08
                or features["green_edge_ratio"] >= 0.16
                or features["lesion_within_plant"] >= 0.045
            )
        )
        spotted_or_blighted = (
            features["component_count"] >= 4
            or features["lesion_ratio"] >= 0.025
            or features["dark_lesion_ratio"] >= 0.018
            or features["center_tan_ratio"] >= 0.08
        )
        not_fruit_cluster = (
            (features["banana_fruit_ratio"] < 0.12 and features["yellow_ratio"] < 0.11)
            or (
                dominant_broad_leaf
                and features["max_fruit_area_ratio"] < 0.06
                and features["center_fruit_ratio"] < 0.20
                and features["fruit_component_count"] <= 16
            )
        )
        not_rice_panicle = not (
            features["max_fruit_area_ratio"] >= 0.10
            and features["banana_fruit_ratio"] >= 0.22
            and features["yellow_ratio"] >= 0.16
        )
        return (broad_lanceolate_leaf or broad_blighted_leaf) and spotted_or_blighted and not_fruit_cluster and not_rice_panicle

    def _infer_crop_key_from_features(self, features: dict[str, float]) -> str | None:
        if self._looks_like_red_purple_bulb(features, None):
            return "onion"

        if features["green_leaf_ratio"] < 0.08 and features["lesion_ratio"] < 0.018:
            return None

        if self._looks_like_mango_leaf(features):
            return "mango"

        if self._looks_like_healthy_rice_panicle(features):
            return "rice"

        if self._looks_like_healthy_banana_bunch(features):
            return "banana"

        if self._looks_like_corn_ear_issue(features, None):
            return "corn"

        banana_fruit_like = (
            features["banana_fruit_ratio"] >= 0.18
            and features["dark_lesion_ratio"] >= 0.04
            and features["lesion_ratio"] >= 0.06
            and (
                features["green_leaf_ratio"] < 0.55
                or features["green_component_count"] >= 6
                or features["max_fruit_area_ratio"] >= 0.18
            )
        ) or (
            features["green_component_count"] >= 8
            and features["max_green_aspect"] >= 2.0
            and features["dark_lesion_ratio"] >= 0.08
            and features["yellow_ratio"] >= 0.04
        )
        if banana_fruit_like:
            return "banana"

        many_small_spots = features["component_count"] >= 7 and features["max_component_area_ratio"] < 0.012
        broad_spotted_leaf = (
            features["green_leaf_ratio"] >= 0.52
            and features["component_count"] >= 10
            and features["max_component_area_ratio"] < 0.055
            and features["max_green_aspect"] < 1.9
        )
        if self._looks_like_mango_leaf(features):
            return "mango"
        if broad_spotted_leaf:
            return "tomato"
        if many_small_spots and features["green_leaf_ratio"] < 0.55:
            return "tomato"
        if features["green_leaf_ratio"] < 0.18 and features["lesion_ratio"] >= 0.05:
            return "rice"

        cabbage_head_like = (
            features["green_leaf_ratio"] >= 0.45
            and features["center_green_ratio"] >= 0.55
            and features["max_green_area_ratio"] >= 0.42
            and features["lesion_ratio"] < 0.025
            and features["banana_fruit_ratio"] < 0.05
            and features["center_tan_ratio"] < 0.08
            and 0.08 <= features["center_neutral_ratio"] <= 0.34
            and features["max_green_aspect"] < 3.2
        )
        if cabbage_head_like:
            return "cabbage"

        dense_leafy_vegetable = (
            features["green_leaf_ratio"] >= 0.25
            and features["center_green_ratio"] >= 0.55
            and features["max_green_area_ratio"] >= 0.25
            and features["lesion_ratio"] < 0.025
            and features["banana_fruit_ratio"] < 0.05
            and features["center_tan_ratio"] < 0.08
            and features["center_neutral_ratio"] < 0.08
            and features["max_green_aspect"] < 1.8
        )
        if dense_leafy_vegetable:
            return "pechay"

        grass_like_leaf = features["max_green_aspect"] >= 2.3 or (
            features["green_component_count"] >= 3
            and features["max_green_aspect"] >= 1.9
            and features["max_green_area_ratio"] < 0.18
        )

        if grass_like_leaf:
            if features["green_leaf_ratio"] >= 0.18 or features["max_green_area_ratio"] >= 0.08:
                return "corn"
            return "rice"
        if (
            features["yellow_ratio"] >= 0.20
            and features["lesion_ratio"] >= 0.08
            and features["green_leaf_ratio"] >= 0.30
            and features["max_green_aspect"] < 1.8
            and features["rust_ratio"] < 0.03
            and features["component_count"] < 12
        ):
            return "banana"
        if features["dark_lesion_ratio"] >= 0.04 and features["green_leaf_ratio"] < 0.55:
            return "tomato"
        if features["green_leaf_ratio"] >= 0.20 and features["max_green_aspect"] >= 2.0:
            return "corn"
        if features["yellow_ratio"] >= 0.10:
            return "rice"
        return None

    def _offline_key_from_features(self, features: dict[str, float], crop_key: str | None) -> tuple[str, float]:
        if crop_key in {None, "onion"} and self._looks_like_red_purple_bulb(features, crop_key):
            return "onion_healthy", 0.78

        if crop_key is None and self._looks_like_mango_leaf(features):
            crop_key = "mango"

        if crop_key in {None, "rice"} and self._looks_like_healthy_rice_panicle(features):
            return "rice_healthy", 0.80

        if crop_key in {None, "banana"} and self._looks_like_healthy_banana_bunch(features):
            return "banana_healthy", 0.82

        if self._looks_like_corn_ear_issue(features, crop_key):
            return "corn_ear_pest_damage", 0.82
        if self._looks_like_banana_fruit_issue(features, crop_key):
            key = "banana_crown_rot" if features["green_component_count"] >= 8 else "banana_fruit_rot"
            return key, self._confidence_from_features(features, crop_key, matched_pattern=True)

        healthy_leaf = (
            features["green_leaf_ratio"] >= 0.26
            and features["lesion_within_plant"] < 0.035
            and features["lesion_ratio"] < 0.025
            and features["contrast"] < 72
        )
        healthy_leafy_vegetable = (
            crop_key in {"pechay", "cabbage", "gabi_taro"}
            and features["green_leaf_ratio"] >= 0.25
            and features["center_green_ratio"] >= 0.45
            and features["lesion_within_plant"] < 0.035
            and features["lesion_ratio"] < 0.025
            and features["center_tan_ratio"] < 0.08
            and (
                features["center_neutral_ratio"] < 0.12
                or (crop_key == "cabbage" and features["center_neutral_ratio"] <= 0.34)
            )
            and features["contrast"] < 78
        )
        if healthy_leaf or healthy_leafy_vegetable:
            return self._healthy_key_for_crop(crop_key), 0.76 if crop_key else 0.68

        structural_damage = (
            features["green_leaf_ratio"] >= 0.14
            and features["lesion_within_plant"] < 0.045
            and features["lesion_ratio"] < 0.045
            and features["adjacent_nonleaf_ratio"] >= 0.08
            and (
                features["green_edge_ratio"] >= 0.18
                or (features["adjacent_nonleaf_ratio"] >= 0.18 and features["contrast"] >= 55)
            )
        )
        high_edge_damage = (
            features["green_leaf_ratio"] >= 0.12
            and features["lesion_ratio"] < 0.035
            and features["contrast"] >= 62
            and features["green_edge_ratio"] >= 0.24
        )
        if structural_damage or high_edge_damage:
            if crop_key == "rice":
                key = "rice_leaf_folder"
            elif crop_key == "banana":
                key = "banana_insect_pest"
            elif crop_key == "mango":
                key = "mango_cutting_weevil"
            else:
                key = "pest_leaf_damage"
            return key, self._confidence_from_features(features, crop_key, matched_pattern=True)

        if not self._has_strong_visual_disease_signal(features, crop_key):
            return "review_needed", 0.52

        elongated = features["max_component_aspect"] >= 1.8 and features["max_component_area_ratio"] >= 0.006
        many_spots = features["component_count"] >= 7 and features["max_component_area_ratio"] < 0.025
        high_lesion = features["lesion_within_plant"] >= 0.08 or features["lesion_ratio"] >= 0.055
        yellowing = features["yellow_ratio"] >= 0.12 and features["lesion_ratio"] < 0.05
        edge_blight = features["edge_lesion_ratio"] >= 0.08

        if crop_key == "rice":
            if features["max_component_area_ratio"] >= 0.06 or features["dark_lesion_ratio"] >= 0.08:
                key = "rice_blast"
            elif yellowing:
                key = "rice_tungro_virus"
            elif edge_blight:
                key = "rice_bacterial_leaf_blight"
            elif elongated:
                key = "rice_bacterial_leaf_blight"
            elif many_spots:
                key = "rice_brown_spot"
            else:
                key = "rice_blast" if high_lesion else "rice_brown_spot"
            return key, self._confidence_from_features(features, crop_key, matched_pattern=elongated or many_spots or edge_blight)

        if crop_key == "corn":
            if features["rust_ratio"] >= 0.035 and many_spots:
                key = "corn_common_rust"
            elif many_spots and not elongated:
                key = "corn_gray_leaf_spot"
            else:
                key = "corn_northern_leaf_blight"
            return key, self._confidence_from_features(features, crop_key, matched_pattern=elongated or many_spots)

        if crop_key == "tomato":
            if features["dark_lesion_ratio"] >= 0.055 or features["lesion_ratio"] >= 0.09:
                key = "tomato_late_blight"
            elif many_spots and features["max_component_area_ratio"] < 0.012:
                key = "tomato_septoria_leaf_spot"
            elif many_spots and features["yellow_ratio"] >= 0.08:
                key = "tomato_early_blight"
            elif many_spots:
                key = "tomato_bacterial_spot"
            else:
                key = "tomato_early_blight"
            return key, self._confidence_from_features(features, crop_key, matched_pattern=many_spots or high_lesion)

        if crop_key == "pepper":
            key = "pepper_bacterial_spot"
            return key, self._confidence_from_features(features, crop_key, matched_pattern=many_spots or high_lesion)

        if crop_key == "potato":
            key = "potato_late_blight" if features["dark_lesion_ratio"] >= 0.05 or features["lesion_ratio"] >= 0.085 else "potato_early_blight"
            return key, self._confidence_from_features(features, crop_key, matched_pattern=high_lesion)

        if crop_key == "banana":
            if elongated and features["yellow_ratio"] >= 0.06:
                key = "banana_yellow_sigatoka"
            elif features["contrast"] > 78 and features["green_leaf_ratio"] < 0.22:
                key = "banana_insect_pest"
            else:
                key = "banana_black_sigatoka"
            return key, self._confidence_from_features(features, crop_key, matched_pattern=elongated or high_lesion)

        if crop_key == "mango":
            large_blight_patch = (
                features["max_component_area_ratio"] >= 0.035
                or features["dark_lesion_ratio"] >= 0.055
                or features["lesion_ratio"] >= 0.12
                or (features["edge_lesion_ratio"] >= 0.14 and features["lesion_ratio"] >= 0.07)
                or (features["lesion_within_plant"] >= 0.10 and features["center_tan_ratio"] >= 0.10)
            )
            scorched_mango_leaf = (
                features["yellow_ratio"] >= 0.055
                and (features["dark_lesion_ratio"] >= 0.025 or features["center_tan_ratio"] >= 0.10)
            )
            if large_blight_patch and (scorched_mango_leaf or features["lesion_within_plant"] >= 0.11):
                key = "mango_phoma_blight"
            elif many_spots:
                key = "mango_bacterial_canker"
            elif features["yellow_ratio"] > 0.13 and features["lesion_ratio"] < 0.045:
                key = "mango_powdery_mildew"
            else:
                key = "mango_anthracnose"
            return key, self._confidence_from_features(features, crop_key, matched_pattern=many_spots or high_lesion or large_blight_patch)

        if crop_key == "guava":
            if features["rust_ratio"] >= 0.025:
                key = "guava_red_rust"
            elif features["dark_lesion_ratio"] >= 0.045:
                key = "guava_phytophthora"
            else:
                key = "guava_scab"
            return key, self._confidence_from_features(features, crop_key, matched_pattern=high_lesion or many_spots)

        if high_lesion:
            return "leaf_spot_or_blight", self._confidence_from_features(features, crop_key, matched_pattern=False)
        if features["contrast"] > 75:
            return "pest_leaf_damage", 0.64
        return "leaf_spot_or_blight", 0.60

    def _reference_seed_for_key(self, key: str) -> dict[str, str] | None:
        class_key = self._canonical_key_for_label(key)
        if class_key in ONLINE_DISEASE_REFERENCES:
            return ONLINE_DISEASE_REFERENCES[class_key]
        crop_key = self._crop_key_from_class_key(class_key)
        if crop_key and class_key.startswith(f"{crop_key}_"):
            return ONLINE_DISEASE_REFERENCES.get(class_key[len(crop_key) + 1 :])
        return None

    def _online_reference_for_key(self, key: str, crop_type: str | None) -> dict[str, str] | None:
        class_key = self._canonical_key_for_label(key)
        seed = self._reference_seed_for_key(key)
        if settings.force_offline_disease_detection or not settings.enable_online_disease_lookup:
            return None

        if seed is None:
            seed = {
                "title": "Crop disease reference",
                "url": "https://extension.umn.edu/vegetables/disease-management",
                "query": f"{crop_type or 'crop'} leaf disease pest symptoms management extension",
            }

        query = seed.get("query") or f"{crop_type or ''} {key} crop disease symptoms management".strip()
        if crop_type and class_key in {"healthy", "leaf_spot_or_blight", "pest_leaf_damage"}:
            query = f"{crop_type} {query}".strip()
        try:
            import httpx

            params = urlencode({"q": query, "format": "json", "no_html": 1, "skip_disambig": 1})
            response = httpx.get(
                f"https://api.duckduckgo.com/?{params}",
                timeout=float(settings.online_disease_lookup_timeout_seconds),
                headers={"User-Agent": "AgriScan crop disease fallback"},
            )
            response.raise_for_status()
            data = response.json()
            title = data.get("Heading") or seed.get("title")
            url = data.get("AbstractURL") or seed.get("url")
            if not url:
                for item in data.get("RelatedTopics", []):
                    if isinstance(item, dict) and item.get("FirstURL"):
                        url = item["FirstURL"]
                        title = item.get("Text", title)
                        break
            if url:
                return {"title": str(title or seed.get("title") or "Crop disease reference"), "url": str(url)}
        except Exception:
            logger.info("Online disease lookup unavailable; keeping offline fallback.", exc_info=True)
        return None

    def _with_online_reference(
        self,
        detection: DiseaseDetection,
        key: str,
        crop_type: str | None,
        *,
        allow_online_lookup: bool,
    ) -> DiseaseDetection:
        if not allow_online_lookup:
            return detection
        reference = self._online_reference_for_key(key, crop_type)
        if reference is None:
            return detection
        detection.reference_title = reference["title"]
        detection.reference_url = reference["url"]
        if "fallback" in detection.analysis_mode:
            detection.analysis_mode = "online reference fallback"
        return detection

    def _fallback_detect(
        self,
        image_path: str,
        crop_type: str | None = None,
        *,
        original_filename: str | None = None,
        allow_online_lookup: bool = True,
    ) -> DiseaseDetection:
        original_filename = None
        features = self._extract_leaf_features(image_path)
        normalized_crop = self._normalize_crop_type(crop_type)
        filename_unsupported_crop = self._unsupported_crop_label_from_filename(original_filename)

        if normalized_crop is None:
            strict_visual_memory = self._visual_memory_detection(
                features,
                crop_type=None,
                original_filename=None,
                allow_online_lookup=allow_online_lookup,
            )
            if strict_visual_memory is not None:
                return strict_visual_memory

        if not filename_unsupported_crop and self._looks_like_non_crop_foreground(features, normalized_crop):
            return self._invalid_crop_image_detection()

        visual_memory = self._visual_memory_detection(
            features,
            crop_type=crop_type,
            original_filename=original_filename,
            allow_online_lookup=allow_online_lookup,
        )
        if visual_memory is not None:
            return visual_memory

        feature_crop = self._infer_crop_key_from_features(features)
        possible_unsupported_crop = self._possible_unsupported_crop_label(
            features,
            original_filename=original_filename,
            crop_type=crop_type,
            supported_inferred_crop=feature_crop,
        )
        if possible_unsupported_crop:
            return self._possible_unsupported_crop_detection(
                features,
                possible_unsupported_crop,
                allow_online_lookup=allow_online_lookup,
            )

        contextual = self._contextual_detection(
            features,
            crop_type=crop_type,
            original_filename=original_filename,
            allow_online_lookup=allow_online_lookup,
        )
        if contextual is not None:
            return contextual

        if self._looks_like_background_green_scene(features, normalized_crop):
            return self._invalid_crop_image_detection()
        if self._looks_like_non_crop_foreground(features, normalized_crop):
            return self._invalid_crop_image_detection()
        filename_crop, _, _ = self._filename_context(original_filename, crop_type)
        reliable_feature_crop = (
            feature_crop
            if feature_crop and self._is_reliable_visual_crop_inference(features, feature_crop)
            else None
        )
        inferred_crop = normalized_crop or reliable_feature_crop or filename_crop or feature_crop
        key, confidence = self._offline_key_from_features(features, inferred_crop)
        feature_inferred_only = normalized_crop is None and filename_crop is None and inferred_crop is not None
        class_key = self._canonical_key_for_label(key)
        crop_specific_disease = self._crop_key_from_class_key(class_key) is not None and not class_key.endswith("_healthy")
        if feature_inferred_only and crop_specific_disease:
            key = "leaf_spot_or_blight"
            confidence = min(confidence, 0.64)

        meta = self._metadata_for_key(key)
        crop_hint = crop_type or inferred_crop
        crop_label = self._crop_label_from_key(key, crop_type=crop_hint) or "General crop leaf"
        if normalized_crop:
            analysis_mode = "offline crop-guided fallback"
        elif inferred_crop:
            analysis_mode = "offline crop-inferred fallback"
        else:
            analysis_mode = "offline visual fallback"
        detection = DiseaseDetection(
            meta["name"],
            confidence,
            meta["cause"],
            meta["treatment"],
            crop_label=crop_label,
            analysis_mode=analysis_mode,
        )
        if key == "review_needed":
            return detection
        return self._with_online_reference(detection, key, crop_hint, allow_online_lookup=allow_online_lookup)

    def detect(
        self,
        image_path: str,
        crop_type: str | None = None,
        *,
        original_filename: str | None = None,
        allow_online_lookup: bool = True,
    ) -> DiseaseDetection:
        original_filename = None
        if self._has_non_crop_filename_context(original_filename):
            return self._invalid_crop_image_detection()

        features = self._extract_leaf_features(image_path)
        quality_report = self._image_quality_report(image_path, features)

        def finalize(
            detection: DiseaseDetection,
            *,
            model_alternatives: list[dict[str, Any]] | None = None,
        ) -> DiseaseDetection:
            return self._enrich_detection(
                detection,
                features,
                crop_type,
                quality_report,
                model_alternatives=model_alternatives,
            )

        normalized_crop = self._normalize_crop_type(crop_type)
        if normalized_crop is None:
            strict_visual_memory = self._visual_memory_detection(
                features,
                crop_type=None,
                original_filename=None,
                allow_online_lookup=allow_online_lookup,
            )
            if strict_visual_memory is not None:
                return finalize(strict_visual_memory)

        filename_unsupported_crop = self._unsupported_crop_label_from_filename(original_filename)
        if (
            not filename_unsupported_crop
            and not self._has_crop_part_signal(features, normalized_crop)
            and self._is_obvious_non_crop_image(image_path)
        ):
            return finalize(self._invalid_crop_image_detection())

        if not filename_unsupported_crop and self._looks_like_non_crop_foreground(features, normalized_crop):
            return finalize(self._invalid_crop_image_detection())

        visual_memory = self._visual_memory_detection(
            features,
            crop_type=crop_type,
            original_filename=original_filename,
            allow_online_lookup=allow_online_lookup,
        )
        if visual_memory is not None:
            return finalize(visual_memory)

        feature_crop = self._infer_crop_key_from_features(features)
        possible_unsupported_crop = self._possible_unsupported_crop_label(
            features,
            original_filename=original_filename,
            crop_type=crop_type,
            supported_inferred_crop=feature_crop,
        )
        if possible_unsupported_crop:
            return finalize(
                self._possible_unsupported_crop_detection(
                    features,
                    possible_unsupported_crop,
                    allow_online_lookup=allow_online_lookup,
                )
            )

        contextual = self._contextual_detection(
            features,
            crop_type=crop_type,
            original_filename=original_filename,
            allow_online_lookup=allow_online_lookup,
        )
        if contextual is not None:
            return finalize(contextual)

        if (
            feature_crop
            and self._is_reliable_visual_crop_inference(features, feature_crop)
            and not self._has_trained_labels_for_crop(feature_crop)
        ):
            return finalize(
                self._fallback_detect(
                    image_path,
                    feature_crop,
                    original_filename=original_filename,
                    allow_online_lookup=allow_online_lookup,
                )
            )

        self._load_model()
        if self._model is None:
            return finalize(
                self._fallback_detect(
                    image_path,
                    crop_type,
                    original_filename=original_filename,
                    allow_online_lookup=allow_online_lookup,
                )
            )
        if normalized_crop and not self._has_trained_labels_for_crop(normalized_crop):
            return finalize(
                self._fallback_detect(
                    image_path,
                    crop_type,
                    original_filename=original_filename,
                    allow_online_lookup=allow_online_lookup,
                )
            )
        predicted_key = None
        model_alternatives: list[dict[str, Any]] | None = None
        if self._model_type == "ultralytics":
            detection = self._detect_with_ultralytics(image_path, crop_type)
        else:
            predictions = self._model.predict(self._preprocess(image_path), verbose=0)[0]
            index = self._select_index_for_crop(predictions, crop_type)
            key = self._labels[index] if index < len(self._labels) else "healthy"
            predicted_key = key
            meta = self._metadata_for_key(key)
            detection = DiseaseDetection(
                disease_name=meta["name"],
                confidence=float(predictions[index]),
                cause=meta["cause"],
                treatment=meta["treatment"],
                crop_label=self._infer_crop_label_from_scores(predictions, self._labels, predicted_key=key, crop_type=crop_type),
            )
            model_alternatives = self._prediction_alternatives(
                predictions,
                self._labels,
                selected_index=index,
                crop_type=crop_type,
                primary=detection,
            )

        if detection.disease_name == "Healthy crop" and self._has_strong_visual_disease_signal(features, normalized_crop):
            fallback = self._fallback_detect(
                image_path,
                crop_type,
                original_filename=original_filename,
                allow_online_lookup=allow_online_lookup,
            )
            if fallback.disease_name != "Healthy crop":
                return finalize(fallback)

        if crop_type is None and detection.disease_name in {"Pest-related leaf damage", "Leaf spot or blight symptoms", "Healthy crop"}:
            feature_crop = self._infer_crop_key_from_features(features)
            feature_crop_label = self._display_crop_label(feature_crop)
            if feature_crop_label:
                detection.crop_label = feature_crop_label

        if crop_type is not None and detection.confidence < 0.60:
            fallback = self._fallback_detect(
                image_path,
                crop_type,
                original_filename=original_filename,
                allow_online_lookup=allow_online_lookup,
            )
            if fallback.confidence >= detection.confidence:
                return finalize(fallback)

        if crop_type is None and (not detection.crop_label or detection.disease_name == "Healthy crop"):
            fallback = self._fallback_detect(
                image_path,
                crop_type,
                original_filename=original_filename,
                allow_online_lookup=allow_online_lookup,
            )
            fallback_has_more_detail = fallback.crop_label and fallback.crop_label != "General crop leaf"
            fallback_found_problem = fallback.disease_name != "Healthy crop"
            if fallback_found_problem or (fallback_has_more_detail and detection.confidence < 0.82):
                return finalize(fallback)

        if crop_type is None and detection.confidence < 0.58:
            fallback = self._fallback_detect(
                image_path,
                crop_type,
                original_filename=original_filename,
                allow_online_lookup=allow_online_lookup,
            )
            if fallback.confidence >= detection.confidence:
                return finalize(fallback)
            return finalize(
                DiseaseDetection(
                    disease_name="Low-confidence crop image",
                    confidence=detection.confidence,
                    cause="AgriScan could not confidently verify the crop or disease from this image alone.",
                    treatment="Retake a closer photo of one leaf under natural light and keep the crop leaf centered in the frame.",
                    crop_label=detection.crop_label or "General crop leaf",
                    analysis_mode="low-confidence ml",
                ),
                model_alternatives=model_alternatives,
            )

        if not detection.crop_label:
            detection.crop_label = "General crop leaf"
        review = self._review_if_uncertain(
            detection,
            features,
            crop_type,
            predicted_key=predicted_key,
            analysis_mode="ml visual review",
        )
        if review is not None:
            return finalize(review)
        return finalize(detection, model_alternatives=model_alternatives)

    def _detect_with_ultralytics(self, image_path: str, crop_type: str | None = None) -> DiseaseDetection:
        result = self._model(image_path, verbose=False)[0]
        key = "healthy"
        confidence = 0.0
        crop_label = self._crop_label_from_key(key, crop_type=crop_type)
        detections: list[dict[str, Any]] = []
        analysis_mode = "ultralytics yolo classification"

        if getattr(result, "probs", None) is not None:
            scores = result.probs.data.cpu().numpy()
            index = self._select_index_for_crop(scores, crop_type)
            confidence = float(scores[index])
            names = getattr(result, "names", {}) or {}
            key = str(names.get(index, self._labels[index] if index < len(self._labels) else "healthy"))
            crop_label = self._infer_crop_label_from_scores(scores, self._labels, predicted_key=key, crop_type=crop_type)
        elif getattr(result, "boxes", None) is not None and len(result.boxes) > 0:
            analysis_mode = "ultralytics yolo detection"
            boxes = result.boxes
            class_ids = boxes.cls.cpu().numpy()
            scores = boxes.conf.cpu().numpy()
            xyxy_boxes = boxes.xyxy.cpu().numpy()
            image_height, image_width = result.orig_shape[:2]
            top_index = self._select_box_index_for_crop(class_ids, scores, result.names, crop_type)
            class_id = int(boxes.cls[top_index].item())
            confidence = float(boxes.conf[top_index].item())
            key = str(result.names.get(class_id, "healthy"))
            crop_label = self._infer_crop_label_from_boxes(
                class_ids,
                scores,
                result.names,
                predicted_key=key,
                crop_type=crop_type,
            )
            for index, (class_id_value, score, xyxy) in enumerate(zip(class_ids, scores, xyxy_boxes, strict=False)):
                raw_label = str(result.names.get(int(class_id_value), "healthy"))
                meta = self._metadata_for_key(raw_label)
                x1, y1, x2, y2 = [float(value) for value in xyxy]
                width = max(float(image_width), 1.0)
                height = max(float(image_height), 1.0)
                detections.append(
                    {
                        "label": meta["name"],
                        "raw_label": raw_label,
                        "confidence": round(float(score), 4),
                        "box": {
                            "x": round(max(0.0, min(1.0, x1 / width)), 4),
                            "y": round(max(0.0, min(1.0, y1 / height)), 4),
                            "width": round(max(0.0, min(1.0, (x2 - x1) / width)), 4),
                            "height": round(max(0.0, min(1.0, (y2 - y1) / height)), 4),
                        },
                        "selected": index == int(top_index),
                    }
                )
            detections.sort(key=lambda item: float(item["confidence"]), reverse=True)

        meta = self._metadata_for_key(key)
        return DiseaseDetection(
            meta["name"],
            confidence,
            meta["cause"],
            meta["treatment"],
            crop_label=crop_label,
            analysis_mode=analysis_mode,
            detections=detections[:12],
        )

    def _select_index_for_crop(self, scores: np.ndarray, crop_type: str | None) -> int:
        normalized_crop = self._normalize_crop_type(crop_type)
        if normalized_crop:
            compatible_indices = [
                index
                for index, label in enumerate(self._labels)
                if self._is_class_compatible_with_crop(self._canonical_key_for_label(label), normalized_crop)
            ]
            if compatible_indices:
                best_index = max(compatible_indices, key=lambda index: float(scores[index]))
                return int(best_index)
        return int(np.argmax(scores))

    def _select_box_index_for_crop(self, class_ids: np.ndarray, scores: np.ndarray, names: dict, crop_type: str | None) -> int:
        normalized_crop = self._normalize_crop_type(crop_type)
        if normalized_crop:
            compatible_indices = []
            for index, class_id in enumerate(class_ids):
                label = str(names.get(int(class_id), "healthy"))
                if self._is_class_compatible_with_crop(self._canonical_key_for_label(label), normalized_crop):
                    compatible_indices.append(index)
            if compatible_indices:
                best_index = max(compatible_indices, key=lambda index: float(scores[index]))
                return int(best_index)
        return int(np.argmax(scores))

    def _normalize_crop_type(self, crop_type: str | None) -> str | None:
        if not crop_type:
            return None
        normalized = crop_type.strip().lower().replace("_", " ").replace("-", " ")
        if not normalized:
            return None
        if any(re.search(rf"\b{re.escape(term)}\b", normalized) for term in UNSUPPORTED_CROP_NAME_GUARDS):
            return None
        if normalized in CROP_ALIASES:
            return CROP_ALIASES[normalized]
        for alias, canonical in CROP_ALIASES.items():
            if alias in normalized:
                return canonical
        return None

    def _display_crop_label(self, crop_key: str | None) -> str | None:
        if not crop_key:
            return None
        return CROP_DISPLAY_NAMES.get(crop_key, crop_key.replace("_", " ").title())

    def _crop_key_from_class_key(self, class_key: str | None) -> str | None:
        if not class_key:
            return None
        if class_key in LEGACY_CLASS_TO_CROP:
            return LEGACY_CLASS_TO_CROP[class_key]
        for crop_key in CROP_DISPLAY_NAMES:
            if class_key == crop_key or class_key.startswith(f"{crop_key}_"):
                return crop_key
        return None

    def _crop_label_from_key(self, key: str, crop_type: str | None = None) -> str | None:
        normalized_crop = self._normalize_crop_type(crop_type)
        if normalized_crop:
            return self._display_crop_label(normalized_crop)

        class_key = self._canonical_key_for_label(key)
        crop_key = self._crop_key_from_class_key(class_key)
        return self._display_crop_label(crop_key)

    def _infer_crop_label_from_scores(
        self,
        scores: np.ndarray,
        labels: list[str],
        *,
        predicted_key: str,
        crop_type: str | None = None,
    ) -> str | None:
        direct_label = self._crop_label_from_key(predicted_key, crop_type=crop_type)
        if direct_label:
            return direct_label

        crop_scores: dict[str, float] = {}
        for index, label in enumerate(labels):
            class_key = self._canonical_key_for_label(label)
            crop_key = self._crop_key_from_class_key(class_key)
            if crop_key is None:
                continue
            crop_scores[crop_key] = max(crop_scores.get(crop_key, 0.0), float(scores[index]))

        if not crop_scores:
            return None

        best_crop = max(crop_scores, key=crop_scores.get)
        return self._display_crop_label(best_crop)

    def _infer_crop_label_from_boxes(
        self,
        class_ids: np.ndarray,
        scores: np.ndarray,
        names: dict,
        *,
        predicted_key: str,
        crop_type: str | None = None,
    ) -> str | None:
        direct_label = self._crop_label_from_key(predicted_key, crop_type=crop_type)
        if direct_label:
            return direct_label

        crop_scores: dict[str, float] = {}
        for index, class_id in enumerate(class_ids):
            label = str(names.get(int(class_id), "healthy"))
            class_key = self._canonical_key_for_label(label)
            crop_key = self._crop_key_from_class_key(class_key)
            if crop_key is None:
                continue
            crop_scores[crop_key] = max(crop_scores.get(crop_key, 0.0), float(scores[index]))

        if not crop_scores:
            return None

        best_crop = max(crop_scores, key=crop_scores.get)
        return self._display_crop_label(best_crop)

    def _canonical_key_for_label(self, key: str) -> str:
        normalized = key.lower().replace(" ", "_").replace("-", "_")
        return CLASS_ALIASES.get(normalized, normalized)

    def _is_class_compatible_with_crop(self, class_key: str, crop_key: str) -> bool:
        detected_crop = self._crop_key_from_class_key(class_key)
        return detected_crop == crop_key or class_key in {"healthy", "pest_leaf_damage"}

    def _title_case_tokens(self, value: str) -> str:
        return " ".join(token.upper() if token in {"ipm"} else token.capitalize() for token in value.split("_"))

    def _metadata_for_key(self, key: str) -> dict[str, str]:
        class_key = self._canonical_key_for_label(key)
        if class_key in CLASS_METADATA:
            return CLASS_METADATA[class_key]

        crop_key = self._crop_key_from_class_key(class_key)
        if class_key == "healthy" or class_key.endswith("_healthy"):
            return DISEASE_PROFILES["healthy"]

        condition_key = class_key
        if crop_key and class_key.startswith(f"{crop_key}_"):
            condition_key = class_key[len(crop_key) + 1 :]
        elif class_key in LEGACY_CLASS_TO_CROP and LEGACY_CLASS_TO_CROP[class_key]:
            condition_key = class_key[len(LEGACY_CLASS_TO_CROP[class_key]) + 1 :]

        if condition_key in DISEASE_PROFILES:
            profile = DISEASE_PROFILES[condition_key]
            display_crop = self._display_crop_label(crop_key)
            if display_crop and profile["name"] != "Healthy crop":
                return {
                    "name": f"{display_crop} {profile['name'].lower()}",
                    "cause": profile["cause"],
                    "treatment": profile["treatment"],
                }
            return profile

        return {
            "name": self._title_case_tokens(class_key),
            "cause": "The trained model detected this crop condition from visual leaf patterns.",
            "treatment": "Confirm with an agriculture officer and follow local integrated pest and disease management guidance.",
        }


detector = CropDiseaseDetector()


def manual_entry_diagnosis(
    crop_type: str | None,
    affected_part: str | None,
    symptoms: str | None,
    severity: str | None,
    field_notes: str | None,
) -> DiseaseDetection:
    crop = (crop_type or "").lower()
    normalized_crop = detector._normalize_crop_type(crop_type)
    observed_text = " ".join(
        value.lower()
        for value in [crop_type, affected_part, symptoms, severity, field_notes]
        if value
    )

    if any(term in observed_text for term in ["hole", "chew", "insect", "worm", "larvae", "mites", "thrips", "hopper", "pest"]):
        key = "pest_leaf_damage"
        confidence = 0.68
    elif normalized_crop == "rice" and any(term in observed_text for term in ["water-soaked", "water soaked", "yellow", "wilt", "blight", "lesion"]):
        key = "rice_bacterial_leaf_blight"
        confidence = 0.66
    elif normalized_crop == "corn" and any(term in observed_text for term in ["long", "tan", "gray", "grey", "streak", "blight", "spot"]):
        key = "corn_northern_leaf_blight"
        confidence = 0.64
    elif normalized_crop == "tomato" and any(term in observed_text for term in ["late blight", "dark", "brown", "wet", "mold", "rot"]):
        key = "tomato_late_blight"
        confidence = 0.65
    elif any(term in observed_text for term in ["healthy", "normal", "green", "no symptom", "no issue"]):
        key = "healthy"
        confidence = 0.62
    else:
        return DiseaseDetection(
            disease_name="Manual field review needed",
            confidence=0.52,
            cause="The typed observations do not strongly match one known disease pattern.",
            treatment="Add a clear leaf photo or ask an agriculture officer to confirm the symptoms before applying treatment.",
            crop_label=detector._display_crop_label(normalized_crop),
            analysis_mode="manual entry",
        )

    if severity in {"high", "severe"}:
        confidence += 0.04
    elif severity in {"low", "mild"}:
        confidence -= 0.03

    meta = detector._metadata_for_key(key)
    crop_label = detector._crop_label_from_key(key, crop_type=normalized_crop or crop)
    return DiseaseDetection(
        meta["name"],
        min(max(confidence, 0.45), 0.78),
        meta["cause"],
        meta["treatment"],
        crop_label=crop_label,
        analysis_mode="manual entry",
    )
