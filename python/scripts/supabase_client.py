"""
Client Supabase + toutes les operations CRUD (fonctions sync).
Dependances : config
Logger       : [supabase]
"""

import os
import json
import time
import logging
import datetime
from typing import Optional, Dict
from zoneinfo import ZoneInfo

from config import config
from f95_public_api_client import map_public_games_to_legacy_rows

logger = logging.getLogger("supabase")

try:
    from supabase import create_client
    _SUPABASE_AVAILABLE = True
except ImportError:
    _SUPABASE_AVAILABLE = False
    logger.warning("[supabase] Module supabase non installe")

_supabase_client = None


# ==================== INIT ====================

def _init_supabase():
    """Initialise le client Supabase au demarrage (appele via run_in_executor)."""
    global _supabase_client
    if not _SUPABASE_AVAILABLE:
        return None
    url = (os.getenv("SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or "").strip()
    if not url or not key:
        logger.info("[supabase] Non configure (URL ou KEY manquants)")
        return None
    try:
        _supabase_client = create_client(url, key)
        logger.info("[supabase] Client initialise")
        return _supabase_client
    except Exception as e:
        logger.warning("[supabase] Echec initialisation : %s", e)
        return None


def _get_supabase():
    """Retourne le client Supabase (deja initialise au demarrage)."""
    return _supabase_client


# ==================== PUBLISHED POSTS ====================

def _fetch_post_by_thread_id_sync(thread_id) -> Optional[Dict]:
    """Recupere la ligne published_posts par thread_id. Retourne None si absent."""
    sb = _get_supabase()
    if not sb:
        return None
    try:
        r = (
            sb.table("published_posts")
            .select("*")
            .eq("thread_id", str(thread_id))
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        if r.data:
            return r.data[0]
    except Exception as e:
        logger.warning("[supabase] fetch_post_by_thread_id (%s) : %s", thread_id, e)
    return None


def _delete_from_supabase_sync(thread_id: str = None, post_id: str = None) -> bool:
    """
    Supprime un post de published_posts par thread_id ou post_id.
    Retourne True si au moins une ligne supprimee.
    """
    sb = _get_supabase()
    if not sb:
        logger.warning("[supabase] Client non initialise (delete)")
        return False
    if not thread_id and not post_id:
        logger.warning("[supabase] delete : aucun identifiant fourni")
        return False
    try:
        if post_id:
            result = sb.table("published_posts").delete().eq("id", post_id).execute()
        else:
            result = sb.table("published_posts").delete().eq("thread_id", str(thread_id)).execute()
        deleted = len(result.data) if result.data else 0
        if deleted > 0:
            logger.info("[supabase] %d post(s) supprime(s) (thread_id=%s, id=%s)", deleted, thread_id, post_id)
            return True
        logger.info("[supabase] Aucun post trouve (thread_id=%s, id=%s)", thread_id, post_id)
        return False
    except Exception as e:
        logger.error("[supabase] Erreur delete : %s", e)
        return False


def _norm_forum_channel_id(forum_channel_id) -> str:
    return str(forum_channel_id or "").strip()


def _profile_can_post_on_forum_sync(profile_id: str, forum_channel_id: str) -> bool:
    """Vérifie si un profil peut publier sur un salon forum (mapping, grant ou éditeur)."""
    sb = _get_supabase()
    if not sb or not profile_id or not forum_channel_id:
        return False
    forum = _norm_forum_channel_id(forum_channel_id)
    if not forum:
        return False
    try:
        prof = (
            sb.table("profiles")
            .select("is_master_admin")
            .eq("id", profile_id)
            .limit(1)
            .execute()
        )
        if prof.data and prof.data[0].get("is_master_admin"):
            return True

        own_map = (
            sb.table("translator_forum_mappings")
            .select("id")
            .eq("profile_id", profile_id)
            .eq("forum_channel_id", forum)
            .limit(1)
            .execute()
        )
        if own_map.data:
            return True

        grant = (
            sb.table("forum_post_grants")
            .select("id")
            .eq("profile_id", profile_id)
            .eq("forum_channel_id", forum)
            .limit(1)
            .execute()
        )
        if grant.data:
            return True

        editors = (
            sb.table("allowed_editors")
            .select("owner_id")
            .eq("editor_id", profile_id)
            .execute()
        )
        owner_ids = [r["owner_id"] for r in (editors.data or []) if r.get("owner_id")]
        if owner_ids:
            owner_maps = (
                sb.table("translator_forum_mappings")
                .select("id")
                .in_("profile_id", owner_ids)
                .eq("forum_channel_id", forum)
                .limit(1)
                .execute()
            )
            if owner_maps.data:
                return True
        return False
    except Exception as e:
        logger.error("[supabase] _profile_can_post_on_forum_sync : %s", e)
        return False


def _check_forum_post_permission_sync(
    discord_user_id: Optional[str],
    forum_channel_id,
    is_legacy: bool = False,
) -> Dict:
    """Contrôle d'accès publication forum (clé API personnelle)."""
    if is_legacy:
        return {"ok": True}
    if not discord_user_id:
        return {"ok": False, "error": "Cle API sans utilisateur associe — publication refusee"}
    forum = _norm_forum_channel_id(forum_channel_id)
    if not forum:
        return {"ok": False, "error": "Salon forum invalide"}
    sb = _get_supabase()
    if not sb:
        return {"ok": False, "error": "Supabase non configure"}
    try:
        res = (
            sb.table("profiles")
            .select("id, is_master_admin")
            .eq("discord_id", discord_user_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            return {"ok": False, "error": "Profil introuvable pour cette cle API"}
        profile_id = res.data[0]["id"]
        if _profile_can_post_on_forum_sync(profile_id, forum):
            return {"ok": True, "profile_id": profile_id}
        return {
            "ok": False,
            "error": "Vous n'avez pas l'autorisation de publier sur ce salon forum. Contactez un administrateur.",
        }
    except Exception as e:
        logger.error("[supabase] _check_forum_post_permission_sync : %s", e)
        return {"ok": False, "error": str(e)}


def _list_forum_post_grants_sync(profile_id: Optional[str] = None) -> Dict:
    sb = _get_supabase()
    if not sb:
        return {"ok": False, "error": "Supabase non configure"}
    try:
        q = sb.table("forum_post_grants").select(
            "id, profile_id, forum_channel_id, created_at, granted_by_profile_id"
        )
        if profile_id:
            q = q.eq("profile_id", profile_id.strip())
        res = q.order("created_at", desc=True).execute()
        return {"ok": True, "grants": res.data or []}
    except Exception as e:
        err = str(e)
        if "forum_post_grants" in err and ("does not exist" in err or "PGRST205" in err):
            return {"ok": False, "error": "Table forum_post_grants absente — executez la migration Supabase"}
        logger.error("[supabase] _list_forum_post_grants_sync : %s", e)
        return {"ok": False, "error": err}


def _list_known_forum_channels_sync() -> Dict:
    sb = _get_supabase()
    if not sb:
        return {"ok": False, "error": "Supabase non configure"}
    channels: Dict[str, dict] = {}
    try:
        maps = sb.table("translator_forum_mappings").select(
            "forum_channel_id, profile_id"
        ).execute()
        pseudo_by_id: Dict[str, str] = {}
        profile_ids = list({
            row.get("profile_id")
            for row in (maps.data or [])
            if row.get("profile_id")
        })
        if profile_ids:
            prof_res = (
                sb.table("profiles")
                .select("id, pseudo")
                .in_("id", profile_ids)
                .execute()
            )
            for p in prof_res.data or []:
                pseudo_by_id[p["id"]] = (p.get("pseudo") or "").strip()
        for row in maps.data or []:
            fid = _norm_forum_channel_id(row.get("forum_channel_id"))
            if not fid:
                continue
            pid = row.get("profile_id")
            pseudo = pseudo_by_id.get(pid, "") if pid else ""
            label = f"{pseudo} ({fid})" if pseudo else fid
            channels[fid] = {"forum_channel_id": fid, "label": label}
        exts = sb.table("external_translators").select("forum_channel_id, name").execute()
        for row in exts.data or []:
            fid = _norm_forum_channel_id(row.get("forum_channel_id"))
            if not fid:
                continue
            name = (row.get("name") or "").strip()
            label = f"{name} ({fid})" if name else fid
            if fid not in channels:
                channels[fid] = {"forum_channel_id": fid, "label": label}
        items = sorted(channels.values(), key=lambda x: x["label"].lower())
        return {"ok": True, "forums": items}
    except Exception as e:
        logger.error("[supabase] _list_known_forum_channels_sync : %s", e)
        return {"ok": False, "error": str(e)}


def _add_forum_post_grant_sync(
    profile_id: str,
    forum_channel_id: str,
    granted_by_profile_id: Optional[str] = None,
) -> Dict:
    sb = _get_supabase()
    if not sb:
        return {"ok": False, "error": "Supabase non configure"}
    pid = (profile_id or "").strip()
    forum = _norm_forum_channel_id(forum_channel_id)
    if not pid or not forum:
        return {"ok": False, "error": "profile_id et forum_channel_id requis"}
    try:
        prof = sb.table("profiles").select("id").eq("id", pid).limit(1).execute()
        if not prof.data:
            return {"ok": False, "error": "Profil introuvable"}
        payload = {
            "profile_id": pid,
            "forum_channel_id": forum,
            "granted_by_profile_id": (granted_by_profile_id or "").strip() or None,
        }
        res = sb.table("forum_post_grants").upsert(
            payload,
            on_conflict="profile_id,forum_channel_id",
        ).execute()
        row = res.data[0] if res.data else payload
        return {"ok": True, "grant": row}
    except Exception as e:
        err = str(e)
        if "forum_post_grants" in err and ("does not exist" in err or "PGRST205" in err):
            return {"ok": False, "error": "Table forum_post_grants absente — executez la migration Supabase"}
        logger.error("[supabase] _add_forum_post_grant_sync : %s", e)
        return {"ok": False, "error": err}


def _delete_forum_post_grant_sync(grant_id: str) -> Dict:
    sb = _get_supabase()
    if not sb:
        return {"ok": False, "error": "Supabase non configure"}
    gid = (grant_id or "").strip()
    if not gid:
        return {"ok": False, "error": "id requis"}
    try:
        res = sb.table("forum_post_grants").delete().eq("id", gid).execute()
        if not res.data:
            return {"ok": False, "error": "Autorisation introuvable"}
        return {"ok": True}
    except Exception as e:
        logger.error("[supabase] _delete_forum_post_grant_sync : %s", e)
        return {"ok": False, "error": str(e)}


def _transfer_post_ownership_sync(
    source_author_discord_id: Optional[str] = None,
    source_author_external_id: Optional[str] = None,
    target_author_discord_id: Optional[str] = None,
    target_author_external_id: Optional[str] = None,
    post_id: Optional[str] = None,
    post_ids: Optional[list] = None,
) -> Dict:
    """
    Transfère la propriété d'un, plusieurs ou tous les posts.
    Source : soit source_author_discord_id (profil), soit source_author_external_id (traducteur externe).
    Cible : soit target_author_discord_id, soit target_author_external_id.
    - Si post_ids (liste non vide) : met à jour uniquement ces posts (s'ils appartiennent à la source).
    - Sinon si post_id fourni : met à jour uniquement ce post.
    - Sinon : met à jour tous les posts de la source.
    Pas de re-routage Discord : seul le propriétaire en base est modifié.
    """
    sb = _get_supabase()
    if not sb:
        return {"ok": False, "error": "Supabase non configure"}
    src_discord = (source_author_discord_id or "").strip() or None
    src_ext = (source_author_external_id or "").strip() or None
    tgt_discord = (target_author_discord_id or "").strip() or None
    tgt_ext = (target_author_external_id or "").strip() or None
    if (not src_discord and not src_ext) or (not tgt_discord and not tgt_ext):
        return {"ok": False, "error": "Source et cible requises (discord_id ou external_id)"}
    if src_discord and tgt_discord and src_discord == tgt_discord:
        return {"ok": False, "error": "Source et cible identiques"}
    if src_ext and tgt_ext and src_ext == tgt_ext:
        return {"ok": False, "error": "Source et cible identiques"}
    if not src_discord and not src_ext:
        return {"ok": False, "error": "Source invalide"}
    if src_discord and src_ext:
        return {"ok": False, "error": "Indiquez soit source discord soit source externe, pas les deux"}
    ids_to_use = None
    if post_ids and len(post_ids) > 0:
        ids_to_use = [str(x).strip() for x in post_ids if x]
    elif post_id and (post_id or "").strip():
        ids_to_use = [(post_id or "").strip()]
    try:
        now = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
        payload = {
            "author_discord_id": tgt_discord,
            "author_external_translator_id": tgt_ext,
            "updated_at": now,
        }
        q = sb.table("published_posts").update(payload)
        if ids_to_use:
            q = q.in_("id", ids_to_use)
        if src_discord:
            q = q.eq("author_discord_id", src_discord)
        else:
            q = q.eq("author_external_translator_id", src_ext)
        result = q.execute()
        count = len(result.data) if result.data else 0
        if ids_to_use and count == 0:
            return {"ok": False, "error": "Post(s) introuvable(s) ou n'appartiennent pas à l'auteur source"}
        logger.info("[supabase] Transfert propriete : %d post(s) -> cible discord=%s ext=%s", count, tgt_discord, tgt_ext)
        return {"ok": True, "count": count}
    except Exception as e:
        logger.error("[supabase] Erreur transfert propriete : %s", e)
        return {"ok": False, "error": str(e)}


# ==================== HELPERS ROWS ====================

def _parse_saved_inputs(row: Dict) -> Dict:
    """Retourne saved_inputs comme dict (parse si Supabase renvoie une chaine json)."""
    raw = row.get("saved_inputs")
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw) if raw.strip() else {}
        except Exception:
            return {}
    return {}


def _metadata_from_row(row: Dict, new_game_version: Optional[str] = None) -> Optional[str]:
    """Construit metadata_b64 a partir d'une ligne published_posts."""
    import base64
    saved = _parse_saved_inputs(row)
    version = new_game_version if new_game_version is not None else (saved.get("Game_version") or "")
    metadata = {
        "game_name":         (saved.get("Game_name") or row.get("title") or "").strip(),
        "game_version":      version.strip(),
        "translate_version": (saved.get("Translate_version") or "").strip(),
        "translation_type":  (row.get("translation_type") or "").strip(),
        "is_integrated":     bool(row.get("is_integrated", False)),
        "timestamp":         int(time.time() * 1000),
    }
    try:
        metadata_json = json.dumps(metadata, ensure_ascii=False)
        return base64.b64encode(metadata_json.encode("utf-8")).decode("utf-8")
    except Exception:
        return None


def _normalize_history_row(row: Dict) -> Dict:
    """Garantit les cles snake_case attendues par le frontend."""
    if not row:
        return row
    alias = {
        "threadId":                          "thread_id",
        "messageId":                         "message_id",
        "discordUrl":                        "discord_url",
        "forumId":                           "forum_id",
        "imagePath":                         "image_path",
        "translationType":                   "translation_type",
        "isIntegrated":                      "is_integrated",
        "authorDiscordId":                   "author_discord_id",
        "authorExternalTranslatorId":         "author_external_translator_id",
        "savedInputs":                       "saved_inputs",
        "savedLinkConfigs":                  "saved_link_configs",
        "savedAdditionalTranslationLinks":   "saved_additional_translation_links",
        "savedAdditionalModLinks":           "saved_additional_mod_links",
        "templateId":                        "template_id",
        "createdAt":                         "created_at",
        "updatedAt":                         "updated_at",
    }
    out = dict(row)
    for camel, snake in alias.items():
        if camel in out and snake not in out:
            out[snake] = out.pop(camel)
    return out


# ==================== JEUX ====================

def _fetch_all_jeux_sync() -> list:
    """
    Recupere TOUS les jeux de f95_jeux avec pagination (contourne la limite 1000 Supabase).
    """
    sb = _get_supabase()
    if not sb:
        return []
    PAGE_SIZE = 1000
    all_rows = []
    offset = 0
    while True:
        try:
            res = (
                sb.table("f95_jeux")
                .select("*")
                .order("nom_du_jeu")
                .range(offset, offset + PAGE_SIZE - 1)
                .execute()
            )
            batch = res.data or []
            all_rows.extend(batch)
            logger.debug("[supabase] fetch_all_jeux offset=%d : %d jeux", offset, len(batch))
            if len(batch) < PAGE_SIZE:
                break
            offset += PAGE_SIZE
        except Exception as e:
            logger.warning("[supabase] fetch_all_jeux erreur offset=%d : %s", offset, e)
            break
    logger.info("[supabase] fetch_all_jeux total : %d jeux", len(all_rows))
    return all_rows


def _norm_nom_url(url) -> Optional[str]:
    """Normalise nom_url pour regroupement (sans utiliser nom_du_jeu)."""
    if not url or not isinstance(url, str):
        return None
    u = url.strip().lower()
    if u.endswith("/"):
        u = u[:-1]
    return u if u else None


def _dedupe_jeux_by_site(rows: list) -> list:
    """
    Déduplique visuellement les lignes f95_jeux : même jeu = une seule entrée affichée.

    Clé de regroupement (par priorité) :
      1. (site_id, site) — fiable car le threadId est unique par jeu sur chaque
         plateforme (F95Zone, LewdCorner). Correspond directement au gameId UUID de
         l'API publique : toutes les traductions d'un même jeu partagent le même threadId.
      2. nom_url normalisé — fallback pour les entrées sans site_id (jeux manuels, etc.)
      3. id seul          — dernier recours pour les lignes totalement orphelines.

    Ligne principale : ac='1' (prioritaire) sinon la plus récente par updated_at.
    Autres lignes     → champ "variants" (saisons / traductions alternatives).
    """
    if not rows:
        return []
    from collections import defaultdict
    groups = defaultdict(list)
    for r in rows:
        game_uuid = (r.get("game_uuid") or "").strip()
        sid       = r.get("site_id")
        site      = (r.get("site") or "").strip()

        if game_uuid:
            # Clé la plus fiable : UUID du jeu depuis l'API publique
            # Regroupe toutes les plateformes (F95Zone + LewdCorner) du même jeu
            key = ("uuid", game_uuid)
        elif sid is not None:
            # Fallback : threadId unique par plateforme
            try:
                key = ("sid", int(sid), site)
            except (TypeError, ValueError):
                key = ("sid", sid, site)
        else:
            norm_url = _norm_nom_url(r.get("nom_url"))
            if norm_url:
                key = ("url", norm_url)
            else:
                key = ("orphan", r.get("id"))
        groups[key].append(r)

    out = []
    for key, group in groups.items():
        if not group:
            continue
        # Lignes orphelines sans aucune clé exploitable : renvoyer telles quelles
        if key[0] == "orphan" and key[1] is None:
            out.extend(group)
            continue
        # Trier : ac='1' en premier ; sinon heuristique de complétude
        ac_main  = [r for r in group if str(r.get("ac") or "").strip() == "1"]
        ac_other = [r for r in group if str(r.get("ac") or "").strip() != "1"]

        game_version = (ac_main[0].get("version") if ac_main else (group[0].get("version") if group else "")) or ""

        def _sort_key(r: dict, gv: str = game_version) -> tuple:
            """Tri décroissant : score complétude, date_maj, updated_at."""
            trad = (r.get("trad_ver") or "").strip()
            # trad_ver == version → traduction complète (score 2)
            # trad_ver non vide   → traduction partielle (score 1)
            completeness = 2 if gv and trad == gv else (1 if trad else 0)
            date_maj = r.get("date_maj")     or "0"
            updated  = r.get("updated_at")   or "0"
            return (completeness, date_maj, updated)

        ac_main.sort(key=_sort_key, reverse=True)
        ac_other.sort(key=_sort_key, reverse=True)
        group_sorted = ac_main + ac_other
        primary = group_sorted[0] if group_sorted else group[0]
        variants = (group_sorted[1:] if len(group_sorted) > 1 else [])

        variant_payload = []
        for v in variants:
            variant_payload.append({
                "id": v.get("id"),
                "trad_ver": v.get("trad_ver"),
                "lien_trad": v.get("lien_trad"),
                "type_de_traduction": v.get("type_de_traduction"),
                "nom_url": v.get("nom_url"),
                "traducteur": v.get("traducteur"),
                "traducteur_url": v.get("traducteur_url"),
                "version": v.get("version"),
                "statut": v.get("statut"),
            })

        merged = dict(primary)
        merged["variants"] = variant_payload
        out.append(merged)

    return out


def _normalize_legacy_site_labels(sb) -> None:
    """
    Corrige en base les anciennes valeurs du champ 'site' héritées de l'API précédente.
    Exemples : 'F95z' → 'F95Zone', 'LewdCorner' reste inchangé.
    S'exécute silencieusement après chaque sync depuis l'API publique.
    """
    from f95_public_api_client import _SITE_LEGACY_ALIASES
    for old_val, new_val in _SITE_LEGACY_ALIASES.items():
        try:
            res = sb.table("f95_jeux").update({"site": new_val}).eq("site", old_val).execute()
            fixed = len(res.data) if res.data else 0
            if fixed:
                logger.info(
                    "[supabase] normalize_site_labels : %d lignes '%s' → '%s'",
                    fixed, old_val, new_val,
                )
        except Exception as exc:
            logger.warning(
                "[supabase] normalize_site_labels '%s' → '%s' : %s", old_val, new_val, exc
            )


def _jeux_cache_looks_stale(rows: list) -> bool:
    """
    Détecte un cache Supabase incomplet (version jeu présente mais champs trad absents).
    Arrive souvent après une migration API ou une sync échouée.
    """
    if not rows or len(rows) < 50:
        return False
    with_version = sum(1 for r in rows if str(r.get("version") or "").strip())
    with_trad    = sum(1 for r in rows if str(r.get("trad_ver") or "").strip())
    with_statut  = sum(1 for r in rows if str(r.get("statut") or "").strip())
    if with_version < 50:
        return False
    trad_ratio   = with_trad / with_version
    statut_ratio = with_statut / with_version
    return trad_ratio < 0.25 and statut_ratio < 0.25


def _sync_jeux_to_supabase(
    jeux: list,
    translator_map: dict | None = None,
    update_type_by_game_id: dict | None = None,
):
    """
    Upsert des jeux dans la table f95_jeux (sync, appelé en arrière-plan).
    translator_map : dict optionnel {translatorId (str UUID) → nom (str)} issu de
                     fetch_public_translators — améliore la résolution des noms.
    """
    import re

    sb = _get_supabase()
    if not sb or not jeux:
        return

    def _extract_id_from_url(url: str) -> Optional[int]:
        """Extrait l'ID numérique d'un thread depuis son URL."""
        if not url:
            return None
        m = re.search(r"/threads/(?:[^/]*\.)?(\d+)", url)
        return int(m.group(1)) if m else None

    def _looks_like_public_game(payload: dict) -> bool:
        if not isinstance(payload, dict):
            return False
        return "threadId" in payload or ("name" in payload and "nom_du_jeu" not in payload)

    def _is_non_empty_text(value) -> bool:
        return isinstance(value, str) and bool(value.strip())

    def _sanitize_text(value):
        """
        Garantit une valeur texte sérialisable (ou None) pour les champs synopsis.
        """
        if value is None:
            return None
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        if isinstance(value, (list, tuple)):
            parts = [str(v).strip() for v in value if v is not None and str(v).strip()]
            joined = " ".join(parts).strip()
            return joined or None
        cleaned = str(value).strip()
        return cleaned or None

    def _load_existing_synopsis(site_ids: list[int]) -> dict[int, dict]:
        """
        Charge synopsis_en/synopsis_fr existants par site_id pour préserver les
        traductions FR déjà validées.
        """
        if not site_ids:
            return {}

        existing_by_site: dict[int, dict] = {}
        chunk_size = 300
        for i in range(0, len(site_ids), chunk_size):
            chunk = site_ids[i:i + chunk_size]
            try:
                res = (
                    sb.table("f95_jeux")
                    .select("site_id, synopsis_en, synopsis_fr, f95_date_maj, updated_at")
                    .in_("site_id", chunk)
                    .execute()
                )
                for row in (res.data or []):
                    raw_site_id = row.get("site_id")
                    if raw_site_id is None:
                        continue
                    try:
                        sid = int(raw_site_id)
                    except Exception:
                        continue
                    previous = existing_by_site.get(sid)
                    if previous is None:
                        existing_by_site[sid] = row
                        continue

                    # Priorité à une ligne qui contient déjà une traduction FR.
                    prev_has_fr = _is_non_empty_text(previous.get("synopsis_fr"))
                    row_has_fr = _is_non_empty_text(row.get("synopsis_fr"))
                    if row_has_fr and not prev_has_fr:
                        existing_by_site[sid] = row
                        continue
                    if row_has_fr == prev_has_fr:
                        prev_updated = str(previous.get("updated_at") or "")
                        row_updated = str(row.get("updated_at") or "")
                        if row_updated > prev_updated:
                            existing_by_site[sid] = row
            except Exception as exc:
                logger.warning("[supabase] lecture synopsis existants (chunk %d): %s", i // chunk_size, exc)
        return existing_by_site

    def _prune_stale_rows_for_sites(site_to_ids: dict[int, set[int]]) -> int:
        """
        Supprime les lignes f95_jeux qui ne sont plus présentes dans la dernière
        synchro pour un site_id donné.
        Objectif: éviter l'accumulation de variantes obsolètes (anciens providers).
        """
        if not site_to_ids:
            return 0

        site_ids = sorted(site_to_ids.keys())
        stale_ids: list[int] = []
        chunk_size = 250
        for i in range(0, len(site_ids), chunk_size):
            chunk = site_ids[i:i + chunk_size]
            try:
                res = (
                    sb.table("f95_jeux")
                    .select("id, site_id")
                    .in_("site_id", chunk)
                    .execute()
                )
                for row in (res.data or []):
                    raw_sid = row.get("site_id")
                    raw_id = row.get("id")
                    if raw_sid is None or raw_id is None:
                        continue
                    try:
                        sid = int(raw_sid)
                        rid = int(raw_id)
                    except Exception:
                        continue
                    keep_ids = site_to_ids.get(sid)
                    if keep_ids is not None and rid not in keep_ids:
                        stale_ids.append(rid)
            except Exception as exc:
                logger.warning("[supabase] prune rows lecture chunk %d: %s", i // chunk_size, exc)

        deleted = 0
        if not stale_ids:
            return deleted

        delete_chunk = 200
        for i in range(0, len(stale_ids), delete_chunk):
            part = stale_ids[i:i + delete_chunk]
            try:
                sb.table("f95_jeux").delete().in_("id", part).execute()
                deleted += len(part)
            except Exception as exc:
                logger.warning("[supabase] prune rows suppression chunk %d: %s", i // delete_chunk, exc)
        return deleted

    try:
        is_public_payload = bool(jeux and _looks_like_public_game(jeux[0]))
        if is_public_payload:
            jeux = map_public_games_to_legacy_rows(
                jeux,
                translator_map,
                update_type_by_game_id,
            )

        now = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
        site_ids = []
        for j in jeux:
            site_id = j.get("site_id")
            try:
                if site_id is not None:
                    site_ids.append(int(site_id))
            except Exception:
                continue
        existing_synopsis = _load_existing_synopsis(sorted(set(site_ids)))

        rows = []
        for j in jeux:
            site_id = j.get("site_id")
            nom_url = (j.get("nom_url") or "").strip() or None
            synopsis_en_in = (j.get("synopsis_en") or j.get("synopsis") or None)
            synopsis_fr_in = j.get("synopsis_fr")

            existing_row = None
            try:
                if site_id is not None:
                    existing_row = existing_synopsis.get(int(site_id))
            except Exception:
                existing_row = None

            existing_synopsis_en = (existing_row or {}).get("synopsis_en")
            existing_synopsis_fr = (existing_row or {}).get("synopsis_fr")

            has_upstream_synopsis = _is_non_empty_text(synopsis_en_in)
            has_upstream_fr = _is_non_empty_text(synopsis_fr_in)
            if is_public_payload and not has_upstream_synopsis:
                # Alignement strict demandé : si la source principale n'a plus de synopsis,
                # on nettoie aussi localement EN/FR pour éviter les données obsolètes.
                synopsis_en_to_save = None
                synopsis_fr_to_save = None
            else:
                # Source API publique : champs catalogue prioritaires sur le cache local.
                if is_public_payload and has_upstream_synopsis:
                    synopsis_en_to_save = synopsis_en_in
                else:
                    synopsis_en_to_save = synopsis_en_in if has_upstream_synopsis else existing_synopsis_en
                if is_public_payload and has_upstream_fr:
                    synopsis_fr_to_save = synopsis_fr_in
                elif _is_non_empty_text(existing_synopsis_fr):
                    synopsis_fr_to_save = existing_synopsis_fr
                else:
                    synopsis_fr_to_save = synopsis_fr_in
            synopsis_en_to_save = _sanitize_text(synopsis_en_to_save)
            synopsis_fr_to_save = _sanitize_text(synopsis_fr_to_save)

            # Validation cohérence site_id ↔ nom_url
            # Si l'ID contenu dans l'URL ne correspond pas au site_id connu,
            # on corrige nom_url plutôt que d'enregistrer une donnée incohérente.
            if site_id and nom_url:
                url_id = _extract_id_from_url(nom_url)
                if url_id and url_id != int(site_id):
                    site = (j.get("site") or "").strip()
                    base = "https://lewdcorner.com" if site == "LewdCorner" else "https://f95zone.to"
                    nom_url_corrige = f"{base}/threads/{site_id}"
                    logger.warning(
                        "[supabase] Incohérence nom_url/site_id pour '%s' (id=%s) : "
                        "URL contenait thread %s, site_id=%s → corrigé en %s",
                        j.get("nom_du_jeu"), j.get("id"), url_id, site_id, nom_url_corrige,
                    )
                    nom_url = nom_url_corrige

            # f95_date_maj : API publique prioritaire, sinon valeur locale non-placeholder
            incoming_f95_date = j.get("f95_date_maj")
            existing_f95_date = (existing_row or {}).get("f95_date_maj") if existing_row else None

            if is_public_payload and incoming_f95_date and incoming_f95_date != "2020-01-01":
                f95_date_to_save = incoming_f95_date
            elif incoming_f95_date and incoming_f95_date != "2020-01-01":
                f95_date_to_save = incoming_f95_date
            elif existing_f95_date and existing_f95_date != "2020-01-01":
                f95_date_to_save = existing_f95_date
            else:
                f95_date_to_save = incoming_f95_date

            rows.append({
                "id"                : j.get("id"),
                "game_uuid"         : j.get("game_uuid") or None,
                "site_id"           : site_id,
                "site"              : j.get("site"),
                "nom_du_jeu"        : j.get("nom_du_jeu") or "",
                "nom_url"           : nom_url,
                "version"           : j.get("version"),
                "trad_ver"          : j.get("trad_ver"),
                "lien_trad"         : j.get("lien_trad"),
                "statut"            : j.get("statut"),
                "tags"              : j.get("tags"),
                "type"              : j.get("type"),
                "traducteur"        : j.get("traducteur"),
                "traducteur_url"    : j.get("traducteur_url"),
                "type_de_traduction": j.get("type_de_traduction"),
                "ac"                : str(j.get("ac") or ""),
                "image"             : j.get("image"),
                "type_maj"          : j.get("type_maj"),
                "date_maj"          : j.get("date_maj"),
                "f95_date_maj"      : f95_date_to_save,
                "synopsis_en"       : synopsis_en_to_save,
                "synopsis_fr"       : synopsis_fr_to_save,
                "synced_at"         : now,
                "updated_at"        : now,
            })

        for i in range(0, len(rows), 50):
            sb.table("f95_jeux").upsert(
                rows[i:i + 50],
                on_conflict="id",
                ignore_duplicates=False,
            ).execute()

        # Nettoyage post-sync: supprimer les anciennes variantes qui n'existent
        # plus dans la source publique pour chaque site_id synchronisé.
        site_to_current_ids: dict[int, set[int]] = {}
        for row in rows:
            raw_sid = row.get("site_id")
            raw_id = row.get("id")
            if raw_sid is None or raw_id is None:
                continue
            try:
                sid = int(raw_sid)
                rid = int(raw_id)
            except Exception:
                continue
            site_to_current_ids.setdefault(sid, set()).add(rid)
        pruned_count = _prune_stale_rows_for_sites(site_to_current_ids)

        logger.info(
            "[supabase] sync_jeux : %d lignes synchronisees, %d ligne(s) obsolète(s) supprimée(s)",
            len(rows),
            pruned_count,
        )

        # Migration des labels site hérités de l'ancienne API (ex. 'F95z' → 'F95Zone')
        # S'exécute uniquement après une sync depuis l'API publique.
        if is_public_payload:
            _normalize_legacy_site_labels(sb)

    except Exception as e:
        logger.warning("[supabase] sync_jeux erreur : %s", e)


def _relink_scraped_entries_to_catalogue(site_ids: list[int]) -> None:
    """
    Pour chaque site_id de la liste, met à jour les entrées user_collection dont :
      - scraped_data.source == "scraping" (ou absent → ancien import)
      - f95_thread_id correspond à un site_id désormais présent dans f95_jeux

    Action : remplace scraped_data par les données actuelles de f95_jeux et
    marque source = "f95_jeux" pour éviter de re-scraper à la prochaine résolution.
    Préserve synopsis_fr local uniquement si l'API publique n'en fournit pas encore.
    """
    sb = _get_supabase()
    if not sb or not site_ids:
        return

    try:
        # Charger les lignes f95_jeux correspondantes
        chunk_size = 200
        jeux_by_site: dict[int, dict] = {}
        for i in range(0, len(site_ids), chunk_size):
            chunk = site_ids[i:i + chunk_size]
            res = sb.table("f95_jeux").select(
                "site_id, nom_du_jeu, nom_url, version, trad_ver, lien_trad, statut, "
                "tags, type, traducteur, traducteur_url, type_de_traduction, ac, image, "
                "synopsis_en, synopsis_fr, f95_date_maj, updated_at"
            ).in_("site_id", chunk).execute()
            for row in (res.data or []):
                sid = row.get("site_id")
                if sid is None:
                    continue
                try:
                    sid = int(sid)
                except (TypeError, ValueError):
                    continue
                # Garder la ligne la plus récente (ou ac='1')
                existing = jeux_by_site.get(sid)
                if existing is None:
                    jeux_by_site[sid] = row
                else:
                    existing_ac  = str(existing.get("ac") or "").strip() == "1"
                    row_ac       = str(row.get("ac") or "").strip() == "1"
                    if row_ac and not existing_ac:
                        jeux_by_site[sid] = row
                    elif row_ac == existing_ac:
                        if (row.get("updated_at") or "") > (existing.get("updated_at") or ""):
                            jeux_by_site[sid] = row

        if not jeux_by_site:
            return

        # Charger les entrées user_collection scrapées pour ces site_ids
        coll_site_ids = list(jeux_by_site.keys())
        for i in range(0, len(coll_site_ids), chunk_size):
            chunk = coll_site_ids[i:i + chunk_size]
            res_coll = sb.table("user_collection").select(
                "id, f95_thread_id, scraped_data"
            ).in_("f95_thread_id", chunk).execute()

            now = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
            updated = 0
            for entry in (res_coll.data or []):
                tid = entry.get("f95_thread_id")
                jeu = jeux_by_site.get(tid)
                if not jeu:
                    continue

                sd = entry.get("scraped_data") or {}
                # Toujours rafraîchir les entrées déjà liées au catalogue :
                # elles peuvent contenir des données périmées d'une ancienne version
                # de f95_jeux (ex. mauvaise synopsis avant correction de l'API publique).

                # Préserver synopsis_fr local si le catalogue n'en a pas encore
                synopsis_fr_preserved = None
                if isinstance(sd, dict):
                    scraped_fr = (sd.get("synopsis_fr") or "").strip()
                    catalogue_fr = (jeu.get("synopsis_fr") or "").strip()
                    if scraped_fr and not catalogue_fr:
                        synopsis_fr_preserved = scraped_fr

                new_sd = {
                    "name"              : jeu.get("nom_du_jeu"),
                    "version"           : jeu.get("version"),
                    "image"             : jeu.get("image"),
                    "status"            : jeu.get("statut"),
                    "tags"              : jeu.get("tags"),
                    "type"              : jeu.get("type"),
                    "synopsis"          : jeu.get("synopsis_en"),
                    "synopsis_en"       : jeu.get("synopsis_en"),
                    "synopsis_fr"       : jeu.get("synopsis_fr") or synopsis_fr_preserved,
                    "trad_ver"          : jeu.get("trad_ver"),
                    "lien_trad"         : jeu.get("lien_trad"),
                    "traducteur"        : jeu.get("traducteur"),
                    "traducteur_url"    : jeu.get("traducteur_url"),
                    "type_de_traduction": jeu.get("type_de_traduction"),
                    "f95_date_maj"      : jeu.get("f95_date_maj"),
                    "source"            : "f95_jeux",
                }
                try:
                    sb.table("user_collection").update({
                        "scraped_data": new_sd,
                        "updated_at"  : now,
                    }).eq("id", entry["id"]).execute()
                    updated += 1
                except Exception as upd_err:
                    logger.debug(
                        "[supabase] relink_scraped id=%s : %s", entry["id"], upd_err
                    )

            if updated:
                logger.info(
                    "[supabase] relink_scraped_to_catalogue : %d entrée(s) user_collection "
                    "mises à jour depuis f95_jeux (chunk %d site_ids)",
                    updated, len(chunk),
                )

    except Exception as e:
        logger.warning("[supabase] relink_scraped_to_catalogue erreur : %s", e)


def _update_date_maj_bulk_sync(date_map: dict[int, str]) -> int:
    """
    Met à jour le champ date_maj dans f95_jeux pour une liste de jeux.
    date_map : {site_id: "YYYY-MM-DD"}
    Retourne le nombre de lignes mises à jour avec succès.
    """
    sb = _get_supabase()
    if not sb or not date_map:
        return 0
    ok = 0
    now = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
    for site_id, date_str in date_map.items():
        try:
            sb.table("f95_jeux").update({
                "f95_date_maj":   date_str,
                "updated_at": now,
            }).eq("site_id", site_id).execute()
            ok += 1
        except Exception as e:
            logger.warning("[supabase] _update_date_maj_bulk site_id=%s : %s", site_id, e)
    logger.info("[supabase] _update_date_maj_bulk : %d/%d mis à jour", ok, len(date_map))
    return ok

# ==================== API KEYS ====================

def _update_key_usage_sync(key_hash: str):
    """Met a jour last_used_at + use_count (non bloquant, echec non critique)."""
    sb = _get_supabase()
    if not sb:
        return
    try:
        sb.table("api_keys").update({
            "last_used_at": datetime.datetime.now(ZoneInfo("UTC")).isoformat(),
        }).eq("key_hash", key_hash).execute()
        sb.rpc("increment_key_use_count", {"p_key_hash": key_hash}).execute()
    except Exception as e:
        logger.debug("[supabase] update_key_usage (non critique) : %s", e)


def _revoke_existing_key_sync(discord_user_id: str) -> bool:
    """Revoque la cle active existante d'un utilisateur. Retourne True si une cle revoquee."""
    sb = _get_supabase()
    if not sb:
        logger.warning("[supabase] Client non disponible (revoke_key)")
        return False
    try:
        res = (
            sb.table("api_keys")
            .update({
                "is_active":      False,
                "revoked_at":     datetime.datetime.now(ZoneInfo("UTC")).isoformat(),
                "revoked_reason": "replaced_by_user",
            })
            .eq("discord_user_id", discord_user_id)
            .eq("is_active", True)
            .execute()
        )
        revoked = bool(res.data)
        if revoked:
            logger.info("[supabase] Cle revoquee pour discord_user_id=%s", discord_user_id)
        else:
            logger.info("[supabase] Aucune cle active pour discord_user_id=%s", discord_user_id)
        return revoked
    except Exception as e:
        logger.error("[supabase] revoke_key erreur : %s", e)
        return False


def _insert_new_key_sync(discord_user_id: str, discord_name: str, key_hash: str) -> bool:
    """Insere une nouvelle cle hachee dans Supabase."""
    sb = _get_supabase()
    if not sb:
        logger.warning("[supabase] Client non disponible (insert_key)")
        return False
    try:
        sb.table("api_keys").insert({
            "discord_user_id": discord_user_id,
            "discord_name":    discord_name,
            "key_hash":        key_hash,
            "is_active":       True,
        }).execute()
        logger.info("[supabase] Nouvelle cle inseree pour %s (id=%s)", discord_name, discord_user_id)
        return True
    except Exception as e:
        logger.error("[supabase] insert_key erreur : %s", e)
        return False


# ==================== ACCOUNT ====================

def _delete_account_data_sync(user_id: str) -> dict:
    """
    Supprime toutes les donnees personnelles d'un utilisateur.
    Avant suppression du profil : les published_posts de l'utilisateur sont réattribués
    à un traducteur externe (nom = pseudo) pour conserver l'historique et permettre un retransfert.
    """
    sb = _get_supabase()
    if not sb:
        return {"ok": False, "error": "Client Supabase non initialise"}

    results = {}

    # Passer les published_posts en traducteur externe (garder les posts, auteur = externe)
    try:
        prof = sb.table("profiles").select("discord_id, pseudo").eq("id", user_id).limit(1).execute()
        if prof.data and len(prof.data) > 0:
            row = prof.data[0]
            discord_id = (row.get("discord_id") or "").strip()
            pseudo = (row.get("pseudo") or "").strip() or f"Compte supprimé ({discord_id or user_id})"
            if discord_id:
                ext = sb.table("external_translators").insert({
                    "name": pseudo[:255],
                    "tag_id": None,
                    "forum_channel_id": None,
                }).execute()
                if ext.data and len(ext.data) > 0:
                    ext_id = ext.data[0].get("id")
                    sb.table("published_posts").update({
                        "author_discord_id": None,
                        "author_external_translator_id": ext_id,
                    }).eq("author_discord_id", discord_id).execute()
                    logger.info("[supabase] Compte %s : posts réattribués au traducteur externe %s", user_id, ext_id)
                    results["published_posts_migrated"] = "ok"
    except Exception as e:
        results["published_posts_migrated"] = f"erreur: {e}"
        logger.warning("[supabase] delete_account migration posts -> externe : %s", e)

    # Collection personnelle (user_collection — games ajoutés par l'utilisateur)
    try:
        sb.table("user_collection").delete().eq("owner_id", user_id).execute()
        results["user_collection"] = "ok"
    except Exception as e:
        results["user_collection"] = f"erreur: {e}"
        logger.warning("[supabase] delete_account user_collection : %s", e)

    # Autorisations editeur
    try:
        sb.table("allowed_editors").delete().eq("owner_id",  user_id).execute()
        sb.table("allowed_editors").delete().eq("editor_id", user_id).execute()
        results["allowed_editors"] = "ok"
    except Exception as e:
        results["allowed_editors"] = f"erreur: {e}"
        logger.warning("[supabase] delete_account allowed_editors : %s", e)

    try:
        sb.table("forum_post_grants").delete().eq("profile_id", user_id).execute()
        results["forum_post_grants"] = "ok"
    except Exception as e:
        results["forum_post_grants"] = f"erreur: {e}"
        logger.warning("[supabase] delete_account forum_post_grants : %s", e)

    # owner_data (instructions + templates du profil)
    try:
        sb.table("owner_data").delete().eq("owner_type", "profile").eq("owner_id", user_id).execute()
        results["owner_data"] = "ok"
    except Exception as e:
        results["owner_data"] = f"erreur: {e}"
        logger.warning("[supabase] delete_account owner_data : %s", e)

    # Profil
    try:
        sb.table("profiles").delete().eq("id", user_id).execute()
        results["profile"] = "ok"
    except Exception as e:
        results["profile"] = f"erreur: {e}"
        logger.warning("[supabase] delete_account profile : %s", e)

    # Compte Auth
    try:
        sb.auth.admin.delete_user(user_id)
        results["auth_user"] = "ok"
    except Exception as e:
        results["auth_user"] = f"erreur: {e}"
        logger.error("[supabase] delete_account auth (%s) : %s", user_id, e)

    # Resume
    success_count = sum(1 for s in results.values() if s == "ok")
    total         = len(results)
    fully_deleted = success_count == total

    if fully_deleted:
        logger.info("[supabase] Compte supprime : %s (%d/%d)", user_id, success_count, total)
    else:
        failed = [t for t, s in results.items() if s != "ok"]
        logger.error("[supabase] Suppression incomplete %s (%d/%d) — echecs : %s",
                     user_id, success_count, total, ", ".join(failed))

    return {
        "ok":           results.get("auth_user") == "ok",
        "fully_cleared": fully_deleted,
        "details":      results,
    }


def _transfer_profile_data_sync(old_profile_id: str, new_profile_id: str) -> Dict:
    """
    Transfère les données applicatives d'un profil vers un autre.
    ATTENTION: opération administrative sensible, à appeler uniquement côté serveur.
    """
    sb = _get_supabase()
    if not sb:
        return {"ok": False, "error": "Client Supabase non initialise"}

    old_id = (old_profile_id or "").strip()
    new_id = (new_profile_id or "").strip()
    if not old_id or not new_id:
        return {"ok": False, "error": "old_profile_id et new_profile_id requis"}
    if old_id == new_id:
        return {"ok": False, "error": "old_profile_id et new_profile_id doivent etre differents"}

    try:
        old_prof = sb.table("profiles").select("id").eq("id", old_id).limit(1).execute()
        if not old_prof.data:
            return {"ok": False, "error": f"Profil source introuvable: {old_id}"}
        new_prof = sb.table("profiles").select("id").eq("id", new_id).limit(1).execute()
        if not new_prof.data:
            return {"ok": False, "error": f"Profil cible introuvable: {new_id}"}
    except Exception as e:
        return {"ok": False, "error": f"Verification profils impossible: {e}"}

    details: Dict[str, str] = {}
    now_iso = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
    try:
        # user_collection (conflits sur owner_id + f95_thread_id)
        sb.table("user_collection").delete().eq("owner_id", new_id).execute()
        sb.table("user_collection").update({"owner_id": new_id}).eq("owner_id", old_id).execute()
        details["user_collection"] = "ok"
    except Exception as e:
        details["user_collection"] = f"erreur: {e}"

    try:
        # owner_data (conflits potentiels sur owner_type/owner_id/data_key)
        sb.table("owner_data").delete().eq("owner_type", "profile").eq("owner_id", new_id).execute()
        sb.table("owner_data").update({"owner_id": new_id}).eq("owner_type", "profile").eq("owner_id", old_id).execute()
        details["owner_data"] = "ok"
    except Exception as e:
        details["owner_data"] = f"erreur: {e}"

    try:
        # allowed_editors (owner_id)
        sb.table("allowed_editors").delete().eq("owner_id", new_id).execute()
        sb.table("allowed_editors").update({"owner_id": new_id}).eq("owner_id", old_id).execute()
        details["allowed_editors_owner"] = "ok"
    except Exception as e:
        details["allowed_editors_owner"] = f"erreur: {e}"

    try:
        # allowed_editors (editor_id)
        sb.table("allowed_editors").delete().eq("editor_id", new_id).execute()
        sb.table("allowed_editors").update({"editor_id": new_id}).eq("editor_id", old_id).execute()
        details["allowed_editors_editor"] = "ok"
    except Exception as e:
        details["allowed_editors_editor"] = f"erreur: {e}"

    try:
        # translator_forum_mappings
        sb.table("translator_forum_mappings").delete().eq("profile_id", new_id).execute()
        sb.table("translator_forum_mappings").update({"profile_id": new_id}).eq("profile_id", old_id).execute()
        details["translator_forum_mappings"] = "ok"
    except Exception as e:
        details["translator_forum_mappings"] = f"erreur: {e}"

    try:
        sb.table("forum_post_grants").delete().eq("profile_id", new_id).execute()
        sb.table("forum_post_grants").update({"profile_id": new_id}).eq("profile_id", old_id).execute()
        details["forum_post_grants"] = "ok"
    except Exception as e:
        details["forum_post_grants"] = f"erreur: {e}"

    try:
        # tags
        sb.table("tags").update({"profile_id": new_id}).eq("profile_id", old_id).execute()
        details["tags"] = "ok"
    except Exception as e:
        details["tags"] = f"erreur: {e}"

    try:
        old_row = sb.table("profiles").select("pseudo, discord_id, is_master_admin, list_manager").eq("id", old_id).limit(1).execute()
        new_row = sb.table("profiles").select("pseudo, discord_id, is_master_admin, list_manager").eq("id", new_id).limit(1).execute()
        old_data = (old_row.data or [{}])[0]
        new_data = (new_row.data or [{}])[0]

        def _pick(current, fallback):
            cur = (current or "").strip() if isinstance(current, str) else current
            if isinstance(cur, str) and cur:
                return cur
            return fallback

        profile_payload = {
            "pseudo": _pick(new_data.get("pseudo"), old_data.get("pseudo")),
            "discord_id": _pick(new_data.get("discord_id"), old_data.get("discord_id")),
            "is_master_admin": bool(new_data.get("is_master_admin")) or bool(old_data.get("is_master_admin")),
            "list_manager": bool(new_data.get("list_manager")) or bool(old_data.get("list_manager")),
            "updated_at": now_iso,
        }
        sb.table("profiles").update(profile_payload).eq("id", new_id).execute()
        details["profiles_merge"] = "ok"
    except Exception as e:
        details["profiles_merge"] = f"erreur: {e}"

    try:
        sb.table("profiles").delete().eq("id", old_id).execute()
        details["profiles_delete_old"] = "ok"
    except Exception as e:
        details["profiles_delete_old"] = f"erreur: {e}"

    has_error = any(str(v).startswith("erreur:") for v in details.values())
    if has_error:
        return {"ok": False, "error": "Migration partiellement appliquee", "details": details}
    return {"ok": True, "details": details}
