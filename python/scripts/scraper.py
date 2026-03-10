"""
Module de scraping F95Zone (synopsis, titre, données complètes type DiscordPublisherDataExtractor).
Dépendances : aiohttp, beautifulsoup4, lxml
Logger : [scraper]
"""

import logging
import re
from typing import Optional
from urllib.parse import urljoin

import aiohttp
from bs4 import BeautifulSoup, NavigableString

logger = logging.getLogger("scraper")

# Mêmes correspondances que DiscordPublisherDataExtractor.js pour statut et type
_STATUS_MAP = {
    "Completed": "TERMINÉ",
    "Complete": "TERMINÉ",
    "Abandoned": "ABANDONNÉ",
    "On hold": "En pause",
    "On Hold": "En pause",
}
_TYPE_MAP = {
    "Others": "Autre",
    "Other": "Autre",
    "Ren'Py": "RenPy",
    "RenPy": "RenPy",
    "RPGM": "RPGM",
    "Unity": "Unity",
    "Unreal Engine": "Unreal",
    "Flash": "Flash",
    "HTML": "HTML",
    "QSP": "QSP",
}

# Headers communs pour les requêtes
_F95_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
}


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


async def scrape_f95_title(session, url: str) -> Optional[str]:
    """
    Récupère le titre du thread F95 depuis la page.
    Stratégies : og:title, balise <title>, puis .p-title.
    """
    if not url or not url.strip():
        return None
    url = url.strip()
    if "f95zone.to" not in url.lower():
        return None
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        async with session.get(url, headers=headers, timeout=15) as response:
            if response.status != 200:
                return None
            html = await response.text()
        if not html or len(html) < 100:
            return None
        soup = BeautifulSoup(html, "html.parser")
        # 1. og:title (souvent "Game Name [v0.5] | F95zone")
        og = soup.select_one("meta[property='og:title']")
        if og and og.get("content"):
            t = og["content"].strip()
            if t:
                # Enlever le suffixe " | F95zone" si présent
                if " | F95zone" in t or "| F95zone" in t:
                    t = t.split("|")[0].strip()
                logger.info("[scraper] Titre (og:title) pour %s: %s", url, t[:60])
                return t
        # 2. <title>
        title_tag = soup.find("title")
        if title_tag and title_tag.string:
            t = title_tag.string.strip()
            if t:
                if " | F95zone" in t:
                    t = t.split("|")[0].strip()
                return t
        # 3. .p-title value (titre du premier post)
        p_title = soup.select_one(".p-title")
        if p_title:
            t = p_title.get_text(strip=True)
            if t:
                return t
        return None
    except Exception as e:
        logger.error("[scraper] Exception titre pour %s: %s", url, e)
        return None


def _extract_synopsis_from_content_html(content_html: str) -> Optional[str]:
    """
    Extrait le synopsis depuis le HTML d'un .bbWrapper (même logique que DiscordPublisherDataExtractor).
    """
    if not content_html or len(content_html) < 10:
        return None
    # Début : après "Overview" ou "Synopsis" (avec ou sans deux-points, balises optionnelles)
    start_pattern = r"(?:Overview|Synopsis)\s*:?\s*(?:</?[^>]+>)*\s*"
    start_match = re.search(start_pattern, content_html, re.IGNORECASE)
    if start_match:
        content_html = content_html[start_match.end() :]
    else:
        # Fallback : chercher le texte après "Overview" ou "Synopsis" dans le HTML
        for marker in ("Overview", "Synopsis"):
            idx = content_html.upper().find(marker.upper())
            if idx != -1:
                content_html = content_html[idx + len(marker) :]
                content_html = re.sub(r"^[:\s<>/]+", "", content_html, flags=re.IGNORECASE)
                break
    # Fin : même regex que UserScript (couper avant sections techniques ou spoiler)
    end_pattern = r"(?:Thread Updated|Installation|Changelog|<b>Update|Developer Notes|DOWNLOAD|Genre\s*:|Language\s*:|<div class=[\"']bbCodeSpoiler|Synopsis\s*:)"
    end_match = re.search(end_pattern, content_html, re.IGNORECASE)
    if end_match:
        content_html = content_html[: end_match.start()]
    content_html = re.sub(r"<br\s*/?>", "\n", content_html, flags=re.IGNORECASE)
    content_html = re.sub(r"</p>|</div>|</span>", "\n", content_html, flags=re.IGNORECASE)
    content_html = re.sub(r"<[^>]+>", "", content_html)
    content_html = content_html.replace("&nbsp;", " ").replace("&amp;", "&")
    lines = [line.strip() for line in content_html.split("\n") if line.strip() and len(line.strip()) > 1]
    synopsis = "\n\n".join(lines).strip()
    synopsis = re.sub(r"^[:\s\n]+", "", synopsis)
    synopsis = re.sub(r"[:\s\n]+$", "", synopsis)
    if synopsis and len(synopsis) > 15:
        return synopsis
    return None


def _f95_headers_with_cookies(cookies: Optional[str] = None) -> dict:
    """Headers pour F95, avec Cookie optionnel (session connectée)."""
    h = dict(_F95_HEADERS)
    if cookies and cookies.strip():
        h["Cookie"] = cookies.strip()
    return h


async def scrape_f95_game_data(session, url: str, cookies: Optional[str] = None) -> Optional[dict]:
    """
    Récupère les mêmes données que DiscordPublisherDataExtractor.js :
    id, name, version, status, tags, type, image, synopsis, link (, domain, ac).
    Si cookies est fourni (chaîne type "name=value; name2=value2"), les requêtes sont faites en session connectée.
    """
    if not url or not url.strip():
        return None
    url = url.strip()
    if "f95zone.to" not in url.lower() and "lewdcorner.com" not in url.lower():
        logger.warning("[scraper] URL non-F95/LewdCorner pour game_data: %s", url)
        return None
    try:
        headers = _f95_headers_with_cookies(cookies)
        async with session.get(url, headers=headers, timeout=30) as response:
            if response.status != 200:
                logger.warning("[scraper] HTTP %d pour %s", response.status, url)
                return None
            html = await response.text()
        if not html or len(html) < 500:
            return None
        soup = BeautifulSoup(html, "html.parser")

        # 1. ID depuis l'URL
        id_str = extract_f95_thread_id(url)
        thread_id = int(id_str, 10) if id_str else 0

        # 2. Nom & version depuis .p-title-value (texte avant [v1.0], même logique que UserScript)
        name, version = "N/A", "N/A"
        title_el = soup.select_one(".p-title-value")
        if title_el:
            text_parts = []
            for node in title_el.children:
                if isinstance(node, NavigableString):
                    t = str(node).strip()
                    if t:
                        text_parts.append(t)
            full_title = " ".join(text_parts)
            version_match = re.match(r"(.*?)\s*\[([^\]]+)\]", full_title)
            if version_match:
                name = version_match.group(1).strip()
                v = version_match.group(2).strip()
                version = v if v.startswith("[") else f"[{v}]"
            else:
                name = full_title.strip()

        # 3. Premier post / bbWrapper (plusieurs sélecteurs : F95 peut utiliser threadStarter ou message--threadStarter)
        bb_wrapper = (
            soup.select_one(".message-threadStarterPost .bbWrapper")
            or soup.select_one(".message--threadStarter .bbWrapper")
            or soup.select_one("[class*='threadStarter'] .bbWrapper")
            or soup.select_one("article.message--post .bbWrapper")
            or soup.select_one(".block-body .bbWrapper")
        )
        if not bb_wrapper:
            first_article = soup.select_one("article.message--post")
            if first_article:
                bb_wrapper = first_article.select_one(".bbWrapper") or first_article.select_one(".message-body")

        # 4. Image : même logique que Nexus / Tampermonkey (AdulteGame Extractor)
        #    Ordre : img.bbImage[data-src] | img.bbImage[src] | [data-lb-id] img
        #    Puis lightbox : .lbContainer .lbContainer-zoomer data-src (image pleine taille)
        #    Normalisation : URL absolue, preview → attachments, supprimer /thumb/
        base_domain = "https://lewdcorner.com" if "lewdcorner.com" in url.lower() else "https://f95zone.to"

        def _normalize_image_url(src: str) -> str:
            if not src or not isinstance(src, str):
                return ""
            src = (src or "").strip()
            if not src:
                return ""
            # URL absolue (relative ou //)
            try:
                src = urljoin(base_domain + "/", src)
            except Exception:
                pass
            if src.startswith("//"):
                src = "https:" + src
            # Nexus : utiliser attachments (pleine taille), pas preview
            if "preview.f95zone.to" in src:
                src = src.replace("preview.f95zone.to", "attachments.f95zone.to")
            if "preview.lewdcorner.com" in src:
                src = src.replace("preview.lewdcorner.com", "attachments.lewdcorner.com")
            # Supprimer /thumb/ pour l'image pleine taille (comme Nexus)
            if "/thumb/" in src:
                src = src.replace("/thumb/", "/")
            return src

        def _get_img_url_from_tag(tag) -> str:
            raw = (tag.get("data-src") or tag.get("src") or "").strip()
            return _normalize_image_url(raw) if raw else ""

        image = ""
        # Priorité 1 : même sélecteurs que Nexus (page entière)
        image_element = (
            soup.select_one("img.bbImage[data-src]")
            or soup.select_one("img.bbImage[src]")
            or soup.select_one("[data-lb-id] img")
        )
        if image_element:
            # Lightbox : conteneur .lbContainer puis .lbContainer-zoomer (image pleine taille)
            def _has_lb_container(tag):
                cls = tag.get("class") or []
                return "lbContainer" in (cls if isinstance(cls, list) else [cls])
            container = image_element.find_parent(_has_lb_container)
            zoomer = container.select_one(".lbContainer-zoomer") if container else None
            raw_src = (
                (zoomer.get("data-src") if zoomer else None)
                or image_element.get("data-src")
                or image_element.get("src")
                or ""
            )
            image = _normalize_image_url(raw_src) if raw_src else ""
        # Priorité 2 : dans le premier post (bbWrapper)
        if not image and bb_wrapper:
            for sel in ("img.bbImage[data-src]", "img.bbImage[src]", "img.bbImage", "[data-lb-id] img", "img[data-src]", "img[src*='attachments']", "img[src*='preview.']", "img"):
                img = bb_wrapper.select_one(sel)
                if img:
                    image = _get_img_url_from_tag(img)
                    if not image and img.get("data-src"):
                        image = _normalize_image_url(img.get("data-src"))
                    if not image and img.get("src"):
                        image = _normalize_image_url(img.get("src"))
                    if image:
                        break
        # Priorité 3 : n'importe quelle img f95zone/attachments dans la page
        if not image:
            for img in soup.find_all("img"):
                src = img.get("data-src") or img.get("src") or ""
                if src and ("f95zone" in src or "lewdcorner" in src or "attachments" in src or "preview" in src):
                    image = _normalize_image_url(src)
                    if image:
                        break
        # Priorité 4 : og:image
        if not image:
            meta_og = soup.select_one("meta[property='og:image']")
            if meta_og and meta_og.get("content"):
                image = _normalize_image_url(meta_og.get("content") or "")

        # 5. Synopsis (logique UserScript + fallback og:description)
        synopsis = ""
        if bb_wrapper:
            content_html = str(bb_wrapper)
            for tag in bb_wrapper.select(".bbCodeSpoiler, .bbCodeCode, .bbCodeQuote"):
                content_html = content_html.replace(str(tag), "")
            synopsis = _extract_synopsis_from_content_html(content_html) or ""
        if not synopsis or len(synopsis) < 30:
            meta_desc = soup.select_one("meta[property='og:description']")
            if meta_desc and meta_desc.get("content"):
                d = meta_desc["content"].strip()
                if len(d) > 30:
                    synopsis = d

        # 6. Tags : même logique que Nexus / AdulteGame Extractor (F95 charge parfois les tags en JS)
        # Priorité 1 : .js-tagList .tagItem (conteneur F95 pour les tags)
        tags_els = soup.select(".js-tagList .tagItem")
        if not tags_els:
            tags_els = soup.select(".tagItem")
        tags_list = [el.get_text(strip=True) for el in tags_els if el.get_text(strip=True)]
        # Fallback : extraction par regex sur le HTML brut (tags chargés dynamiquement ou structure différente)
        if not tags_list and html:
            tag_list_content = re.search(
                r'<span[^>]*class="[^"]*js-tagList[^"]*"[^>]*>([\s\S]*?)</span>',
                html,
                re.IGNORECASE | re.DOTALL,
            )
            if tag_list_content:
                block = tag_list_content.group(1)
                for m in re.finditer(
                    r'<a[^>]*class="[^"]*tagItem[^"]*"[^>]*>([\s\S]*?)</a>',
                    block,
                    re.IGNORECASE,
                ):
                    raw = m.group(1)
                    if raw:
                        text = re.sub(r"<[^>]*>", "", raw).strip()
                        text = re.sub(r"\s+", " ", text)
                        if text and text not in tags_list:
                            tags_list.append(text)
            if not tags_list:
                for m in re.finditer(
                    r'<a[^>]*class="[^"]*tagItem[^"]*"[^>]*>([\s\S]*?)</a>',
                    html,
                    re.IGNORECASE,
                ):
                    raw = m.group(1)
                    if raw:
                        text = re.sub(r"<[^>]*>", "", raw).strip()
                        text = re.sub(r"\s+", " ", text)
                        if text and text not in tags_list:
                            tags_list.append(text)
        tags = ", ".join(tags_list)

        # 7. Statut & type depuis .p-title-value .label
        status, type_val = "EN COURS", ""
        labels = soup.select(".p-title-value .label")
        for el in labels:
            raw = (el.get_text() or "").strip()
            text = re.sub(r"[\u2018\u2019\u0027]", "'", raw)
            if not text:
                continue
            if text in _STATUS_MAP:
                status = _STATUS_MAP[text]
            elif text in _TYPE_MAP:
                type_val = _TYPE_MAP[text]
            elif not status or status == "EN COURS":
                if re.search(r"Completed?|Abandoned|On hold", text, re.I):
                    status = "TERMINÉ" if re.search(r"Complete", text, re.I) else (
                        "ABANDONNÉ" if "Abandoned" in text else "En pause"
                    )
        if not type_val and soup.find("title"):
            title_str = soup.find("title").get_text() or ""
            if re.search(r"Ren['']Py", title_str, re.I):
                type_val = "RenPy"
            elif re.search(r"\bRPGM\b", title_str, re.I):
                type_val = "RPGM"
            elif re.search(r"\bUnity\b", title_str, re.I):
                type_val = "Unity"
            elif "Unreal Engine" in title_str:
                type_val = "Unreal"
            elif re.search(r"\bFlash\b", title_str, re.I):
                type_val = "Flash"
            elif re.search(r"\bHTML\b", title_str, re.I):
                type_val = "HTML"
            elif re.search(r"\bQSP\b", title_str, re.I):
                type_val = "QSP"
            elif re.search(r"\bOther(s)?\b", title_str, re.I):
                type_val = "Autre"

        base_url = "https://lewdcorner.com" if "lewdcorner.com" in url.lower() else "https://f95zone.to"
        link_short = f"{base_url}/threads/{thread_id}" if thread_id else url.split("?")[0]

        out = {
            "id": thread_id,
            "domain": "LewdCorner" if "lewdcorner.com" in url.lower() else "F95z",
            "name": name,
            "version": version,
            "status": status,
            "tags": tags,
            "type": type_val or "",
            "ac": False,
            "link": link_short,
            "image": image,
            "synopsis": synopsis,
        }
        logger.info("[scraper] ✅ Données jeu extraites pour %s: name=%s version=%s", url, name[:40], version)
        return out
    except Exception as e:
        logger.error("[scraper] Exception game_data pour %s: %s", url, e, exc_info=True)
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
