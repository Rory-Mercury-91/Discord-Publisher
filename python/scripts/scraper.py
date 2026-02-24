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


async def scrape_f95_synopsis(session, url: str) -> Optional[str]:
    """
    Scrape le synopsis d'un jeu depuis F95Zone.
    
    Args:
        session: aiohttp.ClientSession
        url: URL complète du thread F95Zone
    
    Returns:
        Synopsis en anglais ou None si introuvable
    """
    if not url or not url.strip():
        logger.warning("[scraper] URL vide fournie")
        return None
    
    url = url.strip()
    
    # Vérifier que c'est bien une URL F95Zone
    if "f95zone.to" not in url.lower():
        logger.warning("[scraper] URL non-F95Zone: %s", url)
        return None
    
    try:
        # Headers pour imiter un navigateur réel (éviter les blocages)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Cache-Control": "max-age=0"
        }
        
        logger.info("[scraper] Fetching: %s", url)
        
        async with session.get(url, headers=headers, timeout=30) as response:
            if response.status != 200:
                logger.warning("[scraper] HTTP %d pour %s", response.status, url)
                return None
            
            html = await response.text()
            
            if not html or len(html) < 100:
                logger.warning("[scraper] HTML vide ou trop court pour %s", url)
                return None
        
        # Parser avec BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        
        # ── STRATÉGIE 1 : Chercher .bbWrapper dans le premier post ──
        # F95Zone structure: premier post = OP avec le synopsis
        first_post = soup.select_one("article.message--post")
        
        if first_post:
            bb_wrapper = first_post.select_one(".bbWrapper")
            
            if bb_wrapper:
                # Nettoyer le contenu
                synopsis = bb_wrapper.get_text(separator="\n", strip=True)
                
                # Supprimer les sections inutiles (spoilers, code, etc.)
                for unwanted in bb_wrapper.select(".bbCodeSpoiler, .bbCodeCode, .bbCodeQuote"):
                    unwanted.decompose()
                
                synopsis = bb_wrapper.get_text(separator="\n", strip=True)
                
                # Validation minimale
                if synopsis and len(synopsis) > 20:
                    logger.info("[scraper] ✅ Synopsis trouvé (%d chars) pour %s", len(synopsis), url)
                    return synopsis
                else:
                    logger.warning("[scraper] Synopsis trop court (%d chars) pour %s", len(synopsis) if synopsis else 0, url)
        
        # ── STRATÉGIE 2 : Fallback sur .message-body (sans filtre post) ──
        message_body = soup.select_one(".message-body .bbWrapper")
        
        if message_body:
            synopsis = message_body.get_text(separator="\n", strip=True)
            
            if synopsis and len(synopsis) > 20:
                logger.info("[scraper] ✅ Synopsis trouvé (fallback) pour %s", url)
                return synopsis
        
        # ── STRATÉGIE 3 : Chercher dans meta description ──
        meta_desc = soup.select_one("meta[property='og:description']")
        if meta_desc and meta_desc.get("content"):
            content = meta_desc["content"].strip()
            if len(content) > 50:
                logger.info("[scraper] ✅ Synopsis trouvé (meta) pour %s", url)
                return content
        
        # ── Aucune stratégie n'a fonctionné ──
        logger.warning("[scraper] ❌ Aucun synopsis trouvé pour %s", url)
        
        # Debug: afficher la structure HTML (première partie)
        logger.debug("[scraper] Structure HTML (500 premiers chars):\n%s", html[:500])
        
        return None
    
    except Exception as e:
        logger.error("[scraper] Exception lors du scraping de %s: %s", url, e, exc_info=True)
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
