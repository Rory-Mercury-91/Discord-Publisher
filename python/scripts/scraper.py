"""
Module de scraping F95Zone / LewdCorner.
Fonctions disponibles :
  - scrape_f95_synopsis()           : synopsis d'un thread
  - scrape_f95_title()              : titre d'un thread
  - scrape_f95_game_data()          : données complètes (image, version, statut, tags…)
  - scrape_multiple_synopsis()      : lot de synopsis
  - extract_f95_thread_id()         : extrait l'ID numérique depuis une URL
  - extract_thread_updated_from_html() : date "Thread Updated" depuis du HTML
  - scrape_thread_updated_date()    : date "Thread Updated" via requête HTTP
  - enrich_dates_with_fallback()    : hybride RSS + scraping pour enrichir date_maj

Dépendances : aiohttp, beautifulsoup4, lxml
Logger       : [scraper]
"""

import asyncio
import logging
import re
from typing import Optional
from urllib.parse import urljoin

import aiohttp
from bs4 import BeautifulSoup, NavigableString

logger = logging.getLogger("scraper")


# ── Correspondances statut / type (identiques à DiscordPublisherDataExtractor.js) ──

_STATUS_MAP = {
    "Completed":  "TERMINÉ",
    "Complete":   "TERMINÉ",
    "Abandoned":  "ABANDONNÉ",
    "On hold":    "EN PAUSE",
    "On Hold":    "EN PAUSE",
}
_TYPE_MAP = {
    "Others":         "Autre",
    "Other":          "Autre",
    "Ren'Py":         "RenPy",
    "RenPy":          "RenPy",
    "RPGM":           "RPGM",
    "Unity":          "Unity",
    "Unreal Engine":  "Unreal",
    "Flash":          "Flash",
    "HTML":           "HTML",
    "QSP":            "QSP",
}

# Headers communs
_F95_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT":             "1",
    "Connection":      "keep-alive",
}

# ── Regex pour "Thread Updated" ──────────────────────────────────────────────

_RE_UPDATED_HTML = re.compile(
    r'<b>\s*Thread\s+Updated\s*</b>\s*[:\-]?\s*(?:<[^>]+>)*\s*'
    r'(?P<date>\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2},?\s+\d{4}|\d{1,2}/\d{1,2}/\d{4})',
    re.IGNORECASE,
)
_RE_UPDATED_TEXT = re.compile(
    r'Thread\s+Updated\s*[:\-]\s*'
    r'(?P<date>\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2},?\s+\d{4}|\d{1,2}/\d{1,2}/\d{4})',
    re.IGNORECASE,
)

_MONTH_NAMES: dict[str, str] = {
    "january": "01", "february": "02", "march":    "03", "april":    "04",
    "may":     "05", "june":     "06", "july":     "07", "august":   "08",
    "september":"09","october":  "10", "november": "11", "december": "12",
    "jan": "01", "feb": "02", "mar": "03", "apr": "04",
    "jun": "06", "jul": "07", "aug": "08", "sep": "09",
    "oct": "10", "nov": "11", "dec": "12",
}


# ── Helpers internes ─────────────────────────────────────────────────────────

def _f95_headers_with_cookies(cookies: Optional[str] = None) -> dict:
    """Headers pour F95, avec Cookie optionnel (session connectée)."""
    h = dict(_F95_HEADERS)
    if cookies and cookies.strip():
        h["Cookie"] = cookies.strip()
    return h


def _html_to_text(content_html: str) -> str:
    """Convertit du HTML bbWrapper en texte brut propre."""
    content_html = re.sub(r'<br\s*/?>', '\n', content_html, flags=re.IGNORECASE)
    content_html = re.sub(r'</p>|</div>|</li>', '\n', content_html, flags=re.IGNORECASE)
    content_html = re.sub(r'<[^>]+>', '', content_html)
    content_html = (
        content_html
        .replace('&nbsp;', ' ')
        .replace('&amp;', '&')
        .replace('&lt;', '<')
        .replace('&gt;', '>')
        .replace('&quot;', '"')
    )
    lines = [l.strip() for l in content_html.split('\n') if l.strip() and len(l.strip()) > 2]
    text  = '\n\n'.join(lines)
    return re.sub(r'\n{3,}', '\n\n', text).strip()


def _extract_synopsis_from_content_html(content_html: str) -> Optional[str]:
    """
    Extrait le synopsis depuis le HTML d'un .bbWrapper
    (même logique que DiscordPublisherDataExtractor).
    """
    if not content_html or len(content_html) < 10:
        return None
    start_pattern = r"(?:Overview|Synopsis)\s*:?\s*(?:</?[^>]+>)*\s*"
    start_match = re.search(start_pattern, content_html, re.IGNORECASE)
    if start_match:
        content_html = content_html[start_match.end():]
    else:
        for marker in ("Overview", "Synopsis"):
            idx = content_html.upper().find(marker.upper())
            if idx != -1:
                content_html = content_html[idx + len(marker):]
                content_html = re.sub(r"^[:\s<>/]+", "", content_html, flags=re.IGNORECASE)
                break
    end_pattern = (
        r"(?:Thread Updated|Installation|Changelog|<b>Update|Developer Notes"
        r"|DOWNLOAD|Genre\s*:|Language\s*:|<div class=[\"']bbCodeSpoiler|Synopsis\s*:)"
    )
    end_match = re.search(end_pattern, content_html, re.IGNORECASE)
    if end_match:
        content_html = content_html[:end_match.start()]
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


def _normalize_date(raw: str) -> Optional[str]:
    """
    Normalise une date brute extraite vers le format ISO 8601 YYYY-MM-DD.
    Retourne None si le format n'est pas reconnu.
    """
    raw = raw.strip()

    # Format ISO direct : 2026-03-14
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', raw):
        return raw

    # "March 14, 2026" ou "March 14 2026"
    m = re.fullmatch(r'(\w+)\s+(\d{1,2}),?\s+(\d{4})', raw)
    if m:
        month = _MONTH_NAMES.get(m.group(1).lower())
        if month:
            return f"{m.group(3)}-{month}-{m.group(2).zfill(2)}"

    # "14/03/2026" — convention D/M/Y (usage FR)
    m = re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{4})', raw)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"

    return None


# ── Fonctions publiques ───────────────────────────────────────────────────────

def extract_f95_thread_id(url: str) -> Optional[str]:
    """
    Extrait l'ID numérique d'un thread F95Zone depuis son URL.

    Exemples :
        https://f95zone.to/threads/game-name.285451/          -> "285451"
        https://f95zone.to/threads/game.8012/post-11944222    -> "8012"
        https://f95zone.to/threads/285451                     -> "285451"
    """
    if not url:
        return None
    match = re.search(r"/threads/(?:[^/]*\.)?(\d+)", url)
    return match.group(1) if match else None


def extract_thread_updated_from_html(html: str) -> Optional[str]:
    """
    Extrait la date "Thread Updated" depuis le HTML brut d'une page F95Zone.

    Stratégies (dans l'ordre) :
      1. Regex sur le HTML brut — détecte <b>Thread Updated</b>:
      2. BeautifulSoup sur le texte du bbWrapper — plus robuste si la structure varie.

    Retourne la date au format ISO 8601 (YYYY-MM-DD) ou None si introuvable.
    """
    if not html:
        return None

    # Stratégie 1 : regex rapide sur le HTML brut
    m = _RE_UPDATED_HTML.search(html)
    if m:
        normalized = _normalize_date(m.group("date"))
        if normalized:
            logger.debug("[scraper] Thread Updated (regex HTML) : %s", normalized)
            return normalized

    # Stratégie 2 : BeautifulSoup sur le texte du premier post
    try:
        soup = BeautifulSoup(html, "html.parser")
        bb_wrapper = (
            soup.select_one(".message-threadStarterPost .bbWrapper")
            or soup.select_one(".message--threadStarter .bbWrapper")
            or soup.select_one("[class*='threadStarter'] .bbWrapper")
        )
        content = (bb_wrapper or soup).get_text(separator="\n")
        m2 = _RE_UPDATED_TEXT.search(content)
        if m2:
            normalized = _normalize_date(m2.group("date"))
            if normalized:
                logger.debug("[scraper] Thread Updated (BeautifulSoup) : %s", normalized)
                return normalized
    except Exception as e:
        logger.warning("[scraper] extract_thread_updated_from_html exception : %s", e)

    return None


async def scrape_thread_updated_date(
    session,
    url: str,
    cookies: Optional[str] = None,
) -> Optional[str]:
    """
    Récupère la date "Thread Updated" depuis la page d'un thread F95Zone.
    À utiliser pour les jeux absents du flux RSS (au-delà des 90 dernières entrées).

    Retourne la date au format YYYY-MM-DD, ou None si non trouvée / erreur réseau.
    """
    if not url or "f95zone.to" not in url.lower():
        logger.warning("[scraper] scrape_thread_updated_date : URL invalide (%s)", url)
        return None

    headers = _f95_headers_with_cookies(cookies)
    try:
        logger.info("[scraper] Scraping Thread Updated : %s", url)
        async with session.get(url, headers=headers, timeout=30) as response:
            if response.status != 200:
                logger.warning("[scraper] HTTP %d pour %s", response.status, url)
                return None
            html = await response.text()

        if not html or len(html) < 200:
            return None

        date = extract_thread_updated_from_html(html)
        if date:
            logger.info("[scraper] ✅ Thread Updated : %s → %s", url[:60], date)
        else:
            logger.info("[scraper] ❌ Thread Updated introuvable : %s", url[:60])
        return date

    except Exception as e:
        logger.error("[scraper] Exception scrape_thread_updated_date (%s) : %s", url, e)
        return None


async def enrich_dates_with_fallback(
    session,
    jeux: list[dict],
    rss_date_map: dict[int, str],
    *,
    cookies: Optional[str] = None,
    scrape_delay: float = 2.0,
    progress_callback=None,
) -> dict[int, str]:
    """
    Stratégie hybride pour récupérer les dates de MAJ sur l'ensemble d'un catalogue :

      - Jeux présents dans rss_date_map  → date extraite du RSS, aucune requête HTTP.
      - Jeux absents du RSS              → scraping de la page du thread.

    Paramètres
    ----------
    session           : aiohttp.ClientSession ouvert par l'appelant.
    jeux              : Liste de dicts {"site_id": int, "nom_url": str, ...}.
    rss_date_map      : {site_id: "YYYY-MM-DDTHH:MM:SS+00:00"} issu du flux RSS.
    cookies           : Cookie xf_session optionnel pour les jeux 18+.
    scrape_delay      : Délai en secondes entre chaque scrape (défaut 2 s).
    progress_callback : Coroutine async(current, total, site_id, date) optionnelle.

    Retourne
    --------
    {site_id: "YYYY-MM-DD"} pour tous les jeux dont la date a pu être trouvée.
    """
    result: dict[int, str] = {}
    to_scrape: list[dict] = []

    # Phase 1 : dates disponibles dans le RSS (sans requête HTTP)
    for jeu in jeux:
        sid = jeu.get("site_id")
        if not sid:
            continue
        rss_iso = rss_date_map.get(int(sid))
        if rss_iso:
            result[int(sid)] = rss_iso[:10]  # tronquer "YYYY-MM-DDTHH:..." → "YYYY-MM-DD"
        else:
            to_scrape.append(jeu)

    logger.info(
        "[scraper] enrich_dates : %d depuis RSS, %d à scraper",
        len(result), len(to_scrape),
    )

    # Phase 2 : scraper les jeux absents du RSS
    total = len(to_scrape)
    for idx, jeu in enumerate(to_scrape, 1):
        sid     = int(jeu.get("site_id", 0))
        nom_url = (jeu.get("nom_url") or "").strip()

        if not nom_url or "f95zone.to" not in nom_url:
            if progress_callback:
                await progress_callback(idx, total, sid, None)
            continue

        date = await scrape_thread_updated_date(session, nom_url, cookies=cookies)
        if date:
            result[sid] = date

        if progress_callback:
            await progress_callback(idx, total, sid, date)

        if idx < total:
            await asyncio.sleep(scrape_delay)

    return result


async def scrape_f95_synopsis(
    session,
    url: str,
    cookies: Optional[str] = None,
) -> tuple[Optional[str], Optional[int]]:
    """
    Scrape le synopsis d'un jeu depuis F95Zone.
    Retourne (synopsis, thread_id_extrait_de_l_url_finale).
    thread_id permet à l'appelant de valider la cohérence avec le site_id attendu.
    """
    if not url or not url.strip():
        logger.warning("[scraper] URL vide fournie")
        return None, None

    url = url.strip()

    if "f95zone.to" not in url.lower():
        logger.warning("[scraper] URL non-F95Zone: %s", url)
        return None, None

    scraped_id: Optional[int] = None

    try:
        headers = _f95_headers_with_cookies(cookies)
        headers.update({
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest":  "document",
            "Sec-Fetch-Mode":  "navigate",
            "Sec-Fetch-Site":  "none",
            "Cache-Control":   "max-age=0",
        })

        logger.info("[scraper] scrape_f95_synopsis: %s", url)

        async with session.get(url, headers=headers, timeout=30) as response:
            final_url  = str(response.url)
            id_str     = extract_f95_thread_id(final_url)
            scraped_id = int(id_str) if id_str else None

            if response.status != 200:
                logger.warning("[scraper] HTTP %d pour %s", response.status, url)
                return None, scraped_id

            html = await response.text()

            if not html or len(html) < 100:
                logger.warning("[scraper] HTML vide ou trop court pour %s", url)
                return None, scraped_id

        soup = BeautifulSoup(html, "html.parser")

        page_title = (soup.find("title") or object()).__dict__.get("string", "") or ""
        if (
            soup.select_one("form.login-form")
            or soup.select_one("input[name='login']")
            or "login" in str(response.url).lower()
            or "Log in" in page_title
        ):
            logger.warning("[scraper] Page de login détectée pour %s — cookies requis", url)
            return None, scraped_id

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
                bb_wrapper = (
                    first_article.select_one(".bbWrapper")
                    or first_article.select_one(".message-body")
                )

        if not bb_wrapper:
            meta_desc = soup.select_one("meta[property='og:description']")
            if meta_desc and meta_desc.get("content"):
                content = meta_desc["content"].strip()
                if len(content) > 50:
                    logger.info("[scraper] Synopsis (meta og:description, %d chars) pour %s", len(content), url)
                    return content, scraped_id
            logger.warning("[scraper] bbWrapper introuvable pour %s", url)
            return None, scraped_id

        for unwanted in bb_wrapper.select(".bbCodeSpoiler, .bbCodeCode, .bbCodeQuote"):
            unwanted.decompose()

        content_html = str(bb_wrapper)

        start_pattern = r'(?:Overview|Synopsis)\s*:?\s*(?:<[^>]+>)*\s*'
        start_match   = re.search(start_pattern, content_html, re.IGNORECASE)

        if start_match:
            content_html = content_html[start_match.end():]
            end_pattern = (
                r'(?:Thread Updated|Installation|Changelog|<b>Update|Developer Notes'
                r'|DOWNLOAD|Genre\s*:|Language\s*:|Version\s*:|OS\s*:|Censored\s*:'
                r'|Release Date\s*:|Developer\s*:|<div class=["\']bbCodeSpoiler|Synopsis\s*:)'
            )
            end_match = re.search(end_pattern, content_html, re.IGNORECASE)
            if end_match:
                content_html = content_html[:end_match.start()]
            synopsis = _html_to_text(content_html)
            if synopsis and len(synopsis) > 30:
                logger.info("[scraper] ✅ Synopsis (Overview/Synopsis marker, %d chars) pour %s", len(synopsis), url)
                return synopsis, scraped_id

        synopsis = _extract_synopsis_from_content_html(str(bb_wrapper))
        if synopsis and len(synopsis) > 30:
            logger.info("[scraper] ✅ Synopsis (_extract_synopsis, %d chars) pour %s", len(synopsis), url)
            return synopsis, scraped_id

        full_text  = _html_to_text(str(bb_wrapper))
        paragraphs = [p.strip() for p in full_text.split("\n\n") if p.strip()]
        kept       = []
        meta_re = re.compile(
            r'^(Version|OS|Language|Censored|Genre|Release Date|Developer'
            r'|Thread Updated|Installation|Changelog|Download|Tags?)\s*[:\-]',
            re.IGNORECASE,
        )
        for para in paragraphs:
            if meta_re.match(para):
                break
            if len(para) > 60:
                kept.append(para)
            if len("\n\n".join(kept)) > 800:
                break

        if kept:
            synopsis = "\n\n".join(kept)
            logger.info("[scraper] ✅ Synopsis (premiers paragraphes, %d chars) pour %s", len(synopsis), url)
            return synopsis, scraped_id

        meta_desc = soup.select_one("meta[property='og:description']")
        if meta_desc and meta_desc.get("content"):
            content = meta_desc["content"].strip()
            if len(content) > 50:
                logger.info("[scraper] ✅ Synopsis (meta og, %d chars) pour %s", len(content), url)
                return content, scraped_id

        logger.warning("[scraper] ❌ Aucun synopsis trouvé pour %s", url)
        return None, scraped_id

    except Exception as e:
        logger.error("[scraper] Exception lors du scraping de %s: %s", url, e, exc_info=True)
        return None, None


async def scrape_f95_title(session, url: str) -> Optional[str]:
    """Récupère le titre du thread F95 depuis la page (og:title, <title>, .p-title)."""
    if not url or not url.strip():
        return None
    url = url.strip()
    if "f95zone.to" not in url.lower():
        return None
    try:
        headers = {
            "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        async with session.get(url, headers=headers, timeout=15) as response:
            if response.status != 200:
                return None
            html = await response.text()
        if not html or len(html) < 100:
            return None
        soup = BeautifulSoup(html, "html.parser")
        og = soup.select_one("meta[property='og:title']")
        if og and og.get("content"):
            t = og["content"].strip()
            if t:
                if " | F95zone" in t or "| F95zone" in t:
                    t = t.split("|")[0].strip()
                logger.info("[scraper] Titre (og:title) pour %s: %s", url, t[:60])
                return t
        title_tag = soup.find("title")
        if title_tag and title_tag.string:
            t = title_tag.string.strip()
            if t:
                if " | F95zone" in t:
                    t = t.split("|")[0].strip()
                return t
        p_title = soup.select_one(".p-title")
        if p_title:
            t = p_title.get_text(strip=True)
            if t:
                return t
        return None
    except Exception as e:
        logger.error("[scraper] Exception titre pour %s: %s", url, e)
        return None


async def scrape_f95_game_data(
    session,
    url: str,
    cookies: Optional[str] = None,
) -> Optional[dict]:
    """
    Récupère les données complètes d'un jeu (id, name, version, status, tags,
    type, image, synopsis, link, date_maj) depuis F95Zone ou LewdCorner.
    Équivalent de DiscordPublisherDataExtractor.js côté serveur.
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
        id_str    = extract_f95_thread_id(url)
        thread_id = int(id_str, 10) if id_str else 0

        # 2. Nom & version
        name, version = "N/A", "N/A"
        title_el = soup.select_one(".p-title-value")
        if title_el:
            text_parts = []
            for node in title_el.children:
                if isinstance(node, NavigableString):
                    t = str(node).strip()
                    if t:
                        text_parts.append(t)
            full_title    = " ".join(text_parts)
            version_match = re.match(r"(.*?)\s*\[([^\]]+)\]", full_title)
            if version_match:
                name    = version_match.group(1).strip()
                v       = version_match.group(2).strip()
                version = v if v.startswith("[") else f"[{v}]"
            else:
                name = full_title.strip()

        # 3. Premier post / bbWrapper
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
                bb_wrapper = (
                    first_article.select_one(".bbWrapper")
                    or first_article.select_one(".message-body")
                )

        # 4. Image
        base_domain = (
            "https://lewdcorner.com"
            if "lewdcorner.com" in url.lower()
            else "https://f95zone.to"
        )

        def _normalize_image_url(src: str) -> str:
            if not src or not isinstance(src, str):
                return ""
            src = src.strip()
            if not src:
                return ""
            try:
                src = urljoin(base_domain + "/", src)
            except Exception:
                pass
            if src.startswith("//"):
                src = "https:" + src
            # Toujours utiliser attachments (pleine taille)
            if "preview.f95zone.to" in src:
                src = src.replace("preview.f95zone.to", "attachments.f95zone.to")
            if "preview.lewdcorner.com" in src:
                src = src.replace("preview.lewdcorner.com", "attachments.lewdcorner.com")
            if "/thumb/" in src:
                src = src.replace("/thumb/", "/")
            return src

        def _get_img_url_from_tag(tag) -> str:
            raw = (tag.get("data-src") or tag.get("src") or "").strip()
            return _normalize_image_url(raw) if raw else ""

        image = ""
        image_element = (
            soup.select_one("img.bbImage[data-src]")
            or soup.select_one("img.bbImage[src]")
            or soup.select_one("[data-lb-id] img")
        )
        if image_element:
            def _has_lb_container(tag):
                cls = tag.get("class") or []
                return "lbContainer" in (cls if isinstance(cls, list) else [cls])
            container = image_element.find_parent(_has_lb_container)
            zoomer    = container.select_one(".lbContainer-zoomer") if container else None
            raw_src   = (
                (zoomer.get("data-src") if zoomer else None)
                or image_element.get("data-src")
                or image_element.get("src")
                or ""
            )
            image = _normalize_image_url(raw_src) if raw_src else ""
        if not image and bb_wrapper:
            for sel in (
                "img.bbImage[data-src]", "img.bbImage[src]", "img.bbImage",
                "[data-lb-id] img", "img[data-src]",
                "img[src*='attachments']", "img[src*='preview.']", "img",
            ):
                img = bb_wrapper.select_one(sel)
                if img:
                    image = _get_img_url_from_tag(img)
                    if not image and img.get("data-src"):
                        image = _normalize_image_url(img.get("data-src"))
                    if not image and img.get("src"):
                        image = _normalize_image_url(img.get("src"))
                    if image:
                        break
        if not image:
            for img in soup.find_all("img"):
                src = img.get("data-src") or img.get("src") or ""
                if src and ("f95zone" in src or "lewdcorner" in src or "attachments" in src or "preview" in src):
                    image = _normalize_image_url(src)
                    if image:
                        break
        if not image:
            meta_og = soup.select_one("meta[property='og:image']")
            if meta_og and meta_og.get("content"):
                image = _normalize_image_url(meta_og.get("content") or "")

        # 5. Synopsis
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

        # 6. Tags
        tags_els  = soup.select(".js-tagList .tagItem") or soup.select(".tagItem")
        tags_list = [el.get_text(strip=True) for el in tags_els if el.get_text(strip=True)]
        if not tags_list and html:
            tag_list_content = re.search(
                r'<span[^>]*class="[^"]*js-tagList[^"]*"[^>]*>([\s\S]*?)</span>',
                html, re.IGNORECASE | re.DOTALL,
            )
            if tag_list_content:
                block = tag_list_content.group(1)
                for m in re.finditer(r'<a[^>]*class="[^"]*tagItem[^"]*"[^>]*>([\s\S]*?)</a>', block, re.IGNORECASE):
                    raw = m.group(1)
                    if raw:
                        text = re.sub(r"\s+", " ", re.sub(r"<[^>]*>", "", raw)).strip()
                        if text and text not in tags_list:
                            tags_list.append(text)
            if not tags_list:
                for m in re.finditer(r'<a[^>]*class="[^"]*tagItem[^"]*"[^>]*>([\s\S]*?)</a>', html, re.IGNORECASE):
                    raw = m.group(1)
                    if raw:
                        text = re.sub(r"\s+", " ", re.sub(r"<[^>]*>", "", raw)).strip()
                        if text and text not in tags_list:
                            tags_list.append(text)
        tags = ", ".join(tags_list)

        # 7. Statut & type
        status, type_val = "EN COURS", ""
        labels = soup.select(".p-title-value .label")
        for el in labels:
            raw  = (el.get_text() or "").strip()
            text = re.sub(r"[\u2018\u2019\u0027]", "'", raw)
            if not text:
                continue
            if text in _STATUS_MAP:
                status = _STATUS_MAP[text]
            elif text in _TYPE_MAP:
                type_val = _TYPE_MAP[text]
            elif not status or status == "EN COURS":
                if re.search(r"Completed?|Abandoned|On hold", text, re.I):
                    status = (
                        "TERMINÉ"   if re.search(r"Complete", text, re.I) else
                        "ABANDONNÉ" if "Abandoned" in text else
                        "EN PAUSE"
                    )
        if not type_val and soup.find("title"):
            title_str = soup.find("title").get_text() or ""
            if re.search(r"Ren['']Py",        title_str, re.I): type_val = "RenPy"
            elif re.search(r"\bRPGM\b",       title_str, re.I): type_val = "RPGM"
            elif re.search(r"\bUnity\b",      title_str, re.I): type_val = "Unity"
            elif "Unreal Engine" in title_str:                   type_val = "Unreal"
            elif re.search(r"\bFlash\b",      title_str, re.I): type_val = "Flash"
            elif re.search(r"\bHTML\b",       title_str, re.I): type_val = "HTML"
            elif re.search(r"\bQSP\b",        title_str, re.I): type_val = "QSP"
            elif re.search(r"\bOther(s)?\b",  title_str, re.I): type_val = "Autre"

        # 8. Date "Thread Updated" (extraite depuis le HTML déjà chargé — zéro requête supplémentaire)
        date_maj = extract_thread_updated_from_html(html)

        base_url   = "https://lewdcorner.com" if "lewdcorner.com" in url.lower() else "https://f95zone.to"
        link_short = f"{base_url}/threads/{thread_id}" if thread_id else url.split("?")[0]

        out = {
            "id":       thread_id,
            "domain":   "LewdCorner" if "lewdcorner.com" in url.lower() else "F95z",
            "name":     name,
            "version":  version,
            "status":   status,
            "tags":     tags,
            "type":     type_val or "",
            "ac":       False,
            "link":     link_short,
            "image":    image,
            "synopsis": synopsis,
            "f95_date_maj": date_maj,
        }
        logger.info(
            "[scraper] ✅ Données jeu extraites pour %s: name=%s version=%s date_maj=%s",
            url, name[:40], version, date_maj or "N/A",
        )
        return out

    except Exception as e:
        logger.error("[scraper] Exception game_data pour %s: %s", url, e, exc_info=True)
        return None


async def scrape_multiple_synopsis(
    session: aiohttp.ClientSession,
    url_list: list[str],
) -> dict[str, Optional[str]]:
    """
    Scrape plusieurs synopsis séquentiellement.
    Le thread_id de validation est ignoré (usage interne uniquement).
    """
    results = {}
    for url in url_list:
        synopsis, _ = await scrape_f95_synopsis(session, url)
        results[url] = synopsis
        await asyncio.sleep(1.0)
    return results