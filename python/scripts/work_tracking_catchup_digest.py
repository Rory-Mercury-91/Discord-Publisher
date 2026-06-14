"""
Rattrapage manuel des MP de sortie chapitre (suivi d'œuvres / Lectures).

Usage (sur le serveur, depuis mon_projet/) :
    source venv/bin/activate
    python scripts/work_tracking_catchup_digest.py
    python scripts/work_tracking_catchup_digest.py --dry-run
    python scripts/work_tracking_catchup_digest.py --since 2026-06-10 --until 2026-06-12

Par défaut : depuis le 2026-06-10 jusqu'à hier (Europe/Paris).
"""

from __future__ import annotations

import argparse
import asyncio
import datetime
import logging
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

_SCRIPTS_DIR = Path(__file__).resolve().parent
_PYTHON_DIR = _SCRIPTS_DIR.parent
sys.path.insert(0, str(_SCRIPTS_DIR))

load_dotenv(_PYTHON_DIR / "_ignored" / ".env")
load_dotenv(_PYTHON_DIR / ".env")

from supabase_client import _get_supabase, _init_supabase
from work_tracking_refresh import run_work_tracking_catchup_digest, run_work_tracking_yesterday_digest

PARIS_TZ = ZoneInfo("Europe/Paris")
DEFAULT_SINCE = datetime.date(2026, 6, 10)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger("work_tracking")


def _parse_date(raw: str) -> datetime.date:
    try:
        return datetime.date.fromisoformat(raw.strip())
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"Date invalide : {raw!r} (attendu AAAA-MM-JJ)") from exc


def main() -> int:
    yesterday = datetime.datetime.now(PARIS_TZ).date() - datetime.timedelta(days=1)

    parser = argparse.ArgumentParser(
        description="Envoie un MP Discord récap des sorties chapitre manquées.",
    )
    parser.add_argument(
        "--since",
        type=_parse_date,
        default=DEFAULT_SINCE,
        help=f"Date de début incluse (défaut : {DEFAULT_SINCE.isoformat()})",
    )
    parser.add_argument(
        "--until",
        type=_parse_date,
        default=yesterday,
        help=f"Date de fin incluse (défaut : hier = {yesterday.isoformat()})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Affiche le message sans l'envoyer sur Discord",
    )
    parser.add_argument(
        "--yesterday",
        action="store_true",
        help="Envoie le digest standard des sorties de la veille (comme à 09:00)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Avec --yesterday : renvoie même si déjà envoyé aujourd'hui",
    )
    args = parser.parse_args()

    _init_supabase()
    if not _get_supabase():
        logger.error("Supabase indisponible — vérifie SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY")
        return 1

    if args.yesterday:
        if args.dry_run:
            logger.error("--dry-run n'est pas compatible avec --yesterday")
            return 1
        count = asyncio.run(run_work_tracking_yesterday_digest(force=args.force))
        if count == 0:
            logger.info("Aucune sortie pour la veille (ou digest déjà envoyé).")
            return 0
        logger.info("Digest veille envoyé : %d œuvre(s).", count)
        return 0

    count = asyncio.run(
        run_work_tracking_catchup_digest(
            args.since,
            args.until,
            dry_run=args.dry_run,
        )
    )

    if count == 0:
        logger.info("Aucune sortie à rattraper pour cette période.")
        return 0

    action = "simulé" if args.dry_run else "envoyé"
    logger.info("Rattrapage %s : %d œuvre(s).", action, count)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
