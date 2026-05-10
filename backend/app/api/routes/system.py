import html
import re

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import get_settings

router = APIRouter(prefix="/system", tags=["system"])

LANGUAGE_CODES = {
    "en": "en",
    "fil": "tl",
    "tl": "tl",
}
PLACEHOLDER_PATTERN = re.compile(r"\{[A-Za-z0-9_]+\}")
TOKEN_PATTERN = re.compile(r"__AGRISCAN_TOKEN_(\d+)__")
MAX_TRANSLATION_CHARS = 500
_TRANSLATION_CACHE: dict[tuple[str, str, str], str] = {}


class TranslateRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=80)
    source_lang: str = Field(default="en", pattern="^(en|fil|tl)$")
    target_lang: str = Field(default="fil", pattern="^(en|fil|tl)$")


@router.get("/public-config")
async def public_config() -> dict[str, str]:
    return {
        "notifications": "manual_service_worker",
    }


def _protect_placeholders(text: str) -> tuple[str, list[str]]:
    placeholders: list[str] = []

    def replace(match: re.Match[str]) -> str:
        placeholders.append(match.group(0))
        return f"__AGRISCAN_TOKEN_{len(placeholders) - 1}__"

    return PLACEHOLDER_PATTERN.sub(replace, text), placeholders


def _restore_placeholders(text: str, placeholders: list[str]) -> str:
    def replace(match: re.Match[str]) -> str:
        index = int(match.group(1))
        if index < len(placeholders):
            return placeholders[index]
        return match.group(0)

    restored = TOKEN_PATTERN.sub(replace, text)
    for index, placeholder in enumerate(placeholders):
        wrapped_variant = rf"_+\s*AGRISCAN\s*[_\s]\s*TOKEN\s*[_\s]\s*{index}\s*_+"
        bare_variant = rf"AGRISCAN\s*[_\s]\s*TOKEN\s*[_\s]\s*{index}"
        restored = re.sub(wrapped_variant, placeholder, restored, flags=re.IGNORECASE)
        restored = re.sub(bare_variant, placeholder, restored, flags=re.IGNORECASE)
    return restored


async def _translate_text(
    client: httpx.AsyncClient,
    text: str,
    source_code: str,
    target_code: str,
) -> str:
    normalized = text.strip()
    if not normalized or source_code == target_code:
        return text

    trimmed = normalized[:MAX_TRANSLATION_CHARS]
    cache_key = (source_code, target_code, trimmed)
    if cache_key in _TRANSLATION_CACHE:
        return _TRANSLATION_CACHE[cache_key]

    protected_text, placeholders = _protect_placeholders(trimmed)
    settings = get_settings()

    try:
        response = await client.get(
            settings.translation_api_base_url,
            params={
                "q": protected_text,
                "langpair": f"{source_code}|{target_code}",
            },
        )
        response.raise_for_status()
        payload = response.json()
        translated = payload.get("responseData", {}).get("translatedText") or trimmed
    except (httpx.HTTPError, ValueError):
        translated = trimmed

    translated = _restore_placeholders(html.unescape(str(translated)), placeholders)
    _TRANSLATION_CACHE[cache_key] = translated
    return translated


@router.post("/translate")
async def translate(payload: TranslateRequest) -> dict[str, object]:
    source_code = LANGUAGE_CODES.get(payload.source_lang, "en")
    target_code = LANGUAGE_CODES.get(payload.target_lang, "tl")
    settings = get_settings()

    async with httpx.AsyncClient(timeout=settings.translation_timeout_seconds) as client:
        translations = [
            await _translate_text(client, text, source_code, target_code)
            for text in payload.texts
        ]

    return {
        "provider": "mymemory",
        "source_lang": payload.source_lang,
        "target_lang": payload.target_lang,
        "translations": translations,
    }
