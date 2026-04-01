import asyncio
import logging
from pathlib import Path

from aiohttp import web

from api_key_auth import _auth_request
from supabase_client import (
    _delete_account_data_sync,
    _get_supabase,
    _transfer_post_ownership_sync,
    _transfer_profile_data_sync,
)

from .middleware import with_cors

logger = logging.getLogger("api")
LOG_FILE = Path(__file__).resolve().parents[2] / "logs" / "bot.log"


async def get_logs(request):
    """Retourne le fichier de logs complet (protégé par clé API)."""
    is_valid, _, _, _ = await _auth_request(request, "/api/logs")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    content = ""
    unique_user_ids = set()
    if LOG_FILE.exists():
        try:
            with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as file_handle:
                all_lines = file_handle.readlines()
                content = "".join(all_lines[-500:])
                for line in all_lines:
                    if "[REQUEST]" in line:
                        parts = line.split(" | ")
                        if len(parts) >= 2:
                            user_id = parts[1].strip()
                            if user_id != "NULL" and len(user_id) >= 32 and "-" in user_id:
                                unique_user_ids.add(user_id)
        except Exception as error:
            logger.warning("[get_logs] Erreur lecture logs: %s", error)
            content = f"[Erreur lecture: {error}]"
    else:
        logger.warning("[get_logs] Fichier log introuvable: %s", LOG_FILE)

    return with_cors(request, web.json_response({
        "ok": True,
        "logs": content,
        "unique_user_ids": list(unique_user_ids),
    }))


async def account_delete(request):
    """Supprime definitivement le compte d'un utilisateur."""
    is_valid, _, _, _ = await _auth_request(request, "/api/account/delete")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    try:
        body = await request.json()
    except Exception:
        return with_cors(request, web.json_response({"ok": False, "error": "Body JSON invalide"}, status=400))

    user_id = (body.get("user_id") or "").strip()
    if not user_id:
        return with_cors(request, web.json_response({"ok": False, "error": "user_id requis"}, status=400))

    logger.info("[api] Suppression compte : user_id=%s", user_id)
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _delete_account_data_sync, user_id)
    if not result["ok"]:
        logger.error("[api] Echec suppression compte : %s", result)
        return with_cors(request, web.json_response(
            {"ok": False, "error": "Echec suppression du compte", "details": result.get("details")},
            status=500,
        ))
    logger.info("[api] Compte supprime : %s", user_id)
    return with_cors(request, web.json_response({"ok": True, "details": result["details"]}))


async def server_action(request):
    """Gestion du serveur Ubuntu — master admin uniquement."""
    import re
    import subprocess as _sp

    is_valid, discord_user_id, discord_name, is_legacy = await _auth_request(request, "/api/server/action")
    if not is_valid or is_legacy or not discord_user_id:
        return with_cors(request, web.json_response({"ok": False, "error": "Accès refusé"}, status=403))

    sb = _get_supabase()
    if sb:
        try:
            res = sb.table("profiles").select("is_master_admin").eq("discord_id", discord_user_id).limit(1).execute()
            if not res.data or not res.data[0].get("is_master_admin"):
                logger.warning("[api] server_action refusé — discord_id=%s non master_admin", discord_user_id)
                return with_cors(request, web.json_response({"ok": False, "error": "Droits insuffisants"}, status=403))
        except Exception as error:
            logger.error("[api] Vérification master_admin : %s", error)
            return with_cors(request, web.json_response({"ok": False, "error": str(error)}, status=500))

    try:
        body = await request.json()
    except Exception:
        return with_cors(request, web.json_response({"ok": False, "error": "JSON invalide"}, status=400))

    action = (body.get("action") or "").strip()
    params = body.get("params") or {}

    def run(*cmd) -> str:
        try:
            r = _sp.run(list(cmd), capture_output=True, text=True, timeout=30)
            return (r.stdout + r.stderr).strip()
        except _sp.TimeoutExpired:
            return "Timeout (30s)"
        except Exception as exc:
            return f"{exc}"

    output = ""

    if action == "service_status":
        output = run("sudo", "systemctl", "status", "discord-bots", "--no-pager", "-l")
    elif action == "service_restart":
        out = run("sudo", "systemctl", "restart", "discord-bots")
        output = out or "Service redémarré avec succès"
    elif action == "service_stop":
        out = run("sudo", "systemctl", "stop", "discord-bots")
        output = out or "Service arrêté"
    elif action == "firewall_status":
        output = run("sudo", "iptables", "-L", "INPUT", "-n", "-v", "--line-numbers")
    elif action == "firewall_reset":
        flush_cmds = [
            ("sudo", "iptables", "-P", "INPUT", "ACCEPT"),
            ("sudo", "iptables", "-P", "FORWARD", "ACCEPT"),
            ("sudo", "iptables", "-P", "OUTPUT", "ACCEPT"),
            ("sudo", "iptables", "-F"),
            ("sudo", "iptables", "-X"),
        ]
        restore_cmds = [
            ("sudo", "iptables", "-I", "INPUT", "1", "-p", "tcp", "--dport", "22", "-j", "ACCEPT"),
            ("sudo", "iptables", "-I", "INPUT", "1", "-p", "tcp", "--dport", "4242", "-j", "ACCEPT"),
            ("sudo", "iptables", "-A", "INPUT", "-p", "tcp", "--dport", "8080", "-j", "ACCEPT"),
            ("sudo", "iptables", "-A", "INPUT", "-p", "icmp", "--icmp-type", "3/4", "-j", "ACCEPT"),
            ("sudo", "iptables", "-A", "INPUT", "-s", "10.0.0.0/16", "-p", "icmp", "--icmp-type", "3", "-j", "ACCEPT"),
            ("sudo", "iptables", "-A", "INPUT", "-i", "lo", "-j", "ACCEPT"),
            ("sudo", "iptables", "-A", "INPUT", "-m", "conntrack", "--ctstate", "ESTABLISHED,RELATED", "-j", "ACCEPT"),
        ]
        post_cmds = [
            ("sudo", "netfilter-persistent", "save"),
            ("sudo", "fail2ban-client", "reload"),
        ]
        parts = []
        for cmd in flush_cmds:
            r = run(*cmd)
            parts.append(f"$ {' '.join(cmd)}\n{r if r else '(ok)'}")
        parts.append("\n-- Restauration des règles ACCEPT de base --")
        for cmd in restore_cmds:
            r = run(*cmd)
            parts.append(f"$ {' '.join(cmd)}\n{r if r else '(ok)'}")
        parts.append("\n-- Sauvegarde + rechargement Fail2ban --")
        for cmd in post_cmds:
            r = run(*cmd)
            parts.append(f"$ {' '.join(cmd)}\n{r if r else '(ok)'}")
        output = "\n".join(parts)
    elif action == "ip_block":
        ips = [i.strip() for i in params.get("ips", []) if i.strip()]
        if not ips:
            return with_cors(request, web.json_response({"ok": False, "error": "Aucune IP fournie"}))
        lines = []
        for ip in ips:
            r = run("sudo", "iptables", "-I", "INPUT", "1", "-s", ip, "-j", "DROP")
            lines.append(f"DROP {ip} : {r or 'ok'}")
        run("sudo", "netfilter-persistent", "save")
        output = "Blocage appliqué :\n" + "\n".join(lines)
    elif action == "ip_unblock":
        ips = [i.strip() for i in params.get("ips", []) if i.strip()]
        if not ips:
            return with_cors(request, web.json_response({"ok": False, "error": "Aucune IP fournie"}))
        lines = []
        for ip in ips:
            r = run("sudo", "iptables", "-D", "INPUT", "-s", ip, "-j", "DROP")
            lines.append(f"Unblock {ip} : {r or 'ok'}")
        run("sudo", "netfilter-persistent", "save")
        output = "Déblocage appliqué :\n" + "\n".join(lines)
    elif action == "ip_list_blocked":
        ipt = run("sudo", "iptables", "-L", "INPUT", "-n", "-v", "--line-numbers")
        drops = [line for line in ipt.splitlines() if "DROP" in line and "icmp-port-unreachable" not in line]
        f2b_raw = run("sudo", "fail2ban-client", "status")
        jail_m = re.search(r"Jail list:\s*(.+)", f2b_raw)
        f2b_section = ""
        if jail_m:
            jails = [j.strip() for j in jail_m.group(1).replace(",", " ").split() if j.strip()]
            f2b_lines = []
            for jail in jails:
                st = run("sudo", "fail2ban-client", "status", jail)
                banned_m = re.search(r"Banned IP list:\s*(.+)", st)
                count_m = re.search(r"Currently banned:\s*(\d+)", st)
                count = count_m.group(1) if count_m else "?"
                banned = (banned_m.group(1).strip() if banned_m else "").split()
                f2b_lines.append(f"[{jail}] {count} banni(e)s")
                for banned_ip in banned:
                    f2b_lines.append(f"  - {banned_ip}")
            f2b_section = "\n".join(f2b_lines)
        output = (
            f"=== IPTABLES DROP ({len(drops)}) ===\n"
            + ("\n".join(drops) if drops else "(aucun blocage manuel)")
            + "\n\n=== FAIL2BAN ===\n"
            + (f2b_section or "(aucune prison active)")
        )
    elif action == "fail2ban_status":
        raw = run("sudo", "fail2ban-client", "status")
        jail_m = re.search(r"Jail list:\s*(.+)", raw)
        parts = [raw]
        if jail_m:
            jails = [j.strip() for j in jail_m.group(1).replace(",", " ").split() if j.strip()]
            for jail in jails:
                st = run("sudo", "fail2ban-client", "status", jail)
                parts.append(f"\n{'-' * 40}\n[{jail}]\n{st}")
        output = "\n".join(parts)
    elif action == "fail2ban_unban":
        ip = (params.get("ip") or "").strip()
        jail = (params.get("jail") or "").strip()
        if not ip:
            return with_cors(request, web.json_response({"ok": False, "error": "IP requise"}))
        if jail:
            output = run("sudo", "fail2ban-client", "set", jail, "unbanip", ip)
            output = output or f"{ip} débannie de [{jail}]"
        else:
            raw = run("sudo", "fail2ban-client", "status")
            jail_m = re.search(r"Jail list:\s*(.+)", raw)
            lines = []
            if jail_m:
                jails = [j.strip() for j in jail_m.group(1).replace(",", " ").split() if j.strip()]
                for jail_name in jails:
                    r = run("sudo", "fail2ban-client", "set", jail_name, "unbanip", ip)
                    lines.append(f"[{jail_name}] : {r or 'ok'}")
            output = f"Tentative unban {ip} dans toutes les prisons :\n" + ("\n".join(lines) or "Aucune prison trouvée")
    elif action == "logs_purge":
        mode = params.get("mode", "both")
        vacuum_time = params.get("vacuum_time", "7d")
        parts = []
        if mode in ("bot", "both"):
            r = run("sudo", "truncate", "-s", "0", str(LOG_FILE))
            parts.append(f"Bot.log vidé : {r or 'OK'}")
        if mode in ("journal", "both"):
            if vacuum_time == "all":
                r1 = run("sudo", "journalctl", "--rotate")
                r2 = run("sudo", "journalctl", "--vacuum-time=1s")
                parts.append(f"Journalctl --rotate : {r1 or 'ok'}")
                parts.append(f"Journalctl --vacuum-time=1s : {r2 or 'OK'}")
            else:
                r = run("sudo", "journalctl", f"--vacuum-time={vacuum_time}")
                parts.append(f"Journalctl vacuum ({vacuum_time}) : {r or 'OK'}")
        output = "\n".join(parts) if parts else "Aucune action effectuée"
    elif action == "api_test":
        port_raw = run("sudo", "ss", "-tunlp")
        port_hits = [line for line in port_raw.splitlines() if "8080" in line]
        health = run("curl", "-s", "--max-time", "10", "http://127.0.0.1:8080/api/publisher/health")
        if not health:
            health = run("wget", "-qO-", "--timeout=10", "http://127.0.0.1:8080/api/publisher/health")
        output = (
            "=== Port 8080 (ss -tunlp) ===\n"
            + ("\n".join(port_hits) if port_hits else "Port 8080 non trouvé")
            + "\n\n=== Health check (localhost) ===\n"
            + (health or "Pas de réponse (service arrêté ?)")
        )
    else:
        return with_cors(request, web.json_response({"ok": False, "error": f"Action inconnue : {action}"}, status=400))

    logger.info("[api] server_action '%s' par %s", action, discord_name or discord_user_id)
    return with_cors(request, web.json_response({"ok": True, "output": output, "error": None}))


async def transfer_ownership(request):
    is_valid, discord_user_id, _, is_legacy = await _auth_request(request, "/api/transfer-ownership")
    if not is_valid or is_legacy or not discord_user_id:
        return with_cors(request, web.json_response({"ok": False, "error": "Accès refusé"}, status=403))

    sb = _get_supabase()
    if not sb:
        return with_cors(request, web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500))

    is_admin = False
    try:
        res = sb.table("profiles").select("is_master_admin").eq("discord_id", discord_user_id).limit(1).execute()
        if res.data and len(res.data) > 0:
            is_admin = bool(res.data[0].get("is_master_admin"))
    except Exception as error:
        logger.error("[api] Vérification master_admin (transfer): %s", error)
        return with_cors(request, web.json_response({"ok": False, "error": str(error)}, status=500))

    try:
        body = await request.json()
    except Exception:
        return with_cors(request, web.json_response({"ok": False, "error": "Body JSON invalide"}, status=400))

    src_discord = (body.get("source_author_discord_id") or "").strip() or None
    src_ext = (body.get("source_author_external_id") or "").strip() or None
    tgt_discord = (body.get("target_author_discord_id") or "").strip() or None
    tgt_ext = (body.get("target_author_external_id") or "").strip() or None
    post_id = (body.get("post_id") or "").strip() or None
    post_ids = body.get("post_ids")
    if isinstance(post_ids, list):
        post_ids = [x for x in post_ids if x]
    else:
        post_ids = None

    if (not src_discord and not src_ext) or (not tgt_discord and not tgt_ext):
        return with_cors(request, web.json_response({"ok": False, "error": "Source et cible requises (discord_id ou external_id)"}, status=400))

    if not is_admin:
        if src_ext:
            return with_cors(request, web.json_response({"ok": False, "error": "Seul un admin peut transférer depuis un traducteur externe"}, status=403))
        if src_discord != discord_user_id:
            return with_cors(request, web.json_response({"ok": False, "error": "Vous ne pouvez transférer que vos propres publications"}, status=403))

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        _transfer_post_ownership_sync,
        src_discord,
        src_ext,
        tgt_discord,
        tgt_ext,
        post_id,
        post_ids,
    )
    if not result.get("ok"):
        status = 404 if result.get("error") == "Post introuvable ou n'appartient pas à l'auteur source" else 400
        return with_cors(request, web.json_response({"ok": False, "error": result.get("error", "Erreur")}, status=status))
    logger.info("[api] Transfert propriété : %d post(s) par %s (admin=%s)", result.get("count", 0), discord_user_id, is_admin)
    return with_cors(request, web.json_response({"ok": True, "count": result.get("count", 0)}))


async def admin_profile_transfer(request):
    is_valid, discord_user_id, _, is_legacy = await _auth_request(request, "/api/admin/profile-transfer")
    if not is_valid or is_legacy or not discord_user_id:
        return with_cors(request, web.json_response({"ok": False, "error": "Accès refusé"}, status=403))

    sb = _get_supabase()
    if not sb:
        return with_cors(request, web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500))

    try:
        res = sb.table("profiles").select("is_master_admin").eq("discord_id", discord_user_id).limit(1).execute()
        is_admin = bool(res.data and len(res.data) > 0 and res.data[0].get("is_master_admin"))
        if not is_admin:
            return with_cors(request, web.json_response({"ok": False, "error": "Droits insuffisants"}, status=403))
    except Exception as error:
        logger.error("[api] Vérification master_admin (profile-transfer): %s", error)
        return with_cors(request, web.json_response({"ok": False, "error": str(error)}, status=500))

    try:
        body = await request.json()
    except Exception:
        return with_cors(request, web.json_response({"ok": False, "error": "Body JSON invalide"}, status=400))

    old_profile_id = (body.get("old_profile_id") or "").strip()
    new_profile_id = (body.get("new_profile_id") or "").strip()
    if not old_profile_id or not new_profile_id:
        return with_cors(request, web.json_response({"ok": False, "error": "old_profile_id et new_profile_id requis"}, status=400))

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _transfer_profile_data_sync, old_profile_id, new_profile_id)
    if not result.get("ok"):
        return with_cors(request, web.json_response({"ok": False, "error": result.get("error", "Erreur migration"), "details": result.get("details")}, status=400))

    logger.info("[api] Migration profil effectuée par %s: %s -> %s", discord_user_id, old_profile_id, new_profile_id)
    return with_cors(request, web.json_response({"ok": True, "details": result.get("details", {})}))


async def get_journal_logs(request):
    is_valid, _, _, _ = await _auth_request(request, "/api/logs/journal")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    try:
        proc = await asyncio.create_subprocess_exec(
            "journalctl",
            "-u",
            "discord-bot-traductions",
            "-n",
            "300",
            "--no-pager",
            "-o",
            "short",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10.0)
        except asyncio.TimeoutError:
            proc.kill()
            return with_cors(request, web.json_response(
                {"ok": False, "error": "Timeout : journalctl a mis trop de temps à répondre"},
                status=500,
            ))
        content = stdout.decode("utf-8", errors="replace")
        return with_cors(request, web.json_response({"ok": True, "logs": content}))
    except FileNotFoundError:
        return with_cors(request, web.json_response(
            {"ok": False, "error": "journalctl non disponible sur ce système"},
            status=500,
        ))
    except Exception as error:
        logger.exception("[api] get_journal_logs : %s", error)
        return with_cors(request, web.json_response({"ok": False, "error": str(error)}, status=500))
