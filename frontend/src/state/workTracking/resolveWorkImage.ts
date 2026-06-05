import { invoke } from '@tauri-apps/api/core';
import { isNautiljonImageUrl, toNautiljonMiniImageUrl } from './nautiljonImageUrl';

const HOTLINK_DOMAINS = ['nautiljon.com'];

function needsProxyFetch(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return HOTLINK_DOMAINS.some(d => host.includes(d));
  } catch {
    return false;
  }
}

function dataUrlToBlobUrl(dataUrl: string): string | null {
  try {
    const [header, b64] = dataUrl.split(',');
    if (!header?.includes('base64') || !b64) return null;
    const mime = header.replace('data:', '').replace(';base64', '') || 'image/webp';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

async function fetchViaTauri(url: string): Promise<string | null> {
  try {
    const dataUrl = await invoke<string>('fetch_image_data_url', { url });
    return dataUrlToBlobUrl(dataUrl);
  } catch (e) {
    console.warn('[work-import] Échec téléchargement image Tauri :', e);
    return null;
  }
}

/** Résout une URL d'image (Nautiljon → variante /mini/, proxy Tauri si besoin). */
export async function resolveWorkImagePreview(
  imageUrl: string,
): Promise<{ previewUrl: string; sourceUrl: string } | null> {
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:image/')) {
    const blobUrl = dataUrlToBlobUrl(trimmed);
    return blobUrl ? { previewUrl: blobUrl, sourceUrl: trimmed } : null;
  }

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return null;
  }

  if (isNautiljonImageUrl(trimmed)) {
    const miniUrl = toNautiljonMiniImageUrl(trimmed);
    return { previewUrl: miniUrl, sourceUrl: miniUrl };
  }

  if (!needsProxyFetch(trimmed)) {
    return { previewUrl: trimmed, sourceUrl: trimmed };
  }

  const blobUrl = await fetchViaTauri(trimmed);
  if (!blobUrl) return null;
  return { previewUrl: blobUrl, sourceUrl: trimmed };
}
