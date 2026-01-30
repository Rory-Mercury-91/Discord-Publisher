// Edge Function Supabase : après validation du code Master Admin, attribue is_master_admin au profil de l'utilisateur connecté.
// Secret MASTER_ADMIN_CODE à définir dans Supabase Dashboard > Project Settings > Edge Functions > Secrets.

import { createClient } from 'npm:@supabase/supabase-js@2';

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
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: headers({ 'Content-Type': 'application/json' }) }
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: headers({ 'Content-Type': 'application/json' }) }
    );
  }

  try {
    const ref = (Deno.env.get('MASTER_ADMIN_CODE') || '').trim();
    if (!ref) {
      return new Response(
        JSON.stringify({ success: false, error: 'MASTER_ADMIN_CODE not configured' }),
        { status: 500, headers: headers({ 'Content-Type': 'application/json' }) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (code.length === 0 || code !== ref) {
      return new Response(
        JSON.stringify({ success: false, error: 'Code incorrect' }),
        { status: 403, headers: headers({ 'Content-Type': 'application/json' }) }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user?.id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ is_master_admin: true, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: headers({ 'Content-Type': 'application/json' }) }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: headers({ 'Content-Type': 'application/json' }) }
    );
  } catch (_e) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid request' }),
      { status: 400, headers: headers({ 'Content-Type': 'application/json' }) }
    );
  }
});
