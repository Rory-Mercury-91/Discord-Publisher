"""
Taches planifiees Discord ext.tasks (version check, cleanup, sync jeux, dates F95).
Dependances : config, version_checker, forum_manager, supabase_client, scraper, publisher_bot
Logger       : [scheduler]
"""

import asyncio
import logging
import datetime
import random
import os
from zoneinfo import ZoneInfo

import aiohttp
from discord.ext import tasks

from config import config
from supabase_client import _get_supabase, _sync_jeux_to_supabase, _update_date_maj_bulk_sync
from scraper import enrich_dates_with_fallback

logger = logging.getLogger("scheduler")

# URL et cle de l'API externe jeux
F95FR_API_URL = "https://f95fr.duckdns.org/api/jeux"
F95FR_API_KEY = os.getenv("F95FR_API_KEY", "")

# Clés app_config
_KEY_INTERVAL   = "f95_date_refresh_interval_hours"
_KEY_LAST       = "f95_date_last_refresh"
_DEFAULT_HOURS  = 0   # 0 = manuel uniquement (configurable depuis l'UI d'enrichissement)
RSS_URL_GAMES   = "https://f95zone.to/sam/latest_alpha/latest_data.php?cmd=rss&cat=games&rows=90"
_PLACEHOLDER_DATE = "2020-01-01"
# ── Fonction complète : _fetch_rss_date_map ───────────────────────────────────

async def _fetch_rss_date_map(session: aiohttp.ClientSession) -> dict[int, str]:
    """
    Récupère le flux RSS F95Zone et retourne {site_id: "YYYY-MM-DD"}.
    Couvre les ~90 jeux les plus récemment mis à jour.
    Retourne {} en cas d'erreur (non bloquant).
    """
    import re as _re
    import xml.etree.ElementTree as ET
    from email.utils import parsedate_to_datetime

    try:
        async with session.get(
            RSS_URL_GAMES,
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            if resp.status != 200:
                logger.warning("[scheduler] _fetch_rss_date_map : RSS HTTP %d", resp.status)
                return {}
            xml_text = await resp.text(encoding="utf-8", errors="replace")

        root   = ET.fromstring(xml_text)
        result : dict[int, str] = {}

        for item in root.iter("item"):
            raw_item = ET.tostring(item, encoding="unicode")

            # Extraction du lien (nœud texte en RSS 2.0, pas un attribut XML)
            m_link = _re.search(r'<link>([^<]+)</link>', raw_item)
            if not m_link:
                continue
            link = m_link.group(1).strip()

            m_id = _re.search(r'/threads/(?:[^/]*\.)?(\d+)', link)
            if not m_id:
                continue
            tid = int(m_id.group(1))

            pub_raw = (item.findtext("pubDate") or "").strip()
            try:
                pub_date = parsedate_to_datetime(pub_raw).strftime("%Y-%m-%d") if pub_raw else ""
            except Exception:
                pub_date = ""

            if pub_date:
                result[tid] = pub_date

        logger.info("[scheduler] _fetch_rss_date_map : %d dates récupérées", len(result))
        return result

    except ET.ParseError as e:
        logger.warning("[scheduler] _fetch_rss_date_map : XML parse error : %s", e)
        return {}
    except Exception as e:
        logger.warning("[scheduler] _fetch_rss_date_map : exception : %s", e)
        return {}

# ── Tâche complète : rss_date_sync ───────────────────────────────────────────

@tasks.loop(minutes=60)
async def rss_date_sync():
    """
    Toutes les heures :
      1. Fetch le flux RSS F95Zone (~90 jeux récents mis à jour)
      2. Met à jour f95_jeux.f95_date_maj pour les jeux présents dans le flux,
         uniquement si la date RSS est plus récente que celle en base (ou absente)
      3. Met à jour user_collection.f95_date_maj (colonne) + scraped_data (JSONB)
         pour les entrées dont le f95_thread_id est dans le RSS
         et qui ne sont PAS couvertes par f95_jeux

    Complémentaire de configurable_date_refresh (scraping profond) :
      - rss_date_sync           : rapide, 0 requête de scraping, ~90 jeux récents
      - configurable_date_refresh : lent, couvre les jeux jamais apparus dans le RSS
    """
    sb = _get_supabase()
    if not sb:
        logger.debug("[scheduler] rss_date_sync : Supabase indisponible")
        return

    logger.info("[scheduler] rss_date_sync : démarrage")
    now = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
    updated_f95  = 0
    updated_coll = 0

    async with aiohttp.ClientSession() as session:
        rss_map = await _fetch_rss_date_map(session)

    if not rss_map:
        logger.info("[scheduler] rss_date_sync : flux RSS vide ou inaccessible, abandon")
        return

    site_ids = list(rss_map.keys())

    # ── 1. Mise à jour f95_jeux.f95_date_maj ─────────────────────────────────
    try:
        # Charger les dates actuelles pour ne pas régresser
        res = sb.table("f95_jeux") \
            .select("site_id, f95_date_maj") \
            .in_("site_id", site_ids) \
            .execute()

        existing_f95: dict[int, str | None] = {
            int(r["site_id"]): r.get("f95_date_maj")
            for r in (res.data or [])
        }

        for tid, rss_date in rss_map.items():
            current = existing_f95.get(tid)
            # Mise à jour si : colonne vide, placeholder, ou date RSS plus récente
            should_update = (
                current is None
                or str(current) == _PLACEHOLDER_DATE
                or str(current) < rss_date
            )
            if not should_update:
                continue
            try:
                sb.table("f95_jeux").update({
                    "f95_date_maj": rss_date,
                    "updated_at"  : now,
                }).eq("site_id", tid).execute()
                updated_f95 += 1
            except Exception as e:
                logger.debug(
                    "[scheduler] rss_date_sync f95_jeux site_id=%d : %s", tid, e
                )

    except Exception as e:
        logger.warning("[scheduler] rss_date_sync f95_jeux (global) : %s", e)

    # ── 2. Mise à jour user_collection ───────────────────────────────────────
    # Uniquement pour les entrées hors f95_jeux (les autres héritent via enrichissement)
    try:
        # Récupérer les site_ids du RSS qui sont dans f95_jeux
        res_known = sb.table("f95_jeux") \
            .select("site_id") \
            .in_("site_id", site_ids) \
            .execute()
        known_in_f95 = {int(r["site_id"]) for r in (res_known.data or [])}

        # site_ids du RSS absents de f95_jeux (jeux Tampermonkey, manuels hors catalogue)
        uncovered = [tid for tid in site_ids if tid not in known_in_f95]

        if uncovered:
            res_coll = sb.table("user_collection") \
                .select("id, f95_thread_id, f95_date_maj, scraped_data") \
                .in_("f95_thread_id", uncovered) \
                .execute()

            for row in (res_coll.data or []):
                tid      = int(row["f95_thread_id"])
                rss_date = rss_map.get(tid)
                if not rss_date:
                    continue

                current_col = row.get("f95_date_maj")
                should_update = (
                    current_col is None
                    or str(current_col) == _PLACEHOLDER_DATE
                    or str(current_col) < rss_date
                )
                if not should_update:
                    continue

                try:
                    # Mettre à jour la colonne dédiée ET le JSONB (rétrocompat)
                    sd = dict(row.get("scraped_data") or {})
                    sd["f95_date_maj"] = rss_date
                    sb.table("user_collection").update({
                        "f95_date_maj": rss_date,
                        "scraped_data": sd,
                        "updated_at"  : now,
                    }).eq("id", row["id"]).execute()
                    updated_coll += 1
                except Exception as e:
                    logger.debug(
                        "[scheduler] rss_date_sync user_collection id=%s : %s",
                        row["id"], e
                    )

    except Exception as e:
        logger.warning("[scheduler] rss_date_sync user_collection (global) : %s", e)

    logger.info(
        "[scheduler] rss_date_sync terminé : %d f95_jeux + %d user_collection mis à jour "
        "(sur %d entrées dans le RSS)",
        updated_f95, updated_coll, len(rss_map),
    )

# ==================== CLEANUP MESSAGES VIDES ====================

async def run_cleanup_empty_messages_once():
    """
    Supprime les messages vides dans les threads de TOUS les salons configures
    (Mappings, Externes et salon par defaut).
    """
    logger.info("[scheduler] Debut nettoyage global des messages vides")

    from publisher_bot import bot
    from forum_manager import _collect_all_forum_threads, _clean_empty_messages_in_thread

    sb = _get_supabase()
    forum_ids = set()

    if config.FORUM_MY_ID:
        forum_ids.add(str(config.FORUM_MY_ID))

    if sb:
        try:
            r1 = sb.table("translator_forum_mappings").select("forum_channel_id").execute()
            for row in (r1.data or []):
                val = str(row.get("forum_channel_id", "")).strip()
                if val and val != "0":
                    forum_ids.add(val)

            r2 = sb.table("external_translators").select("forum_channel_id").execute()
            for row in (r2.data or []):
                val = str(row.get("forum_channel_id", "")).strip()
                if val and val != "0":
                    forum_ids.add(val)
        except Exception as e:
            logger.warning("[scheduler] Erreur recuperation salons Supabase pour nettoyage : %s", e)

    if not forum_ids:
        logger.warning("[scheduler] Aucun salon trouve pour le nettoyage")
        return

    logger.info("[scheduler] %d salon(s) a analyser pour le nettoyage", len(forum_ids))

    total_deleted = 0

    async with aiohttp.ClientSession() as session:
        for forum_id_str in forum_ids:
            try:
                forum_id = int(forum_id_str)
                forum    = bot.get_channel(forum_id)
                if not forum:
                    logger.warning("[scheduler] Salon %d introuvable ou inaccessible", forum_id)
                    continue

                logger.info("[scheduler] Nettoyage salon : %s (%d)", forum.name, forum_id)
                threads = await _collect_all_forum_threads(forum)
                if not threads:
                    continue

                for idx, thread in enumerate(threads, 1):
                    await asyncio.sleep(0.5 + random.random())
                    n = await _clean_empty_messages_in_thread(session, str(thread.id))
                    total_deleted += n
                    if idx % 10 == 0:
                        logger.info(
                            "[scheduler] [%s] Progression : %d/%d threads traites",
                            forum.name, idx, len(threads),
                        )
            except Exception as e:
                logger.error("[scheduler] Erreur traitement salon %s : %s", forum_id_str, e)

    logger.info(
        "[scheduler] Nettoyage termine : %d message(s) supprime(s) sur %d salon(s)",
        total_deleted, len(forum_ids),
    )


# ==================== TACHES PLANIFIEES ====================

@tasks.loop(
    time=datetime.time(
        hour=config.VERSION_CHECK_HOUR,
        minute=config.VERSION_CHECK_MINUTE,
        tzinfo=ZoneInfo("Europe/Paris"),
    )
)
async def daily_version_check():
    """Controle quotidien automatique des versions F95 a l'heure configuree."""
    logger.info(
        "[scheduler] Lancement controle quotidien versions F95 (%02d:%02d Europe/Paris)",
        config.VERSION_CHECK_HOUR, config.VERSION_CHECK_MINUTE,
    )
    try:
        from version_checker import run_version_check_once
        await run_version_check_once()
    except Exception as e:
        logger.error("[scheduler] Erreur controle quotidien versions : %s", e)


@tasks.loop(
    time=datetime.time(
        hour=config.CLEANUP_EMPTY_MESSAGES_HOUR,
        minute=config.CLEANUP_EMPTY_MESSAGES_MINUTE,
        tzinfo=ZoneInfo("Europe/Paris"),
    )
)
async def daily_cleanup_empty_messages():
    """Nettoyage quotidien des messages vides dans les threads."""
    logger.info(
        "[scheduler] Lancement nettoyage quotidien messages vides (%02d:%02d Europe/Paris)",
        config.CLEANUP_EMPTY_MESSAGES_HOUR, config.CLEANUP_EMPTY_MESSAGES_MINUTE,
    )
    try:
        await run_cleanup_empty_messages_once()
    except Exception as e:
        logger.error("[scheduler] Erreur nettoyage quotidien : %s", e)


@tasks.loop(time=[
    datetime.time(hour=0,  minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=2,  minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=4,  minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=6,  minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=8,  minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=10, minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=12, minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=14, minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=16, minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=18, minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=20, minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=22, minute=30, tzinfo=ZoneInfo("Europe/Paris")),
])
async def sync_jeux_task():
    """Synchronise les jeux depuis f95fr vers Supabase (toutes les 2h a :30 Europe/Paris)."""
    logger.info("[scheduler] Synchronisation jeux f95fr -> Supabase")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                F95FR_API_URL,
                headers={"X-API-KEY": F95FR_API_KEY},
                timeout=aiohttp.ClientTimeout(total=60),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if isinstance(data, list) and data:
                        loop = asyncio.get_event_loop()
                        await loop.run_in_executor(None, _sync_jeux_to_supabase, data)
                        logger.info("[scheduler] %d jeux synchronises dans f95_jeux", len(data))
                    else:
                        logger.warning("[scheduler] Reponse vide ou invalide depuis f95fr")
                else:
                    logger.warning("[scheduler] API f95fr HTTP %d", resp.status)
    except Exception as e:
        logger.error("[scheduler] Erreur sync jeux : %s", e)


@tasks.loop(hours=1)
async def configurable_date_refresh():
    """
    Rafraîchit f95_date_maj (date MAJ jeu sur F95Zone) selon la fréquence
    configurée dans app_config (clé f95_date_refresh_interval_hours).

    RÈGLE DE SÉPARATION :
      - Écrit UNIQUEMENT dans f95_date_maj (date MAJ jeu par le dev sur F95Zone).
      - Ne touche PAS à date_maj (date MAJ traduction, gérée par _sync_jeux_to_supabase).

    Comportement :
      0        → manuel uniquement, tâche inactive.
      1..168   → exécution si (now - last_refresh) >= interval.
    """
    sb = _get_supabase()
    if not sb:
        logger.debug("[scheduler] configurable_date_refresh : Supabase indisponible")
        return

    try:
        # ── 1. Lire la configuration dans app_config ───────────────────────
        res = sb.table("app_config").select("key, value").in_(
            "key", [_KEY_INTERVAL, _KEY_LAST]
        ).execute()
        cfg = {row["key"]: row["value"] for row in (res.data or [])}

        raw_interval = cfg.get(_KEY_INTERVAL)
        interval_hours = int(raw_interval) if raw_interval is not None else _DEFAULT_HOURS

        # ── 2. Fréquence 0 = manuel uniquement, on sort silencieusement ────
        if interval_hours == 0:
            logger.debug("[scheduler] configurable_date_refresh désactivé (interval=0)")
            return

        # ── 3. Vérifier si le délai depuis le dernier passage est écoulé ───
        now = datetime.datetime.now(ZoneInfo("UTC"))
        last_refresh_str = cfg.get(_KEY_LAST)
        if last_refresh_str:
            try:
                last_refresh = datetime.datetime.fromisoformat(last_refresh_str)
                if last_refresh.tzinfo is None:
                    last_refresh = last_refresh.replace(tzinfo=ZoneInfo("UTC"))
                elapsed_h = (now - last_refresh).total_seconds() / 3600
                if elapsed_h < interval_hours:
                    logger.debug(
                        "[scheduler] configurable_date_refresh : prochain passage dans %.1fh",
                        interval_hours - elapsed_h,
                    )
                    return
            except Exception as parse_err:
                logger.warning(
                    "[scheduler] configurable_date_refresh : impossible de parser last_refresh=%r : %s",
                    last_refresh_str, parse_err,
                )

        logger.info(
            "[scheduler] configurable_date_refresh : démarrage (interval=%dh)", interval_hours
        )

        # ── 4. Récupérer les jeux sans date OU non vérifiés depuis interval ─
        cutoff_iso = (now - datetime.timedelta(hours=interval_hours)).isoformat()

        res_jeux = (
            sb.table("f95_jeux")
            .select("site_id, nom_url")
            .or_(f"f95_date_maj.is.null,updated_at.lt.{cutoff_iso}")
            .not_.is_("nom_url", "null")
            .not_.is_("site_id", "null")
            .limit(500)
            .execute()
        )

        jeux = [
            r for r in (res_jeux.data or [])
            if r.get("nom_url") and "f95zone.to" in (r.get("nom_url") or "").lower()
        ]

        if not jeux:
            logger.info("[scheduler] configurable_date_refresh : aucun jeu à traiter")
        else:
            logger.info("[scheduler] configurable_date_refresh : %d jeux à scraper", len(jeux))

            # ── 5. Enrichir les dates via scraping ─────────────────────────
            async with aiohttp.ClientSession() as session:
                date_map = await enrich_dates_with_fallback(
                    session,
                    jeux=jeux,
                    rss_date_map={},    # pas de RSS : on scrape directement
                    scrape_delay=3.0,
                )

            # ── 6. Écrire dans f95_date_maj via _update_date_maj_bulk_sync ──
            if date_map:
                updated = _update_date_maj_bulk_sync(date_map)
                logger.info(
                    "[scheduler] configurable_date_refresh : %d/%d date(s) f95_date_maj mises à jour",
                    updated, len(date_map),
                )
            else:
                logger.info("[scheduler] configurable_date_refresh : aucune date extraite")

        # ── 7. Mettre à jour f95_date_last_refresh dans app_config ─────────
        sb.table("app_config").upsert(
            {"key": _KEY_LAST, "value": now.isoformat()},
            on_conflict="key",
        ).execute()
        logger.info("[scheduler] configurable_date_refresh : f95_date_last_refresh mis à jour → %s", now.isoformat())

    except Exception as e:
        logger.error("[scheduler] configurable_date_refresh erreur : %s", e, exc_info=True)


# ==================== DEMARRAGE ====================

def start_all_tasks():
    """
    Démarre toutes les tâches planifiées au démarrage du bot Publisher.
    """
    if not daily_version_check.is_running():
        daily_version_check.start()
        logger.info(
            "[scheduler] Contrôle versions planifié à %02d:%02d Europe/Paris",
            config.VERSION_CHECK_HOUR, config.VERSION_CHECK_MINUTE,
        )

    if not daily_cleanup_empty_messages.is_running():
        daily_cleanup_empty_messages.start()
        logger.info(
            "[scheduler] Nettoyage messages vides planifié à %02d:%02d Europe/Paris",
            config.CLEANUP_EMPTY_MESSAGES_HOUR, config.CLEANUP_EMPTY_MESSAGES_MINUTE,
        )

    if not sync_jeux_task.is_running():
        sync_jeux_task.start()
        logger.info("[scheduler] Synchronisation jeux planifiée (toutes les 2h à :30)")

    # Suivi RSS → f95_date_maj : toutes les heures, automatique
    if not rss_date_sync.is_running():
        rss_date_sync.start()
        logger.info(
            "[scheduler] Suivi RSS f95_date_maj démarré (toutes les heures)"
        )

    # configurable_date_refresh n'est PAS démarré ici.
    # Il est déclenché manuellement via POST /api/scrape/missing-dates
    # ou en configurant un intervalle > 0 depuis l'UI Enrichissement.
    logger.info(
        "[scheduler] Rafraîchissement dates (scraping profond) : "
        "déclencher manuellement depuis l'UI ou configurer un intervalle > 0"
    )