import logging
import json
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlencode

import numpy as np
from PIL import Image

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


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

    def _preprocess(self, image_path: str) -> np.ndarray:
        image = Image.open(image_path).convert("RGB").resize((224, 224))
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
        disease_tone_pixels = (
            (red > 0.32)
            & (green > 0.18)
            & (blue < red * 0.9)
            & (saturation > 0.12)
            & ((green > blue * 1.08) | (green > 0.35))
        )
        plant_pixels = green_leaf_pixels | disease_tone_pixels

        green_dominant_ratio = float(np.mean(green_leaf_pixels))
        warm_plant_ratio = float(np.mean(disease_tone_pixels))
        overall_signal = max(green_dominant_ratio, warm_plant_ratio)
        nonwhite_mask = (red < 0.95) | (green < 0.95) | (blue < 0.95)
        nonwhite_ratio = float(np.mean(nonwhite_mask))
        plant_within_nonwhite = float(np.mean(plant_pixels[nonwhite_mask])) if np.any(nonwhite_mask) else 0.0

        height, width = green.shape
        center_mask = np.zeros(green.shape, dtype=bool)
        center_mask[height // 4 : 3 * height // 4, width // 4 : 3 * width // 4] = True
        center_green_ratio = float(np.mean(green_leaf_pixels[center_mask]))
        center_plant_ratio = float(np.mean(plant_pixels[center_mask]))

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
        center_tan_subject_ratio = float(np.mean(tan_subject_pixels[center_mask]))

        centered_non_leaf_subject = (
            center_green_ratio < 0.08
            and green_dominant_ratio < 0.38
            and center_plant_ratio < 0.65
            and (center_tan_subject_ratio > 0.20 or neutral_subject_ratio > 0.34)
        )
        has_crop_signal = (
            nonwhite_ratio >= 0.05
            and plant_within_nonwhite >= 0.35
            and (overall_signal >= 0.12 or center_green_ratio >= 0.12 or center_plant_ratio >= 0.35)
        )

        return centered_non_leaf_subject or not has_crop_signal

    def _extract_leaf_features(self, image_path: str) -> dict[str, float]:
        image = Image.open(image_path).convert("RGB").resize((160, 160))
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
        lesion_ratio = float(np.mean(lesion_pixels))
        lesion_within_plant = float(np.sum(lesion_pixels) / max(int(np.sum(plant_pixels)), 1))
        edge_mask = np.zeros(lesion_pixels.shape, dtype=bool)
        edge_width = max(8, lesion_pixels.shape[0] // 12)
        edge_mask[:edge_width, :] = True
        edge_mask[-edge_width:, :] = True
        edge_mask[:, :edge_width] = True
        edge_mask[:, -edge_width:] = True

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
            "fruit_component_count": float(fruit_component_count),
            "max_fruit_area_ratio": max_fruit_area_ratio,
            "max_fruit_aspect": max_fruit_aspect,
        }

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
        elif "northern leaf blight" in text or (crop_key == "corn" and "blight" in text):
            key = "corn_northern_leaf_blight"
            crop_key = "corn"
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

    def _looks_like_banana_fruit_issue(self, features: dict[str, float], crop_key: str | None) -> bool:
        if crop_key != "banana":
            return False
        fruit_signal = (
            features["banana_fruit_ratio"] >= 0.10
            or features["yellow_ratio"] >= 0.045
            or (features["green_component_count"] >= 8 and features["max_green_aspect"] >= 2.0)
        )
        decay_signal = features["dark_lesion_ratio"] >= 0.045 or features["lesion_ratio"] >= 0.08
        not_leaf_dominant = (
            features["green_leaf_ratio"] < 0.38
            or features["fruit_component_count"] >= 2
            or features["green_component_count"] >= 8
        )
        return fruit_signal and decay_signal and not_leaf_dominant

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
        if hint_key:
            return self._make_detection(
                hint_key,
                hint_confidence,
                crop_type=hint_crop or crop_type,
                analysis_mode="filename-guided visual analysis",
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

    def _infer_crop_key_from_features(self, features: dict[str, float]) -> str | None:
        if features["green_leaf_ratio"] < 0.08 and features["lesion_ratio"] < 0.018:
            return None

        banana_fruit_like = (
            features["banana_fruit_ratio"] >= 0.18
            and features["dark_lesion_ratio"] >= 0.04
            and features["lesion_ratio"] >= 0.06
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
        if broad_spotted_leaf:
            return "tomato"
        if many_small_spots and features["green_leaf_ratio"] < 0.55:
            return "tomato"
        if features["green_leaf_ratio"] < 0.18 and features["lesion_ratio"] >= 0.05:
            return "rice"

        grass_like_leaf = features["max_green_aspect"] >= 2.3 or (
            features["green_component_count"] >= 3
            and features["max_green_aspect"] >= 1.9
            and features["max_green_area_ratio"] < 0.18
        )

        if grass_like_leaf:
            if features["green_leaf_ratio"] >= 0.18 or features["max_green_area_ratio"] >= 0.08:
                return "corn"
            return "rice"
        if features["yellow_ratio"] >= 0.20 and features["lesion_ratio"] >= 0.08 and features["green_leaf_ratio"] >= 0.30:
            return "banana"
        if features["dark_lesion_ratio"] >= 0.04 and features["green_leaf_ratio"] < 0.55:
            return "tomato"
        if features["green_leaf_ratio"] >= 0.20 and features["max_green_aspect"] >= 2.0:
            return "corn"
        if features["yellow_ratio"] >= 0.10:
            return "rice"
        return None

    def _offline_key_from_features(self, features: dict[str, float], crop_key: str | None) -> tuple[str, float]:
        if self._looks_like_banana_fruit_issue(features, crop_key):
            key = "banana_crown_rot" if features["green_component_count"] >= 8 else "banana_fruit_rot"
            return key, self._confidence_from_features(features, crop_key, matched_pattern=True)

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

        healthy_leaf = (
            features["green_leaf_ratio"] >= 0.26
            and features["lesion_within_plant"] < 0.035
            and features["lesion_ratio"] < 0.025
            and features["contrast"] < 72
        )
        if healthy_leaf:
            return self._healthy_key_for_crop(crop_key), 0.76 if crop_key else 0.68

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
            if many_spots:
                key = "mango_bacterial_canker"
            elif features["yellow_ratio"] > 0.13 and features["lesion_ratio"] < 0.045:
                key = "mango_powdery_mildew"
            else:
                key = "mango_anthracnose"
            return key, self._confidence_from_features(features, crop_key, matched_pattern=many_spots or high_lesion)

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
        features = self._extract_leaf_features(image_path)
        contextual = self._contextual_detection(
            features,
            crop_type=crop_type,
            original_filename=original_filename,
            allow_online_lookup=allow_online_lookup,
        )
        if contextual is not None:
            return contextual

        normalized_crop = self._normalize_crop_type(crop_type)
        filename_crop, _, _ = self._filename_context(original_filename, crop_type)
        inferred_crop = normalized_crop or filename_crop or self._infer_crop_key_from_features(features)
        key, confidence = self._offline_key_from_features(features, inferred_crop)

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
        return self._with_online_reference(detection, key, crop_hint, allow_online_lookup=allow_online_lookup)

    def detect(
        self,
        image_path: str,
        crop_type: str | None = None,
        *,
        original_filename: str | None = None,
        allow_online_lookup: bool = True,
    ) -> DiseaseDetection:
        if self._has_non_crop_filename_context(original_filename):
            return self._invalid_crop_image_detection()

        features = self._extract_leaf_features(image_path)
        contextual = self._contextual_detection(
            features,
            crop_type=crop_type,
            original_filename=original_filename,
            allow_online_lookup=allow_online_lookup,
        )
        if contextual is not None:
            return contextual

        if crop_type:
            has_crop_signal = features["green_leaf_ratio"] >= 0.06 or features["lesion_ratio"] >= 0.018
            reject_image = not has_crop_signal and self._is_obvious_non_crop_image(image_path)
        else:
            reject_image = self._is_obvious_non_crop_image(image_path)

        if reject_image:
            return self._invalid_crop_image_detection()

        normalized_crop = self._normalize_crop_type(crop_type)
        self._load_model()
        if self._model is None:
            return self._fallback_detect(
                image_path,
                crop_type,
                original_filename=original_filename,
                allow_online_lookup=allow_online_lookup,
            )
        if normalized_crop and not self._has_trained_labels_for_crop(normalized_crop):
            return self._fallback_detect(
                image_path,
                crop_type,
                original_filename=original_filename,
                allow_online_lookup=allow_online_lookup,
            )
        if self._model_type == "ultralytics":
            detection = self._detect_with_ultralytics(image_path, crop_type)
        else:
            predictions = self._model.predict(self._preprocess(image_path), verbose=0)[0]
            index = self._select_index_for_crop(predictions, crop_type)
            key = self._labels[index] if index < len(self._labels) else "healthy"
            meta = self._metadata_for_key(key)
            detection = DiseaseDetection(
                disease_name=meta["name"],
                confidence=float(predictions[index]),
                cause=meta["cause"],
                treatment=meta["treatment"],
                crop_label=self._infer_crop_label_from_scores(predictions, self._labels, predicted_key=key, crop_type=crop_type),
            )

        if crop_type is not None and detection.confidence < 0.60:
            fallback = self._fallback_detect(
                image_path,
                crop_type,
                original_filename=original_filename,
                allow_online_lookup=allow_online_lookup,
            )
            if fallback.confidence >= detection.confidence:
                return fallback

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
                return fallback

        if crop_type is None and detection.confidence < 0.58:
            fallback = self._fallback_detect(
                image_path,
                crop_type,
                original_filename=original_filename,
                allow_online_lookup=allow_online_lookup,
            )
            if fallback.confidence >= detection.confidence:
                return fallback
            return DiseaseDetection(
                disease_name="Low-confidence crop image",
                confidence=detection.confidence,
                cause="AgriScan could not confidently verify the crop or disease from this image alone.",
                treatment="Retake a closer photo of one leaf under natural light and keep the crop leaf centered in the frame.",
                crop_label=detection.crop_label or "General crop leaf",
                analysis_mode="low-confidence ml",
            )

        if not detection.crop_label:
            detection.crop_label = "General crop leaf"
        return detection

    def _detect_with_ultralytics(self, image_path: str, crop_type: str | None = None) -> DiseaseDetection:
        result = self._model(image_path, verbose=False)[0]
        key = "healthy"
        confidence = 0.0
        crop_label = self._crop_label_from_key(key, crop_type=crop_type)

        if getattr(result, "probs", None) is not None:
            scores = result.probs.data.cpu().numpy()
            index = self._select_index_for_crop(scores, crop_type)
            confidence = float(scores[index])
            names = getattr(result, "names", {}) or {}
            key = str(names.get(index, self._labels[index] if index < len(self._labels) else "healthy"))
            crop_label = self._infer_crop_label_from_scores(scores, self._labels, predicted_key=key, crop_type=crop_type)
        elif getattr(result, "boxes", None) is not None and len(result.boxes) > 0:
            boxes = result.boxes
            top_index = self._select_box_index_for_crop(boxes.cls.cpu().numpy(), boxes.conf.cpu().numpy(), result.names, crop_type)
            class_id = int(boxes.cls[top_index].item())
            confidence = float(boxes.conf[top_index].item())
            key = str(result.names.get(class_id, "healthy"))
            crop_label = self._infer_crop_label_from_boxes(
                boxes.cls.cpu().numpy(),
                boxes.conf.cpu().numpy(),
                result.names,
                predicted_key=key,
                crop_type=crop_type,
            )

        meta = self._metadata_for_key(key)
        return DiseaseDetection(meta["name"], confidence, meta["cause"], meta["treatment"], crop_label=crop_label)

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
