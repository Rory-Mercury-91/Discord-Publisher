// Edge Function Supabase : validation du code Master Admin (accès config complète).
// Secret MASTER_ADMIN_CODE à définir dans Supabase Dashboard > Project Settings > Edge Functions > Secrets.

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allow = /^https?:\/\/(localhost|tauri\.localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    ? origin
    : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  const headers = (extra: Record<string, string> = {}) => ({ ...corsHeaders(req), ...extra });

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ valid: false, error: 'Method not allowed' }),
      { status: 405, headers: headers({ 'Content-Type': 'application/json' }) }
    );
  }

  try {
    const ref = (Deno.env.get('MASTER_ADMIN_CODE') || '').trim();
    if (!ref) {
      return new Response(
        JSON.stringify({ valid: false, error: 'MASTER_ADMIN_CODE not configured' }),
        { status: 500, headers: headers({ 'Content-Type': 'application/json' }) }
      );
    }

    const body = await req.json();
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    const valid = code.length > 0 && code === ref;

    return new Response(
      JSON.stringify({ valid }),
      { headers: headers({ 'Content-Type': 'application/json' }) }
    );
  } catch (_e) {
    return new Response(
      JSON.stringify({ valid: false, error: 'Invalid request' }),
      { status: 400, headers: headers({ 'Content-Type': 'application/json' }) }
    );
  }
});
