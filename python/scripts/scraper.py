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
        Synopsis en anglais (nettoyé) ou None si introuvable
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
        first_post = soup.select_one("article.message--post")
        
        if first_post:
            bb_wrapper = first_post.select_one(".bbWrapper")
            
            if bb_wrapper:
                # Supprimer les sections inutiles (spoilers, code, quotes)
                for unwanted in bb_wrapper.select(".bbCodeSpoiler, .bbCodeCode, .bbCodeQuote"):
                    unwanted.decompose()
                
                # Récupérer le HTML complet pour appliquer le nettoyage
                content_html = str(bb_wrapper)
                
                # ══════════════════════════════════════════════════════════
                # NETTOYAGE INTELLIGENT (même logique que le UserScript)
                # ══════════════════════════════════════════════════════════
                
                # 1. Chercher le début (après "Overview:" ou "Synopsis:")
                start_pattern = r'(?:Overview|Synopsis)\s*:?\s*(?:<[^>]+>)*\s*'
                start_match = re.search(start_pattern, content_html, re.IGNORECASE)
                
                if start_match:
                    # Extraire la partie après "Overview:"
                    content_html = content_html[start_match.end():]
                
                # 2. Chercher la fin (avant les sections techniques)
                end_pattern = r'(?:Thread Updated|Installation|Changelog|<b>Update|Developer Notes|DOWNLOAD|Genre\s*:|Language\s*:|Version\s*:|OS\s*:|Censored\s*:|Release Date\s*:|Developer\s*:)'
                end_match = re.search(end_pattern, content_html, re.IGNORECASE)
                
                if end_match:
                    # Tronquer avant les sections techniques
                    content_html = content_html[:end_match.start()]
                
                # 3. Nettoyer les balises HTML
                # Remplacer <br> par des sauts de ligne
                content_html = re.sub(r'<br\s*/?>', '\n', content_html, flags=re.IGNORECASE)
                content_html = re.sub(r'</p>|</div>', '\n', content_html, flags=re.IGNORECASE)
                
                # Supprimer toutes les balises HTML restantes
                content_html = re.sub(r'<[^>]+>', '', content_html)
                
                # 4. Nettoyer les entités HTML
                content_html = content_html.replace('&nbsp;', ' ')
                content_html = content_html.replace('&amp;', '&')
                content_html = content_html.replace('&lt;', '<')
                content_html = content_html.replace('&gt;', '>')
                content_html = content_html.replace('&quot;', '"')
                
                # 5. Nettoyer les lignes vides et espaces
                lines = content_html.split('\n')
                cleaned_lines = []
                
                for line in lines:
                    line = line.strip()
                    # Ignorer les lignes vides ou trop courtes
                    if line and len(line) > 2:
                        # Ignorer les lignes qui ressemblent à des métadonnées
                        if not re.match(r'^(You must be registered|Thread Updated|Installation|Developer|Version|OS|Language|Censored|Genre|Release Date)', line, re.IGNORECASE):
                            cleaned_lines.append(line)
                
                # Joindre avec double saut de ligne pour la lisibilité
                synopsis = '\n\n'.join(cleaned_lines)
                
                # 6. Nettoyage final
                synopsis = synopsis.strip()
                synopsis = re.sub(r'\n{3,}', '\n\n', synopsis)  # Max 2 sauts de ligne consécutifs
                
                # Validation
                if synopsis and len(synopsis) > 50:
                    logger.info("[scraper] ✅ Synopsis nettoyé (%d chars) pour %s", len(synopsis), url)
                    return synopsis
                else:
                    logger.warning("[scraper] Synopsis trop court après nettoyage (%d chars) pour %s", 
                                 len(synopsis) if synopsis else 0, url)
        
        # ── STRATÉGIE 2 : Fallback sur .message-body ──
        message_body = soup.select_one(".message-body .bbWrapper")
        
        if message_body:
            # Appliquer le même nettoyage
            for unwanted in message_body.select(".bbCodeSpoiler, .bbCodeCode, .bbCodeQuote"):
                unwanted.decompose()
            
            content_html = str(message_body)
            
            # Même logique de nettoyage
            start_match = re.search(r'(?:Overview|Synopsis)\s*:?\s*(?:<[^>]+>)*\s*', content_html, re.IGNORECASE)
            if start_match:
                content_html = content_html[start_match.end():]
            
            end_match = re.search(r'(?:Thread Updated|Installation|Changelog|<b>Update|Developer Notes|DOWNLOAD)', content_html, re.IGNORECASE)
            if end_match:
                content_html = content_html[:end_match.start()]
            
            content_html = re.sub(r'<br\s*/?>', '\n', content_html, flags=re.IGNORECASE)
            content_html = re.sub(r'</p>|</div>', '\n', content_html, flags=re.IGNORECASE)
            content_html = re.sub(r'<[^>]+>', '', content_html)
            content_html = content_html.replace('&nbsp;', ' ')
            
            lines = [l.strip() for l in content_html.split('\n') if l.strip() and len(l.strip()) > 2]
            synopsis = '\n\n'.join(lines).strip()
            
            if synopsis and len(synopsis) > 50:
                logger.info("[scraper] ✅ Synopsis trouvé (fallback, %d chars) pour %s", len(synopsis), url)
                return synopsis
        
        # ── STRATÉGIE 3 : Meta description (dernier recours) ──
        meta_desc = soup.select_one("meta[property='og:description']")
        if meta_desc and meta_desc.get("content"):
            content = meta_desc["content"].strip()
            if len(content) > 50:
                logger.info("[scraper] ✅ Synopsis trouvé (meta) pour %s", url)
                return content
        
        # Aucune stratégie n'a fonctionné
        logger.warning("[scraper] ❌ Aucun synopsis trouvé pour %s", url)
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
