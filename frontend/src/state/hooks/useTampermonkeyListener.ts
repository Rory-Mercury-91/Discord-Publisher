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
  domain       : string;
  id?          : number | string | null;
  name         : string;
  version?     : string | null;
  status?      : string | null;
  game_type?   : string | null;
  tags?        : string | null;
  link?        : string | null;
  image?       : string | null;
  synopsis?    : string | null;
  f95_date_maj?: string | null;
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

          // Construction de scraped_data depuis les données du script
          const scrapedData: Record<string, unknown> = {
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

          // Si le script a fourni une date, l'inclure
          if (payload.f95_date_maj && payload.f95_date_maj !== '2020-01-01') {
            scrapedData.f95_date_maj = payload.f95_date_maj;
          }

          // ── Insertion dans user_collection ────────────────────────────────
          const insertRow: Record<string, unknown> = {
            owner_id     : profile.id,
            f95_thread_id: threadId,
            f95_url      : payload.link ?? null,
            title        : payload.name,
            scraped_data : scrapedData,
          };

          // Écrire f95_date_maj dans la colonne si on l'a déjà
          if (payload.f95_date_maj && payload.f95_date_maj !== '2020-01-01') {
            insertRow.f95_date_maj = payload.f95_date_maj;
          }

          const { error } = await sb.from('user_collection').insert(insertRow);
          if (error) throw error;

          console.info('[Tampermonkey] ✅ Ajouté :', payload.name);

          // ── Lookup RSS pour récupérer la date si pas encore connue ─────────
          // Fait en asynchrone après l'insertion pour ne pas bloquer la réponse
          if (!payload.f95_date_maj || payload.f95_date_maj === '2020-01-01') {
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