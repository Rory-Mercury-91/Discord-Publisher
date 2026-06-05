/**
 * useTampermonkeyListener.ts — version complète avec lookup RSS après insertion.
 * Remplace entièrement le fichier existant.
 */

import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from '../authContext';
import { generateManualPseudoId } from './useCollection';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TampermonkeyPayload {
  domain         : string;
  kind?          : string | null;
  id?            : number | string | null;
  name           : string;
  version?       : string | null;
  status?        : string | null;
  game_type?     : string | null;
  tags?          : string | null;
  genres_themes?       : string | null;
  official_site_label? : string | null;
  link?                : string | null;
  image?         : string | null;
  image_data?    : string | null;
  synopsis?      : string | null;
  f95_date_maj?  : string | null;
}

function isWorkTrackingImport(payload: TampermonkeyPayload): boolean {
  if (payload.kind === 'work_tracking') return true;
  if (payload.domain === 'Nautiljon' || payload.domain === 'WEBTOON') return true;
  return false;
}

interface QuickAddEvent {
  request_id: string;
  payload   : TampermonkeyPayload;
}

// ─── Helper : reporter le résultat au serveur Tauri ──────────────────────────

async function reportResult(
  requestId: string,
  ok       : boolean,
  action?  : string | null,
  error?   : string | null,
) {
  try {
    await invoke('report_quick_add_result', {
      requestId,
      ok,
      action: action ?? null,
      error : error  ?? null,
    });
  } catch (e) {
    console.error('[Tampermonkey] Impossible de reporter le résultat :', e);
  }
}

// ─── Helper : résoudre le thread_id ──────────────────────────────────────────

function resolveThreadId(domain: string, rawId?: number | string | null): number {
  if (rawId !== undefined && rawId !== null) {
    const n = typeof rawId === 'number' ? rawId : parseInt(String(rawId), 10);
    if (!isNaN(n) && n > 0) {
      return domain === 'LewdCorner' ? -n : n;
    }
  }
  return generateManualPseudoId();
}

// ─── Helper : chercher la date dans le flux RSS backend ──────────────────────

async function fetchRssDateForThread(threadId: number): Promise<string | null> {
  const base = (
    localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || ''
  ).replace(/\/+$/, '');
  const key = localStorage.getItem('apiKey') || '';

  if (!base || !key) return null;

  try {
    const res = await fetch(`${base}/api/rss/f95-updates`, {
      headers: { 'X-API-KEY': key },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const entry = (data.entries ?? []).find(
      (e: { threadId: number; pubDate: string }) => e.threadId === threadId
    );

    if (!entry?.pubDate) return null;

    // Tronquer "2026-03-14T12:30:00+00:00" → "2026-03-14"
    const normalized = String(entry.pubDate).substring(0, 10);
    return normalized === '2020-01-01' ? null : normalized;

  } catch {
    return null;
  }
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useTampermonkeyListener() {
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile?.id) return;

    let unlisten: (() => void) | undefined;

    (async () => {
      unlisten = await listen<QuickAddEvent>('tampermonkey:quick-add', async (event) => {
        const { request_id, payload } = event.payload;

        console.info('[Tampermonkey] 📥 Import reçu :', payload);

        if (isWorkTrackingImport(payload)) {
          window.dispatchEvent(
            new CustomEvent('work-tracking:import', {
              detail: {
                domain              : payload.domain,
                kind                : payload.kind ?? 'work_tracking',
                name                : payload.name,
                genres_themes       : payload.genres_themes ?? payload.tags ?? undefined,
                image               : payload.image ?? undefined,
                image_data          : payload.image_data ?? undefined,
                synopsis            : payload.synopsis ?? undefined,
                link                : payload.link ?? undefined,
                official_site_label : payload.official_site_label ?? undefined,
              },
            }),
          );
          await reportResult(request_id, true, 'work_imported');
          return;
        }

        const sb = getSupabase();
        if (!sb) {
          await reportResult(request_id, false, null, 'Supabase non configuré dans l\'application.');
          return;
        }

        try {
          const threadId = resolveThreadId(payload.domain, payload.id);

          // Vérifier si le jeu est déjà dans la collection
          const { data: existing } = await sb
            .from('user_collection')
            .select('id, title')
            .eq('owner_id', profile.id)
            .eq('f95_thread_id', threadId)
            .maybeSingle();

          if (existing) {
            console.info('[Tampermonkey] ℹ️ Déjà dans la collection :', existing.title);
            await reportResult(request_id, true, 'already_in_collection');
            return;
          }

          // ── Priorité : vérifier si le jeu est dans f95_jeux (catalogue) ──────
          // Si oui, on utilise les données du catalogue plutôt que le scraping
          // Tampermonkey pour garantir la cohérence avec la Bibliothèque.
          let catalogueRow: Record<string, unknown> | null = null;
          if (threadId > 0) {
            const { data: catalogueRows } = await sb
              .from('f95_jeux')
              .select(
                'nom_du_jeu, nom_url, version, trad_ver, lien_trad, statut, tags, ' +
                'type, traducteur, traducteur_url, type_de_traduction, ac, image, ' +
                'synopsis_en, synopsis_fr, f95_date_maj, updated_at'
              )
              .eq('site_id', threadId);

            if (catalogueRows && catalogueRows.length > 0) {
              // Sélectionner la ligne principale : ac='1' en priorité, puis plus récente
              const rows = catalogueRows as unknown as Record<string, unknown>[];
              const sorted = [...rows].sort((a, b) => {
                const aAc = String(a['ac'] ?? '') === '1';
                const bAc = String(b['ac'] ?? '') === '1';
                if (aAc !== bAc) return aAc ? -1 : 1;
                return (String(b['updated_at'] ?? '') > String(a['updated_at'] ?? '')) ? 1 : -1;
              });
              catalogueRow = sorted[0];
              console.info(
                '[Tampermonkey] 📚 Jeu trouvé dans f95_jeux, données catalogue utilisées :',
                catalogueRow.nom_du_jeu,
              );
            }
          }

          // Construction de scraped_data : catalogue > scraping Tampermonkey
          const scrapedData: Record<string, unknown> = catalogueRow
            ? {
                name              : catalogueRow.nom_du_jeu,
                version           : catalogueRow.version      ?? null,
                statut            : catalogueRow.statut        ?? null,
                type              : catalogueRow.type          ?? null,
                tags              : catalogueRow.tags          ?? null,
                image             : catalogueRow.image         ?? null,
                synopsis          : catalogueRow.synopsis_en   ?? null,
                synopsis_en       : catalogueRow.synopsis_en   ?? null,
                synopsis_fr       : catalogueRow.synopsis_fr   ?? null,
                trad_ver          : catalogueRow.trad_ver      ?? null,
                lien_trad         : catalogueRow.lien_trad     ?? null,
                traducteur        : catalogueRow.traducteur    ?? null,
                traducteur_url    : catalogueRow.traducteur_url ?? null,
                type_de_traduction: catalogueRow.type_de_traduction ?? null,
                f95_date_maj      : catalogueRow.f95_date_maj  ?? null,
                source            : 'f95_jeux',
              }
            : {
                name        : payload.name,
                version     : payload.version    ?? null,
                statut      : payload.status     ?? null,
                type        : payload.game_type  ?? null,
                tags        : payload.tags       ?? null,
                image       : payload.image      ?? null,
                synopsis    : payload.synopsis   ?? null,
                synopsis_en : payload.synopsis   ?? null,
                synopsis_fr : null,              // sera traduit via enrichissement silencieux
                source      : payload.domain,
                link        : payload.link       ?? null,
              };

          // Si le script a fourni une date et qu'on est en mode scraping, l'inclure
          if (!catalogueRow && payload.f95_date_maj && payload.f95_date_maj !== '2020-01-01') {
            scrapedData.f95_date_maj = payload.f95_date_maj;
          }

          // ── Insertion dans user_collection ────────────────────────────────
          const resolvedName    = (catalogueRow?.nom_du_jeu as string | null) ?? payload.name;
          const resolvedUrl     = (catalogueRow?.nom_url    as string | null) ?? payload.link ?? null;
          const resolvedDateMaj = (catalogueRow?.f95_date_maj as string | null)
            ?? (payload.f95_date_maj !== '2020-01-01' ? payload.f95_date_maj : null)
            ?? null;

          const insertRow: Record<string, unknown> = {
            owner_id     : profile.id,
            f95_thread_id: threadId,
            f95_url      : resolvedUrl,
            title        : resolvedName,
            scraped_data : scrapedData,
          };

          if (resolvedDateMaj) {
            insertRow.f95_date_maj = resolvedDateMaj;
          }

          const { error } = await sb.from('user_collection').insert(insertRow);
          if (error) throw error;

          console.info('[Tampermonkey] ✅ Ajouté :', payload.name);

          // ── Lookup RSS pour récupérer la date si pas encore connue ─────────
          // Inutile si le jeu vient du catalogue (f95_date_maj déjà présente).
          // Fait en asynchrone après l'insertion pour ne pas bloquer la réponse.
          if (!catalogueRow && (!payload.f95_date_maj || payload.f95_date_maj === '2020-01-01')) {
            // On ne bloque pas : fire-and-forget avec gestion d'erreur
            (async () => {
              const rssDate = await fetchRssDateForThread(threadId);
              if (!rssDate) return;

              try {
                // Récupérer l'entrée fraîchement insérée
                const { data: inserted } = await sb
                  .from('user_collection')
                  .select('id, scraped_data')
                  .eq('owner_id', profile.id)
                  .eq('f95_thread_id', threadId)
                  .maybeSingle();

                if (!inserted) return;

                const sdUpdate = {
                  ...(inserted.scraped_data ?? {}),
                  f95_date_maj: rssDate,
                };

                await sb.from('user_collection').update({
                  f95_date_maj: rssDate,   // colonne SQL dédiée
                  scraped_data: sdUpdate,  // JSONB (rétrocompat)
                }).eq('id', inserted.id);

                console.info(
                  '[Tampermonkey] 📅 f95_date_maj depuis RSS :',
                  payload.name, '→', rssDate,
                );
              } catch (err) {
                // Non bloquant
                console.warn('[Tampermonkey] Impossible d\'écrire f95_date_maj RSS :', err);
              }
            })();
          }

          await reportResult(request_id, true, 'added');
          window.dispatchEvent(
            new CustomEvent('collection:game-added', { detail: { threadId } })
          );

        } catch (err: any) {
          const msg = err?.message || String(err) || 'Erreur inconnue';
          console.error('[Tampermonkey] ❌ Erreur import :', msg);
          await reportResult(request_id, false, null, msg);
        }
      });
    })();

    return () => { unlisten?.(); };
  }, [profile?.id]);
}