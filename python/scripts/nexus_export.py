"""
Utilitaire d'export/parsing de la base SQLite Nexus.
=====================================================
Expose parse_nexus_db() pour l'endpoint HTTP et le script CLI.

Usage CLI (optionnel, pour générer un fichier JSON depuis le terminal) :
    python nexus_export.py <chemin_db.db> [chemin_sortie.json]
"""

import sys
import json
import sqlite3
from pathlib import Path


# ==================== NORMALISATION ====================

def _normalize_executable_paths(raw) -> list:
    """Normalise chemin_executable Nexus → ExecutablePathEntry[] Publisher."""
    if not raw:
        return []
    if isinstance(raw, str):
        stripped = raw.strip()
        if stripped.startswith(("[", "{")):
            try:
                parsed = json.loads(stripped)
            except (json.JSONDecodeError, ValueError):
                parsed = None
        else:
            parsed = None
        if parsed is None:
            return [{"path": stripped}] if stripped else []
        raw = parsed
    if isinstance(raw, str):
        return [{"path": raw}] if raw.strip() else []
    if isinstance(raw, list):
        result = []
        for item in raw:
            if isinstance(item, str) and item.strip():
                result.append({"path": item.strip()})
            elif isinstance(item, dict):
                path = item.get("path") or item.get("chemin") or ""
                if path and path.strip():
                    result.append({"path": path.strip()})
        return result
    if isinstance(raw, dict):
        path = raw.get("path") or raw.get("chemin") or ""
        return [{"path": path.strip()}] if path.strip() else []
    return []


def _normalize_labels(raw) -> list:
    """Normalise labels Nexus JSON → CollectionLabel[] Publisher."""
    if not raw:
        return []
    if isinstance(raw, str):
        stripped = raw.strip()
        if not stripped:
            return []
        try:
            parsed = json.loads(stripped)
        except (json.JSONDecodeError, ValueError):
            return []
        raw = parsed
    if isinstance(raw, list):
        result = []
        for item in raw:
            if isinstance(item, dict):
                label = item.get("label") or item.get("nom") or ""
                color = item.get("color") or item.get("couleur") or "#6b7280"
                if label and label.strip():
                    result.append({"label": label.strip(), "color": color.strip()})
        return result
    return []


def _build_f95_url(thread_id, raw_url) -> str | None:
    if raw_url and "f95zone.to" in (raw_url or "").lower():
        return raw_url.strip()
    if thread_id:
        return f"https://f95zone.to/threads/thread.{thread_id}/"
    return None


def _dedup_priority(game_site: str | None) -> str:
    s = (game_site or "").upper()
    if "F95" in s:
        return "A"
    if "LEWD" in s:
        return "B"
    return "C"


# ==================== PARSING PRINCIPAL ====================

def parse_nexus_db(db_path: str) -> dict:
    """
    Lit la base SQLite Nexus depuis db_path et retourne un dict :
    {
        "entries":  [...],   # liste de jeux normalisés
        "stats":    {...},   # compteurs
        "warnings": [...]    # alertes éventuelles
    }

    Lève ValueError si le fichier n'est pas une base Nexus valide.
    """
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    warnings = []

    # Vérification table principale
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='adulte_game_games'")
    if not cur.fetchone():
        conn.close()
        raise ValueError(
            "Table 'adulte_game_games' introuvable. "
            "Vérifiez que c'est bien un fichier .db de l'application Nexus."
        )

    # Présence de la table user_data (optionnelle)
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='adulte_game_user_data'")
    has_user_data = bool(cur.fetchone())
    if not has_user_data:
        warnings.append("Table adulte_game_user_data absente — labels, chemins et notes non disponibles.")

    # Récupération
    if has_user_data:
        cur.execute("""
            SELECT
                g.id                    AS game_id,
                g.f95_thread_id,
                g.Lewdcorner_thread_id  AS lewdcorner_thread_id,
                g.titre                 AS title,
                g.game_version,
                g.game_statut,
                g.game_engine,
                g.game_developer,
                g.couverture_url,
                g.tags,
                g.game_site,
                g.lien_f95,
                g.lien_lewdcorner,
                ud.chemin_executable,
                ud.labels,
                ud.notes_privees        AS notes
            FROM adulte_game_games g
            LEFT JOIN adulte_game_user_data ud ON ud.game_id = g.id
            ORDER BY g.id
        """)
    else:
        cur.execute("""
            SELECT
                g.id                    AS game_id,
                g.f95_thread_id,
                g.Lewdcorner_thread_id  AS lewdcorner_thread_id,
                g.titre                 AS title,
                g.game_version,
                g.game_statut,
                g.game_engine,
                g.game_developer,
                g.couverture_url,
                g.tags,
                g.game_site,
                g.lien_f95,
                g.lien_lewdcorner,
                NULL AS chemin_executable,
                NULL AS labels,
                NULL AS notes
            FROM adulte_game_games g
            ORDER BY g.id
        """)

    rows = cur.fetchall()
    conn.close()

    # Dédoublonnage (priorité F95 > Lewdcorner > RAWG)
    seen_f95: dict[int, dict] = {}
    seen_lc:  dict[int, dict] = {}
    skipped_rawg = 0

    for row in rows:
        f95_id    = row["f95_thread_id"]
        lc_id     = row["lewdcorner_thread_id"]
        game_site = row["game_site"] or ""

        # Normalisation des tags (champ TEXT séparé par virgules dans Nexus)
        raw_tags = (row["tags"] or "").strip()
        tags_list = [t.strip() for t in raw_tags.split(",") if t.strip()] if raw_tags else []

        entry = {
            "f95_thread_id":        int(f95_id) if f95_id else None,
            "f95_url":              _build_f95_url(int(f95_id) if f95_id else None, row["lien_f95"]),
            "lewdcorner_thread_id": int(lc_id) if lc_id else None,
            "lewdcorner_url":       (row["lien_lewdcorner"] or "").strip() or None,
            "game_site":            game_site.strip() or None,
            "title":                (row["title"] or "").strip() or None,
            # Données de jeu (scraped_data)
            "game_version":         (row["game_version"] or "").strip() or None,
            "game_statut":          (row["game_statut"] or "").strip() or None,
            "game_engine":          (row["game_engine"] or "").strip() or None,
            "game_developer":       (row["game_developer"] or "").strip() or None,
            "couverture_url":       (row["couverture_url"] or "").strip() or None,
            "tags":                 tags_list,
            # Données utilisateur
            "executable_paths":     _normalize_executable_paths(row["chemin_executable"]),
            "labels":               _normalize_labels(row["labels"]),
            "notes":                (row["notes"] or "").strip() or None,
        }

        if f95_id:
            key = int(f95_id)
            if key not in seen_f95 or _dedup_priority(game_site) < _dedup_priority(seen_f95[key]["game_site"]):
                seen_f95[key] = entry
        elif lc_id:
            key = int(lc_id)
            if key not in seen_lc or _dedup_priority(game_site) < _dedup_priority(seen_lc[key]["game_site"]):
                seen_lc[key] = entry
        else:
            skipped_rawg += 1

    result: list[dict] = list(seen_f95.values())
    for lc_id, entry in seen_lc.items():
        if not any(e["lewdcorner_thread_id"] == lc_id for e in seen_f95.values()):
            result.append(entry)

    result.sort(key=lambda e: (e.get("title") or "").lower())

    if skipped_rawg > 0:
        warnings.append(f"{skipped_rawg} jeu(x) RAWG ignoré(s) (pas d'identifiant F95/Lewdcorner).")

    stats = {
        "total":       len(result),
        "with_f95":    sum(1 for e in result if e["f95_thread_id"]),
        "with_lc":     sum(1 for e in result if not e["f95_thread_id"] and e["lewdcorner_thread_id"]),
        "with_paths":  sum(1 for e in result if e["executable_paths"]),
        "with_labels": sum(1 for e in result if e["labels"]),
        "with_version": sum(1 for e in result if e["game_version"]),
        "with_cover":   sum(1 for e in result if e["couverture_url"]),
    }

    return {"entries": result, "stats": stats, "warnings": warnings}


# ==================== WRAPPER CLI ====================

def export_nexus_games(db_path: str, output_path: str | None = None) -> list:
    """Wrapper CLI : parse + affiche stats + écrit le JSON si output_path fourni."""
    result = parse_nexus_db(db_path)
    entries  = result["entries"]
    stats    = result["stats"]
    warnings = result["warnings"]

    for w in warnings:
        print(f"[AVERTISSEMENT] {w}", file=sys.stderr)

    print(f"[INFO] {stats['total']} jeu(x) exporté(s) après dédoublonnage :")
    print(f"       - {stats['with_f95']} avec f95_thread_id")
    print(f"       - {stats['with_lc']} avec Lewdcorner uniquement")
    print(f"       - {stats['with_paths']} avec chemin exécutable")
    print(f"       - {stats['with_labels']} avec labels personnalisés")

    if output_path:
        out = Path(output_path)
        out.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[OK] Export écrit dans : {out.resolve()}")
    else:
        print(json.dumps(entries, ensure_ascii=False, indent=2))

    return entries


# ==================== POINT D'ENTRÉE CLI ====================

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            "Usage : python nexus_export.py <chemin_db.db> [chemin_sortie.json]\n"
            "Exemple :\n"
            '  python nexus_export.py "D:/Projet GitHub/Nexus/databases/MonUser.db"\n'
            '  python nexus_export.py "D:/Projet GitHub/Nexus/databases/MonUser.db" nexus_export.json',
            file=sys.stderr,
        )
        sys.exit(1)

    db_arg  = sys.argv[1]
    out_arg = sys.argv[2] if len(sys.argv) > 2 else None
    try:
        export_nexus_games(db_arg, out_arg)
    except ValueError as e:
        print(f"[ERREUR] {e}", file=sys.stderr)
        sys.exit(1)
