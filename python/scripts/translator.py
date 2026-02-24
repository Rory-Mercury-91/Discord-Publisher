"""
Module de traduction via Google Translate API non-officielle (gratuite).
Dépendances : aiohttp
Logger : [translator]
"""

import logging
import urllib.parse
from typing import Optional

import aiohttp

logger = logging.getLogger("translator")

# API Google Translate non-officielle (gratuite, pas de clé requise)
GOOGLE_TRANSLATE_API = "https://translate.googleapis.com/translate_a/single"


async def translate_text(session, text: str, source_lang: str = "en", target_lang: str = "fr") -> Optional[str]:
    """
    Traduit un texte via l'API Google Translate non-officielle.
    
    Args:
        session: aiohttp.ClientSession
        text: Texte à traduire
        source_lang: Langue source (défaut: "en")
        target_lang: Langue cible (défaut: "fr")
    
    Returns:
        Texte traduit ou None en cas d'erreur
    """
    if not text or not text.strip():
        logger.warning("[translator] Texte vide fourni")
        return None
    
    text = text.strip()
    
    # Limiter la longueur (Google Translate a une limite)
    if len(text) > 5000:
        logger.warning("[translator] Texte trop long (%d chars), troncature à 5000", len(text))
        text = text[:5000]
    
    try:
        # URL de l'API Google Translate non-officielle
        base_url = "https://translate.googleapis.com/translate_a/single"
        
        params = {
            "client": "gtx",
            "sl": source_lang,
            "tl": target_lang,
            "dt": "t",
            "q": text
        }
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        
        logger.info("[translator] Traduction %s → %s (%d chars)", source_lang, target_lang, len(text))
        
        async with session.get(base_url, params=params, headers=headers, timeout=30) as response:
            if response.status != 200:
                logger.warning("[translator] HTTP %d", response.status)
                return None
            
            data = await response.json()
            
            # La réponse est une structure complexe: [[["texte_traduit", "texte_source", null, null, 3], ...], ...]
            if not data or not isinstance(data, list) or len(data) == 0:
                logger.warning("[translator] Réponse vide ou invalide")
                return None
            
            # Extraire les segments traduits
            translated_parts = []
            
            for segment in data[0]:
                if isinstance(segment, list) and len(segment) > 0:
                    translated_text = segment[0]
                    if translated_text and isinstance(translated_text, str):
                        translated_parts.append(translated_text)
            
            if not translated_parts:
                logger.warning("[translator] Aucune traduction extraite")
                return None
            
            result = "".join(translated_parts).strip()
            
            if result and len(result) > 10:
                logger.info("[translator] ✅ Traduction réussie (%d chars)", len(result))
                return result
            else:
                logger.warning("[translator] Traduction trop courte (%d chars)", len(result) if result else 0)
                return None
    
    except Exception as e:
        logger.error("[translator] Exception: %s", e, exc_info=True)
        return None


async def translate_synopsis_batch(
    session: aiohttp.ClientSession,
    synopsis_list: list[dict]
) -> list[dict]:
    """
    Traduit un lot de synopsis (avec gestion d'erreurs individuelles).
    
    Args:
        session: Session aiohttp
        synopsis_list: Liste de dicts {"game_id": ..., "synopsis_en": ...}
    
    Returns:
        Liste de dicts {"game_id": ..., "synopsis_fr": ..., "success": bool}
    """
    results = []
    
    for item in synopsis_list:
        game_id = item.get("game_id")
        synopsis_en = item.get("synopsis_en", "")
        
        if not synopsis_en or not synopsis_en.strip():
            results.append({
                "game_id": game_id,
                "synopsis_fr": None,
                "success": False,
                "error": "Synopsis vide"
            })
            continue
        
        synopsis_fr = await translate_text(session, synopsis_en, "en", "fr")
        
        results.append({
            "game_id": game_id,
            "synopsis_fr": synopsis_fr,
            "success": synopsis_fr is not None,
            "error": None if synopsis_fr else "Traduction échouée"
        })
    
    return results
