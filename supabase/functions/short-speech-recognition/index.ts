import { serve } from "https://deno.land/std/http/server.ts";
import { authenticateRequest } from "../_shared/auth.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  const { error: authError } = await authenticateRequest(req);
  if (authError) return authError;

  let speech: string, len: number, format: string, rate: number, cuid: string;
  try {
    const body = await req.json();
    speech = body.speech;
    len    = body.len;
    format = body.format ?? "m4a";
    rate   = body.rate   ?? 16000;
    cuid   = body.cuid   ?? "app-user";
    if (!speech) throw new Error("Missing speech");
    if (typeof len !== "number" || len <= 0) throw new Error("Invalid len");
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server config error" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const upstream = await fetch(
    "https://app-cf15398uqfpd-api-Aa2PZnjEw5NL-gateway.appmiaoda.com/server_api",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ format, rate, cuid, speech, len }),
    }
  );

  if (upstream.status === 429 || upstream.status === 402) {
    const t = await upstream.text();
    return new Response(t, { status: upstream.status, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  if (!upstream.ok) {
    return new Response(
      JSON.stringify({ error: `Upstream error: ${upstream.status}` }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  const data = await upstream.json();
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...CORS, "Content-Type": "application/json" },
  });
});
