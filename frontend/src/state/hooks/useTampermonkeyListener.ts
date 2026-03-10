import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from '../authContext';
import { generateManualPseudoId } from './useCollection';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TampermonkeyPayload {
  domain: string;
  id?: number | string | null;
  name: string;
  version?: string | null;
  status?: string | null;
  game_type?: string | null;
  tags?: string | null;
  link?: string | null;
  image?: string | null;
  synopsis?: string | null;
}

interface QuickAddEvent {
  request_id: string;
  payload: TampermonkeyPayload;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Envoie le résultat de l'import vers le serveur axum via la commande Tauri. */
async function reportResult(
  requestId: string,
  ok: boolean,
  action?: string | null,
  error?: string | null,
) {
  try {
    await invoke('report_quick_add_result', { requestId, ok, action: action ?? null, error: error ?? null });
  } catch (e) {
    console.error('[Tampermonkey] Impossible de reporter le résultat :', e);
  }
}

/** Résout l'ID de thread F95/LewdCorner depuis un ID brut (peut être string ou number). */
function resolveThreadId(domain: string, rawId?: number | string | null): number {
  if (rawId !== undefined && rawId !== null) {
    const n = typeof rawId === 'number' ? rawId : parseInt(String(rawId), 10);
    if (!isNaN(n) && n > 0) {
      // Pour LewdCorner, on utilise un ID négatif pour éviter les collisions avec F95
      return domain === 'LewdCorner' ? -n : n;
    }
  }
  return generateManualPseudoId();
}

// ─── Hook principal ───────────────────────────────────────────────────────────

/**
 * Écoute les événements Tampermonkey émis par le serveur local Tauri (localhost:7832)
 * et les traite directement via le client Supabase déjà authentifié.
 * L'utilisateur n'a rien à configurer — son owner_id vient de la session active.
 */
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

          // Construction de scraped_data
          const scrapedData = {
            name    : payload.name,
            version : payload.version   ?? null,
            statut  : payload.status    ?? null,
            type    : payload.game_type ?? null,
            tags    : payload.tags      ?? null,
            image   : payload.image     ?? null,
            synopsis: payload.synopsis  ?? null,  // lu par useCollection via s.synopsis
            source  : payload.domain,
            link    : payload.link      ?? null,
          };

          const { error } = await sb.from('user_collection').insert({
            owner_id    : profile.id,
            f95_thread_id: threadId,
            f95_url     : payload.link ?? null,
            title       : payload.name,
            scraped_data: scrapedData,
          });

          if (error) throw error;

          console.info('[Tampermonkey] ✅ Ajouté :', payload.name);
          await reportResult(request_id, true, 'added');
          window.dispatchEvent(new CustomEvent('collection:game-added', { detail: { threadId } }));

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
