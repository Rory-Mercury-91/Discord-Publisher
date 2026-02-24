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


async def translate_text(
    session: aiohttp.ClientSession,
    text: str,
    source_lang: str = "en",
    target_lang: str = "fr"
) -> Optional[str]:
    """
    Traduit un texte via Google Translate API non-officielle.
    
    Args:
        session: Session aiohttp
        text: Texte à traduire (max ~5000 caractères)
        source_lang: Langue source (défaut: "en")
        target_lang: Langue cible (défaut: "fr")
    
    Returns:
        Texte traduit ou None en cas d'erreur
    
    Exemple de réponse API:
        [[["texte traduit", "texte source", null, null, 3], ...]]
    """
    if not text or not text.strip():
        logger.warning("[translator] Texte vide fourni")
        return None
    
    # Limite de caractères pour éviter les erreurs
    text_clean = text.strip()[:5000]
    
    params = {
        "client": "gtx",         # Client gratuit (pas de clé API)
        "sl": source_lang,       # Source language
        "tl": target_lang,       # Target language
        "dt": "t",               # Return translated text
        "q": text_clean          # Query (texte à traduire)
    }
    
    try:
        logger.info(
            "[translator] Traduction %s → %s (%d caractères)",
            source_lang, target_lang, len(text_clean)
        )
        
        async with session.get(
            GOOGLE_TRANSLATE_API,
            params=params,
            timeout=aiohttp.ClientTimeout(total=30)
        ) as resp:
            if resp.status != 200:
                logger.error(
                    "[translator] API HTTP %d : %s",
                    resp.status, await resp.text()
                )
                return None
            
            data = await resp.json()
            
            # Format de réponse : [[["texte traduit", "texte source", ...], ...]]
            if not isinstance(data, list) or not data:
                logger.error("[translator] Format de réponse invalide : %s", data)
                return None
            
            # Extraire les segments traduits
            translated_segments = []
            for segment in data[0]:
                if isinstance(segment, list) and len(segment) > 0:
                    translated_segments.append(str(segment[0]))
            
            if not translated_segments:
                logger.warning("[translator] Aucun segment traduit trouvé")
                return None
            
            result = "".join(translated_segments).strip()
            logger.info("[translator] ✅ Traduction réussie (%d → %d caractères)",
                       len(text_clean), len(result))
            return result
    
    except aiohttp.ClientError as e:
        logger.error("[translator] Erreur réseau : %s", e)
        return None
    except Exception as e:
        logger.error("[translator] Erreur inattendue : %s", e, exc_info=True)
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
