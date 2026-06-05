"""

Rendu minimal des messages suivi d'œuvres (miroir frontend).

Logger : [work_tracking]

"""



from __future__ import annotations



import json
import re



from work_tracking_dates import (

    iso_to_discord_date,
    iso_to_discord_timestamp,

    parse_release_weekdays,

    project_release_date_at_chapter,

    resolve_stored_date_value,

)



WEEKDAY_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]



WORK_WARNING = (

    ":warning: **Note :** L'œuvre n'étant pas complètement gratuite ou disponible sur la plateforme officielle, "

    "vous pouvez retrouver la suite sur le site alternatif mentionné ci-dessus. "

    "*(Attention, la qualité de traduction ou d'image peut varier)*."

)



WORK_TEMPLATE = """# :bookmark: **{title}**



## **Informations générales :**

:dart: **Statut :** *{status_label} {status_emoji}*

:label: **Type :** *{work_type_label}*

:zap: **Genres / Thèmes :** {genres}

:pencil: **Synopsis :**

> {synopsis}



## :chart_with_upwards_trend: **Suivi de publication :**

{progress_block}

{release_block}



## :link: **Liens officiels & Plateformes :**

{links_block}



{warning}

"""





def _parse_chapter(raw: str) -> int | None:

    trimmed = (raw or "").strip()

    if not re.match(r"^\d+$", trimmed):

        return None

    return int(trimmed)





def _format_weekdays_text(weekdays: list[int]) -> str:

    labels = [WEEKDAY_FR[d] for d in sorted(set(weekdays)) if 0 <= d <= 6]

    if not labels:

        return ""

    if len(labels) == 1:

        return labels[0]

    if len(labels) == 2:

        return f"{labels[0]} et {labels[1]}"

    return f"{', '.join(labels[:-1])} et {labels[-1]}"





def _parse_additional_scan_links(wp: dict) -> list[tuple[str, str]]:

    raw = wp.get("additional_scan_links")

    if not raw:

        return []

    if not isinstance(raw, list):

        return []

    pairs: list[tuple[str, str]] = []

    for item in raw:

        if not isinstance(item, dict):

            continue

        label = (item.get("label") or "").strip()

        url = (item.get("link") or "").strip()

        if label and url:

            pairs.append((label, url))

    return pairs





def _has_scan_link(wp: dict) -> bool:

    slabel = (wp.get("scan_site_label") or "").strip()

    surl = (wp.get("scan_site_link") or "").strip()

    if slabel and surl:

        return True

    return len(_parse_additional_scan_links(wp)) > 0





def _normalize_link_url(url: str) -> str:

    return (url or "").strip().lower().rstrip("/")





def _build_links(wp: dict) -> str:

    parts: list[str] = []

    seen: set[str] = set()

    def add(label: str, url: str) -> None:

        label = (label or "").strip()

        url = (url or "").strip()

        if not label or not url:

            return

        key = _normalize_link_url(url)

        if key in seen:

            return

        seen.add(key)

        parts.append(f"[{label}](<{url}>)")

    add(wp.get("official_site_label") or "", wp.get("official_site_link") or "")

    add(wp.get("scan_site_label") or "", wp.get("scan_site_link") or "")

    for label, url in _parse_additional_scan_links(wp):

        add(label, url)

    if not parts:

        return ""

    return f"* {' - '.join(parts)}"





def _resolve_paid_end_date(wp: dict) -> str:

    stored = resolve_stored_date_value(wp.get("date_series_end") or "")

    if stored:

        return stored



    next_ch = _parse_chapter(wp.get("chapter_next_release") or "")

    plafond = _parse_chapter(wp.get("progress_total") or "")

    anchor = resolve_stored_date_value(wp.get("date_next_release") or "")

    if not next_ch or not plafond or not anchor or plafond <= next_ch:

        return ""



    weekdays = parse_release_weekdays(wp.get("release_weekdays"))

    monthly = bool(wp.get("release_monthly"))

    projected = project_release_date_at_chapter(anchor, next_ch, plafond, weekdays, monthly)

    return projected or ""





def _build_progress(wp: dict) -> str:

    status = wp.get("work_status") or "ongoing"

    unit = wp.get("progress_unit") or "chapter"

    current = (wp.get("progress_current") or "").strip()

    total = (wp.get("progress_total") or "").strip()

    season = (wp.get("season_number") or "").strip()

    label = "Tome" if unit == "volume" else "Chapitre"



    if status == "ongoing_paid":

        if not current:

            return "Statut actuel : —"

        return f"Statut actuel : {label} {current} (Dernier disponible gratuitement)"



    if status == "completed":

        end = total or current

        return f":books: **Progression :** Complété ({label} {end})" if end else ":books: **Progression :** Complété"

    if status == "abandoned":

        return f":books: **Progression :** Arrêtée au {label.lower()} {current}" if current else ":books: **Progression :** Arrêtée"

    if status == "season_pause":

        suffix = f" (Fin de Saison {season})" if season else " (Fin de saison)"

        return f":books: **Progression :** {label} {current}{suffix}" if current else f":books: **Progression :** En pause{suffix}"

    if unit == "hybrid":

        scan = (wp.get("progress_scan_current") or "").strip()

        phys = (wp.get("progress_physical_current") or "").strip()

        parts = []

        if scan:

            parts.append(f"Scan chap. {scan}")

        if phys:

            parts.append(f"Physiques : Tome {phys}")

        if parts:

            return f":books: **Progression :** {' | '.join(parts)}"

    if current:

        return f":books: **Progression :** {label} {current}" + (f" / {total}" if total else "")

    return ":books: **Progression :** —"





def _build_release(wp: dict) -> str:

    status = wp.get("work_status") or "ongoing"

    if status in ("completed", "abandoned"):

        return ""



    weekdays = parse_release_weekdays(wp.get("release_weekdays"))

    days_text = _format_weekdays_text(weekdays)

    next_date = iso_to_discord_timestamp(wp.get("date_next_release") or "")

    next_ch = (wp.get("chapter_next_release") or "").strip()

    monthly = bool(wp.get("release_monthly"))



    if status == "season_pause":

        pause_end = iso_to_discord_date(wp.get("date_season_end") or "")

        if pause_end:

            return f":calendar: **Rythme de sortie :** En pause de fin de saison (Dernière publication le {pause_end})"

        return ":calendar: **Rythme de sortie :** En pause de fin de saison"



    if status == "ongoing_paid":

        plafond = (wp.get("progress_total") or "").strip()

        end_raw = _resolve_paid_end_date(wp)

        end_date = iso_to_discord_timestamp(end_raw) if end_raw else ""



        has_next = bool(next_ch and next_date)

        has_end = bool(plafond and end_date)

        if not has_next and not has_end:

            return ""



        lines = [":calendar: **Prochaines disponibilités (gratuite)**"]

        if has_next:

            lines.append(f"* **Prochain chapitre :** {next_ch} — {next_date}")

        if has_end:

            lines.append(f"* **Fin des publications connues :** chapitre {plafond} — {end_date}")

        return "\n".join(lines)



    if days_text and next_date:

        cadence = " du mois" if monthly else ""

        return f":calendar: **Rythme de sortie :** Chaque {days_text}{cadence}, prochaine sortie le {next_date}"

    if next_ch and next_date:

        return f":calendar: **Prochaine disponibilité :** Chapitre {next_ch} le {next_date}"

    return ""





STATUS_META = {

    "ongoing": ("En cours", ":tada:"),

    "ongoing_paid": ("En cours (incomplet)", ":money_with_wings:"),

    "season_pause": ("En pause", ":hourglass:"),

    "completed": ("Terminé", ":white_check_mark:"),

    "abandoned": ("Abandonnée", ":x:"),

}



TYPE_DISPLAY = {

    "webtoon": "WebComic",

    "webcomic": "WebComic",

    "manhua": "Manhua",

    "manhwa": "Manhwa",

    "manga": "Manga",

    "light_novel": "Light Novel",

    "novel": "Roman",

}





def render_work_publication_message(wp: dict) -> str:

    status = wp.get("work_status") or "ongoing"

    status_label, status_emoji = STATUS_META.get(status, ("En cours", ":tada:"))

    work_type = (wp.get("work_type") or "").strip()

    work_type_label = TYPE_DISPLAY.get(work_type, "")

    genres = (wp.get("genres_themes") or "").strip()

    synopsis = (wp.get("synopsis") or "").strip()

    links = _build_links(wp)

    progress = _build_progress(wp)

    release = _build_release(wp)



    warning = WORK_WARNING if _has_scan_link(wp) else ""



    content = WORK_TEMPLATE.format(

        title=(wp.get("title") or "").strip() or "—",

        status_label=status_label,

        status_emoji=status_emoji,

        work_type_label=work_type_label,

        genres=genres,

        progress_block=progress,

        release_block=release,

        links_block=links or "",

        synopsis=synopsis or "—",

        warning=warning,

    )

    if not release:

        content = content.replace("\n\n\n", "\n\n")

    if not work_type_label:

        content = re.sub(r":label: \*\*Type :\*\* \*\*\n?", "", content)

    if not genres:

        content = re.sub(r":zap: \*\*Genres / Thèmes :\*\*.*\n?", "", content)

    if not (wp.get("synopsis") or "").strip():

        content = re.sub(r":pencil: \*\*Synopsis :\*\*\n>.*\n?", "", content)

    if not links:

        content = re.sub(r"## :link: \*\*Liens officiels & Plateformes :\*\*\n\n?", "", content)

    # Discord ne rend pas les séparateurs markdown « --- »
    content = re.sub(r"\n---\n", "\n\n", content)
    content = re.sub(r"\n?---\s*$", "", content.rstrip())

    return content.strip()





def work_publication_to_saved_inputs(wp: dict) -> dict:

    """Synchronise saved_inputs published_posts depuis work_publications."""

    inputs = {

        "Nom_Oeuvre": wp.get("title") or "",

        "Genres_Themes": wp.get("genres_themes") or "",

        "Synopsis_Oeuvre": wp.get("synopsis") or "",

        "Progress_Unit": wp.get("progress_unit") or "chapter",

        "Progress_Current": wp.get("progress_current") or "",

        "Progress_Total": wp.get("progress_total") or "",

        "Progress_Scan_Current": wp.get("progress_scan_current") or "",

        "Progress_Physical_Current": wp.get("progress_physical_current") or "",

        "Release_Weekdays": ",".join(str(d) for d in parse_release_weekdays(wp.get("release_weekdays"))),

        "Release_Monthly": "true" if wp.get("release_monthly") else "false",

        "Chapitre_Suivant": wp.get("chapter_next_release") or "",

        "Date_Suivant": wp.get("date_next_release") or "",

        "Date_Fin": wp.get("date_series_end") or "",

        "Date_Pause_Fin": wp.get("date_season_end") or "",

        "Season_Number": wp.get("season_number") or "",

        "Official_Site_Label": wp.get("official_site_label") or "",

        "Official_Site_Link": wp.get("official_site_link") or "",

        "Scan_Site_Label": wp.get("scan_site_label") or "",

        "Scan_Site_Link": wp.get("scan_site_link") or "",

        "Chapter_Control_Enabled": "true" if wp.get("chapter_control_enabled") else "false",

    }

    extras = _parse_additional_scan_links(wp)

    if extras:

        inputs["Additional_Scan_Links"] = json.dumps(

            [{"label": label, "link": url} for label, url in extras],

            ensure_ascii=False,

        )

    if wp.get("progress_current"):

        inputs["Chapitre_Actuel"] = wp["progress_current"]

    return inputs


