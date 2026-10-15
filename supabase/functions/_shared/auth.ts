import { createClient, type User } from 'jsr:@supabase/supabase-js@2'

const jsonHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

type AuthResult =
  | { user: User; error: null }
  | { user: null; error: Response }

function errorResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), { status, headers: jsonHeaders })
}

export async function authenticateRequest(req: Request, maxBytes = 10_000_000): Promise<AuthResult> {
  if (req.method !== 'POST') {
    return { user: null, error: errorResponse(405, 'Method Not Allowed') }
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { user: null, error: errorResponse(413, 'Request body too large') }
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null, error: errorResponse(401, 'Unauthorized') }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return { user: null, error: errorResponse(500, 'Server authentication is not configured') }
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice('Bearer '.length))

  if (error || !user) {
    return { user: null, error: errorResponse(401, 'Unauthorized') }
  }

  return { user, error: null }
}
