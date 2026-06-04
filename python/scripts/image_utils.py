"""
Utilitaires de conversion et de génération de balises pour les images F95Zone / LewdCorner.
Module sans dépendances externes — importable partout.
"""

import re
from html import escape
from typing import List, Optional

# Extensions reconnues dans les URLs d'images (publication Discord)
_IMAGE_EXTS = r"(?:jpg|jpeg|png|gif|webp|avif|bmp|svg|ico|tiff|tif)"
# Chemin optionnel après l'extension (ex. Fandom/Wikia « …/image.png/revision/latest ») puis query string
_IMAGE_URL_RE = re.compile(
    rf"https?://[^\s<>\"']+\.{_IMAGE_EXTS}(?:/[^\s<>\"'?]+)?(?:\?[^\s<>\"']*)?",
    re.IGNORECASE,
)


# ── Tables de remplacement de domaines ───────────────────────────────────────

_PREVIEW_TO_ATTACH: dict[str, str] = {
    "preview.f95zone.to":     "attachments.f95zone.to",
    "preview.lewdcorner.com": "attachments.lewdcorner.com",
}


# ── Fonctions publiques ───────────────────────────────────────────────────────

def extract_image_urls_from_text(content: str) -> List[str]:
    """
    Extrait les URLs d'images HTTP(S) présentes dans un texte (contenu de post Discord).

    Gère les CDN avec segment de chemin après l'extension, par ex. Fandom/Wikia :
    …/cover.png/revision/latest?cb=…&path-prefix=fr

    >>> url = "https://static.wikia.nocookie.net/x/a.png/revision/latest?cb=1&path-prefix=fr"
    >>> extract_image_urls_from_text("voir " + url)
    ['https://static.wikia.nocookie.net/x/a.png/revision/latest?cb=1&path-prefix=fr']
    """
    if not content:
        return []
    return [m.group(0) for m in _IMAGE_URL_RE.finditer(content)]


def convert_image_url(url: str) -> str:
    """
    Remplace le domaine preview.* par attachments.* dans une URL d'image.
    Idempotent : aucun effet si l'URL est déjà sur attachments ou ne correspond à aucun domaine connu.
    Retourne une chaîne vide si url est None ou vide.

    >>> convert_image_url("https://preview.f95zone.to/2025/05/abc.jpg")
    'https://attachments.f95zone.to/2025/05/abc.jpg'

    >>> convert_image_url("https://attachments.f95zone.to/img.jpg")
    'https://attachments.f95zone.to/img.jpg'

    >>> convert_image_url("")
    ''
    """
    if not url or not isinstance(url, str):
        return ""
    result = url.strip()
    for preview, attach in _PREVIEW_TO_ATTACH.items():
        result = result.replace(preview, attach)
    return result


def image_tag(url: str, alt: str = "", *, convert: bool = True) -> str:
    """
    Génère une balise <img> avec referrerpolicy="no-referrer".

    L'attribut referrerpolicy masque l'origine de la requête, ce qui est
    indispensable pour que les navigateurs acceptent de charger les images
    hébergées sur attachments.f95zone.to depuis un autre domaine.

    Paramètres
    ----------
    url     : URL de l'image (preview ou attachments).
    alt     : Texte alternatif — passer le nom du jeu est recommandé.
    convert : Si True (défaut), applique convert_image_url() avant génération.

    Retourne
    --------
    Chaîne HTML, par exemple :
        <img alt="Lost Solace" referrerpolicy="no-referrer"
             src="https://attachments.f95zone.to/2025/05/cover.jpg">
    Retourne '' si url est vide.

    >>> image_tag("https://preview.f95zone.to/img.jpg", "Lost Solace")
    '<img alt="Lost Solace" referrerpolicy="no-referrer" src="https://attachments.f95zone.to/img.jpg">'
    """
    if not url or not isinstance(url, str) or not url.strip():
        return ""
    src = convert_image_url(url) if convert else url.strip()
    safe_alt = escape(alt or "", quote=True)
    return f'<img alt="{safe_alt}" referrerpolicy="no-referrer" src="{src}">'


def batch_convert_images(
    rows: list[dict],
    url_field: str = "image",
) -> list[dict]:
    """
    Convertit en masse les URLs d'images dans une liste de dicts (ex. résultat Supabase).
    Modifie le champ `url_field` in-place sur chaque dict et retourne la liste
    pour le chaînage.

    Paramètres
    ----------
    rows      : Liste de dicts contenant un champ URL d'image.
    url_field : Nom du champ à convertir (défaut : "image").

    Usage typique après _fetch_all_jeux_sync() :
        jeux = batch_convert_images(jeux)

    >>> batch_convert_images([{"image": "https://preview.f95zone.to/a.jpg", "nom": "X"}])
    [{'image': 'https://attachments.f95zone.to/a.jpg', 'nom': 'X'}]
    """
    for row in rows:
        raw: str = row.get(url_field) or ""
        if raw:
            row[url_field] = convert_image_url(raw)
    return rows