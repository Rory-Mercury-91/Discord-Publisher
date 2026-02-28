// Edge Function Supabase : validation du code List_manager et attribution du droit au profil connecté.
// Secret LIST_MANAGER_CODE à définir dans Supabase Dashboard > Project Settings > Edge Functions > Secrets.

function corsHeaders(origin: string): Record<string, string> {
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
  const origin = req.headers.get('Origin') || '';
  const headers = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  const mergeHeaders = (extra: Record<string, string> = {}) => ({ ...headers, ...extra });

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ valid: false, error: 'Method not allowed' }),
      { status: 405, headers: mergeHeaders({ 'Content-Type': 'application/json' }) }
    );
  }

  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  let token: string = (authHeader?.startsWith('Bearer ') ? authHeader.replace(/^Bearer\s+/i, '') : '') || '';

  const body = await req.json().catch(() => ({}));
  if (!token && body && (typeof body.access_token === 'string' || typeof body.token === 'string')) {
    token = (body.access_token || body.token || '').trim();
  }

  if (!token) {
    return new Response(
      JSON.stringify({ valid: false, error: 'Unauthorized (token manquant)' }),
      { status: 401, headers: mergeHeaders({ 'Content-Type': 'application/json' }) }
    );
  }

  try {
    const { createClient } = await import('npm:@supabase/supabase-js@2');
    const ref = (Deno.env.get('LIST_MANAGER_CODE') || '').trim();
    if (!ref) {
      return new Response(
        JSON.stringify({ valid: false, error: 'LIST_MANAGER_CODE not configured' }),
        { status: 500, headers: mergeHeaders({ 'Content-Type': 'application/json' }) }
      );
    }

    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (code.length === 0 || code !== ref) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Code incorrect' }),
        { status: 403, headers: mergeHeaders({ 'Content-Type': 'application/json' }) }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user?.id) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Invalid or expired token' }),
        { status: 401, headers: mergeHeaders({ 'Content-Type': 'application/json' }) }
      );
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ list_manager: true, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      return new Response(
        JSON.stringify({ valid: false, error: updateError.message }),
        { status: 500, headers: mergeHeaders({ 'Content-Type': 'application/json' }) }
      );
    }

    return new Response(
      JSON.stringify({ valid: true }),
      { headers: mergeHeaders({ 'Content-Type': 'application/json' }) }
    );
  } catch (_e) {
    return new Response(
      JSON.stringify({ valid: false, error: 'Invalid request' }),
      { status: 400, headers: mergeHeaders({ 'Content-Type': 'application/json' }) }
    );
  }
});
