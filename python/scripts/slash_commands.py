"""
Commandes slash Discord (/generer-cle, /check_versions, /cleanup, /check_help).
Dependances : config, api_key_auth, supabase_client, version_checker, publisher_bot
Logger       : [publisher]
"""

import os
import asyncio
import logging

import discord

from config import config
from api_key_auth import (
    _api_key_cache,
    _hash_raw_key,
    _generate_raw_key,
    LEGACY_KEY_WARNING,
)
from supabase_client import _revoke_existing_key_sync, _insert_new_key_sync

logger = logging.getLogger("publisher")

# ID du role autorise a utiliser les commandes slash (lu depuis .env)
TRANSLATOR_ROLE_ID = (
    int(os.getenv("TRANSLATOR_ROLE_ID"))
    if os.getenv("TRANSLATOR_ROLE_ID") else 0
)


# ==================== HELPER PERMISSION ====================

async def _user_can_run_checks(interaction: discord.Interaction) -> bool:
    """
    Verifie si l'utilisateur possede le role TRANSLATOR_ROLE_ID.
    Utilise fetch_member pour contourner les problemes de cache.
    """
    if not TRANSLATOR_ROLE_ID or not interaction.guild:
        return False
    try:
        member = await interaction.guild.fetch_member(interaction.user.id)
    except Exception as e:
        logger.warning("[publisher] Impossible de fetch_member pour %s : %s", interaction.user.id, e)
        return False
    if not member:
        return False
    has_role = any(r.id == TRANSLATOR_ROLE_ID for r in member.roles)
    is_owner = member.id == interaction.guild.owner_id
    return bool(has_role or is_owner)


# ==================== COMMANDES ====================

def register_commands(bot):
    """
    Enregistre toutes les commandes slash sur l'instance bot.
    Appele depuis publisher_bot.py apres creation de l'instance bot.
    """

    @bot.tree.command(
        name="generer-cle",
        description="Genere votre cle API personnelle pour publier des traductions",
    )
    async def generer_cle(interaction: discord.Interaction):
        """
        Genere (ou renouvelle) la cle API personnelle d'un traducteur.
        - Reserve aux membres ayant le role TRANSLATOR_ROLE_ID.
        - L'ancienne cle est revoquee immediatement.
        - La nouvelle cle est envoyee en MP uniquement.
        """
        await interaction.response.defer(ephemeral=True)
        user_tag = f"{interaction.user} (id={interaction.user.id})"
        logger.info("[publisher] /generer-cle demande par %s", user_tag)

        if not TRANSLATOR_ROLE_ID:
            logger.error("[publisher] /generer-cle : TRANSLATOR_ROLE_ID non configure")
            await interaction.followup.send(
                "❌ Le bot n'est pas configure (TRANSLATOR_ROLE_ID manquant). Contactez un administrateur.",
                ephemeral=True,
            )
            return

        if not interaction.guild:
            logger.warning("[publisher] /generer-cle hors serveur par %s", user_tag)
            await interaction.followup.send(
                "❌ Cette commande doit etre utilisee depuis un salon sur le serveur.",
                ephemeral=True,
            )
            return

        try:
            member = await interaction.guild.fetch_member(interaction.user.id)
        except Exception as e:
            logger.warning("[publisher] /generer-cle impossible de fetch_member %s : %s", user_tag, e)
            member = None

        if not member:
            await interaction.followup.send(
                "❌ Impossible de verifier vos roles. Assurez-vous d'etre bien membre du serveur.",
                ephemeral=True,
            )
            return

        has_role = any(r.id == TRANSLATOR_ROLE_ID for r in member.roles)
        is_owner = member.id == interaction.guild.owner_id
        if not (has_role or is_owner):
            logger.warning("[publisher] /generer-cle acces refuse pour %s", user_tag)
            await interaction.followup.send(
                "⛔ Vous n'avez pas le role requis pour generer une cle API.",
                ephemeral=True,
            )
            return

        discord_user_id = str(interaction.user.id)
        discord_name    = interaction.user.display_name
        loop            = asyncio.get_event_loop()

        # Revoquer l'ancienne cle
        had_existing = await loop.run_in_executor(None, _revoke_existing_key_sync, discord_user_id)
        _api_key_cache.evict_user(discord_user_id)

        # Generer la nouvelle cle
        raw_key  = _generate_raw_key()
        key_hash = _hash_raw_key(raw_key)
        logger.info("[publisher] /generer-cle generation pour %s (renouvellement=%s)",
                    discord_name, had_existing)

        ok = await loop.run_in_executor(None, _insert_new_key_sync, discord_user_id, discord_name, key_hash)
        if not ok:
            await interaction.followup.send(
                "❌ Erreur lors de la generation de votre cle. Reessayez dans quelques instants.",
                ephemeral=True,
            )
            return

        # Envoi en MP
        mp_sent = False
        try:
            dm = await interaction.user.create_dm()
            await dm.send(
                f"🔑 **Votre cle API personnelle**\n\n"
                f"```\n{raw_key}\n```\n"
                f"**Comment l'utiliser :**\n"
                f"Dans l'application → ⚙️ Configuration → Preferences → **Cle d'acces a l'API**\n\n"
                f"⚠️ **Gardez cette cle secrete.** Ne la partagez jamais.\n"
                f"Si elle est compromise, relancez `/generer-cle` pour en obtenir une nouvelle "
                f"(l'ancienne sera automatiquement revoquee).\n\n"
                f"{'🔄 *Votre ancienne cle a ete revoquee.*' if had_existing else ''}"
            )
            mp_sent = True
            logger.info("[publisher] /generer-cle cle envoyee en MP a %s", user_tag)
        except discord.Forbidden:
            logger.warning("[publisher] /generer-cle MP fermes pour %s, fallback ephemere", user_tag)

        if mp_sent:
            msg = (
                f"✅ **Cle API {'renouvelee' if had_existing else 'generee'} avec succes !**\n"
                f"Je vous l'ai envoyee en message prive.\n\n"
                f"{'🔄 Votre ancienne cle a ete revoquee immediatement.' if had_existing else ''}"
            )
        else:
            msg = (
                f"✅ **Cle API {'renouvelee' if had_existing else 'generee'} !**\n"
                f"*(Impossible d'envoyer un MP — activez vos messages prives pour plus de securite)*\n\n"
                f"```\n{raw_key}\n```\n"
                f"⚠️ Copiez cette cle maintenant, elle ne sera plus affichee.\n"
                f"{'🔄 Votre ancienne cle a ete revoquee.' if had_existing else ''}"
            )

        await interaction.followup.send(msg, ephemeral=True)


    @bot.tree.command(
        name="check_versions",
        description="Controle les versions F95 (salon my)",
    )
    async def check_versions(interaction: discord.Interaction):
        """Lance le controle des versions sur le salon my."""
        try:
            await interaction.response.defer(ephemeral=True)
        except Exception:
            pass

        if not await _user_can_run_checks(interaction):
            logger.warning("[publisher] /check_versions refuse pour %s (id=%s)",
                           interaction.user, interaction.user.id)
            await interaction.followup.send(
                "⛔ Permission insuffisante. Cette commande est reservee aux Traducteurs.",
                ephemeral=True,
            )
            return

        logger.info("[publisher] /check_versions lance par %s (id=%s)",
                    interaction.user, interaction.user.id)
        try:
            await interaction.followup.send("⏳ Controle des versions F95 en cours…", ephemeral=True)
        except Exception:
            pass

        try:
            from version_checker import run_version_check_once
            await run_version_check_once()
            logger.info("[publisher] /check_versions termine")
            await interaction.followup.send("✅ Controle termine.", ephemeral=True)
        except Exception as e:
            logger.error("[publisher] /check_versions erreur : %s", e)
            await interaction.followup.send(f"❌ Erreur : {e}", ephemeral=True)


    @bot.tree.command(
        name="cleanup_empty_messages",
        description="Supprime les messages vides dans les threads (sauf metadonnees)",
    )
    async def cleanup_empty_messages_cmd(interaction: discord.Interaction):
        """Lance le nettoyage des messages vides manuellement."""
        try:
            await interaction.response.defer(ephemeral=True)
        except Exception:
            pass

        if not await _user_can_run_checks(interaction):
            logger.warning("[publisher] /cleanup refuse pour %s (id=%s)",
                           interaction.user, interaction.user.id)
            await interaction.followup.send(
                "⛔ Permission insuffisante. Cette commande est reservee aux Traducteurs.",
                ephemeral=True,
            )
            return

        logger.info("[publisher] /cleanup lance par %s (id=%s)",
                    interaction.user, interaction.user.id)
        try:
            await interaction.followup.send("⏳ Nettoyage des messages vides en cours…", ephemeral=True)
        except Exception:
            pass

        try:
            from scheduled_tasks import run_cleanup_empty_messages_once
            await run_cleanup_empty_messages_once()
            logger.info("[publisher] /cleanup termine")
            await interaction.followup.send("✅ Nettoyage termine.", ephemeral=True)
        except Exception as e:
            logger.error("[publisher] /cleanup erreur : %s", e)
            await interaction.followup.send(f"❌ Erreur : {e}", ephemeral=True)


    @bot.tree.command(
        name="check_help",
        description="Affiche la liste des commandes et leur utilite",
    )
    async def check_help(interaction: discord.Interaction):
        """Affiche l'aide personnalisee."""
        try:
            await interaction.response.defer(ephemeral=True)
        except Exception:
            pass

        if not await _user_can_run_checks(interaction):
            logger.warning("[publisher] /check_help refuse pour %s (id=%s)",
                           interaction.user, interaction.user.id)
            await interaction.followup.send("⛔ Permission insuffisante.", ephemeral=True)
            return

        logger.info("[publisher] /check_help consulte par %s (id=%s)",
                    interaction.user, interaction.user.id)

        help_text = (
            "**🧰 Commandes disponibles (Bot Publisher)**\n\n"
            "**🔑 Cle API personnelle**\n"
            "**/generer-cle** — Genere ou renouvelle votre cle API personnelle.\n"
            "Reserve aux membres ayant le role Traducteur. La cle est envoyee en MP.\n"
            "A entrer dans l'application → ⚙️ Configuration → Preferences → **Cle d'acces a l'API**.\n"
            "L'ancienne cle est automatiquement revoquee a chaque renouvellement.\n\n"
            "**🔍 Controle des versions**\n"
            "**/check_versions** — Lance manuellement le controle des versions F95 sur le forum.\n\n"
            "**🧹 Nettoyage**\n"
            "**/cleanup_empty_messages** — Supprime les messages vides dans les threads (sauf metadonnees).\n\n"
            "**ℹ️ Taches automatiques**\n"
            f"• Controle des versions : tous les jours a "
            f"{config.VERSION_CHECK_HOUR:02d}:{config.VERSION_CHECK_MINUTE:02d} (Europe/Paris)\n"
            f"• Nettoyage des messages vides : tous les jours a "
            f"{config.CLEANUP_EMPTY_MESSAGES_HOUR:02d}:{config.CLEANUP_EMPTY_MESSAGES_MINUTE:02d} (Europe/Paris)\n"
            "• Systeme anti-doublon actif (30 jours)\n\n"
            "**ℹ️ Acces**\n"
            "Toutes les commandes sont reservees aux membres ayant le role Traducteur."
        )
        await interaction.followup.send(help_text, ephemeral=True)
