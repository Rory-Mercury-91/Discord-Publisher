"""
Module de scraping des synopsis F95Zone.
Dépendances : aiohttp, beautifulsoup4, lxml
Logger : [scraper]
"""

import logging
import re
from typing import Optional

import aiohttp
from bs4 import BeautifulSoup

logger = logging.getLogger("scraper")


async def scrape_f95_synopsis(
    session: aiohttp.ClientSession,
    f95_url: str
) -> Optional[str]:
    """
    Scrape le synopsis (description) depuis une page F95Zone.
    
    Args:
        session: Session aiohttp
        f95_url: URL du thread F95Zone (ex: https://f95zone.to/threads/xxxxx.123456/)
    
    Returns:
        Texte du synopsis nettoyé (max 2000 caractères) ou None
    
    Sélecteur CSS : .articleBody-main .bbWrapper (premier bloc = description)
    """
    if not f95_url or not f95_url.strip():
        logger.warning("[scraper] URL vide fournie")
        return None
    
    url_clean = f95_url.strip()
    
    # Validation : uniquement F95Zone
    if "f95zone.to" not in url_clean.lower():
        logger.warning("[scraper] URL non-F95Zone : %s", url_clean)
        return None
    
    try:
        logger.info("[scraper] Scraping synopsis : %s", url_clean[:60])
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }
        
        async with session.get(
            url_clean,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=30)
        ) as resp:
            if resp.status != 200:
                logger.error("[scraper] HTTP %d : %s", resp.status, url_clean)
                return None
            
            html = await resp.text()
            soup = BeautifulSoup(html, "lxml")
            
            # Sélecteur : premier .bbWrapper dans .articleBody-main
            bb_wrapper = soup.select_one(".articleBody-main .bbWrapper")
            
            if not bb_wrapper:
                logger.warning("[scraper] .bbWrapper introuvable : %s", url_clean)
                return None
            
            # Extraction texte brut
            synopsis_raw = bb_wrapper.get_text(separator=" ", strip=True)
            
            # Nettoyage
            synopsis_clean = re.sub(r'\s+', ' ', synopsis_raw).strip()
            
            # Limite de caractères (évite les synopsis trop longs)
            synopsis_final = synopsis_clean[:2000]
            
            if not synopsis_final:
                logger.warning("[scraper] Synopsis vide après extraction : %s", url_clean)
                return None
            
            logger.info(
                "[scraper] ✅ Synopsis extrait (%d caractères) : %s",
                len(synopsis_final), url_clean[:60]
            )
            return synopsis_final
    
    except aiohttp.ClientError as e:
        logger.error("[scraper] Erreur réseau : %s → %s", url_clean, e)
        return None
    except Exception as e:
        logger.error(
            "[scraper] Erreur inattendue : %s → %s",
            url_clean, e, exc_info=True
        )
        return None


async def scrape_multiple_synopsis(
    session: aiohttp.ClientSession,
    url_list: list[str]
) -> dict[str, Optional[str]]:
    """
    Scrape plusieurs synopsis en parallèle (avec gestion d'erreurs individuelles).
    
    Args:
        session: Session aiohttp
        url_list: Liste d'URLs F95Zone
    
    Returns:
        Dict {url: synopsis} (synopsis = None si échec)
    """
    import asyncio
    
    results = {}
    
    # Scraping séquentiel pour éviter de surcharger F95Zone
    for url in url_list:
        synopsis = await scrape_f95_synopsis(session, url)
        results[url] = synopsis
        
        # Délai entre requêtes (politesse)
        await asyncio.sleep(1.0)
    
    return results


def extract_f95_thread_id(url: str) -> Optional[str]:
    """
    Extrait l'ID numérique d'un thread F95Zone depuis son URL.
    
    Exemples:
        https://f95zone.to/threads/game-name.285451/          -> "285451"
        https://f95zone.to/threads/game.8012/post-11944222    -> "8012"
        https://f95zone.to/threads/285451                     -> "285451"
    """
    if not url:
        return None
    
    match = re.search(r"/threads/(?:[^/]*\.)?(\d+)", url)
    return match.group(1) if match else None
