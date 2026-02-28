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


def _sync_jeux_to_supabase(jeux: list):
    """Upsert des jeux dans la table f95_jeux (sync, appele en arriere-plan)."""
    sb = _get_supabase()
    if not sb or not jeux:
        return
    try:
        now = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
        rows = []
        for j in jeux:
            rows.append({
                "id":                 j.get("id"),
                "site_id":            j.get("site_id"),
                "site":               j.get("site"),
                "nom_du_jeu":         j.get("nom_du_jeu") or "",
                "nom_url":            j.get("nom_url"),
                "version":            j.get("version"),
                "trad_ver":           j.get("trad_ver"),
                "lien_trad":          j.get("lien_trad"),
                "statut":             j.get("statut"),
                "tags":               j.get("tags"),
                "type":               j.get("type"),
                "traducteur":         j.get("traducteur"),
                "traducteur_url":     j.get("traducteur_url"),
                "relecture":          j.get("relecture"),
                "type_de_traduction": j.get("type_de_traduction"),
                "ac":                 str(j.get("ac") or ""),
                "image":              j.get("image"),
                "type_maj":           j.get("type_maj"),
                "date_maj":           j.get("date_maj"),
                "synced_at":          now,
                "updated_at":         now,
            })
        for i in range(0, len(rows), 50):
            sb.table("f95_jeux").upsert(
                rows[i:i + 50],
                on_conflict="id",
                ignore_duplicates=False,
            ).execute()
        logger.info("[supabase] sync_jeux : %d jeux synchronises", len(rows))
    except Exception as e:
        logger.warning("[supabase] sync_jeux erreur : %s", e)


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

    # Autorisations editeur
    try:
        sb.table("allowed_editors").delete().eq("owner_id",  user_id).execute()
        sb.table("allowed_editors").delete().eq("editor_id", user_id).execute()
        results["allowed_editors"] = "ok"
    except Exception as e:
        results["allowed_editors"] = f"erreur: {e}"
        logger.warning("[supabase] delete_account allowed_editors : %s", e)

    # Instructions sauvegardees
    try:
        sb.table("saved_instructions").delete().eq("owner_type", "profile").eq("owner_id", user_id).execute()
        results["saved_instructions"] = "ok"
    except Exception as e:
        results["saved_instructions"] = f"erreur: {e}"
        logger.warning("[supabase] delete_account saved_instructions : %s", e)

    # Templates
    try:
        sb.table("saved_templates").delete().eq("owner_id", user_id).execute()
        results["saved_templates"] = "ok"
    except Exception as e:
        results["saved_templates"] = f"erreur: {e}"
        logger.warning("[supabase] delete_account saved_templates : %s", e)

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
