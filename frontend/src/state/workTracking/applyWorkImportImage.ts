import type { WorkImportDeps, WorkImportPayload } from './applyWorkImport';
import { resolveWorkImagePreview } from './resolveWorkImage';

function dataUrlToBlobUrl(dataUrl: string): string | null {
  try {
    const [header, b64] = dataUrl.split(',');
    if (!header?.includes('base64') || !b64) return null;
    const mime = header.replace('data:', '').replace(';base64', '') || 'image/webp';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch {
    return null;
  }
}

/** Importe la couverture (résolution anti-hotlink Nautiljon via Tauri si besoin). */
export async function applyWorkImportImage(
  payload: WorkImportPayload,
  deps: Pick<WorkImportDeps, 'addImageFromUrl'>,
): Promise<boolean> {
  const httpUrl = payload.image?.trim();
  const dataUrl = payload.image_data?.trim();

  if (dataUrl?.startsWith('data:image/')) {
    const blobUrl = dataUrlToBlobUrl(dataUrl);
    if (!blobUrl) return false;
    if (httpUrl && (httpUrl.startsWith('http://') || httpUrl.startsWith('https://'))) {
      deps.addImageFromUrl(httpUrl, { previewUrl: blobUrl });
    } else {
      deps.addImageFromUrl(dataUrl, { previewUrl: blobUrl });
    }
    return true;
  }

  if (!httpUrl || (!httpUrl.startsWith('http://') && !httpUrl.startsWith('https://'))) {
    return false;
  }

  const resolved = await resolveWorkImagePreview(httpUrl);
  if (!resolved) return false;

  deps.addImageFromUrl(resolved.sourceUrl, { previewUrl: resolved.previewUrl });
  return true;
}
