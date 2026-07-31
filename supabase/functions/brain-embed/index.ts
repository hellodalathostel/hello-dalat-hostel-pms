import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VOYAGE_API_KEY = Deno.env.get("VOYAGE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("BRAIN_SERVICE_ROLE_KEY")!;

const VOYAGE_MODEL = "voyage-4-lite";
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

interface EmbedRequest {
  table: "knowledge" | "decisions";
  rows?: { id: string; text: string }[];
  backfill?: boolean;
  limit?: number;
}

async function getVoyageEmbeddings(texts: string[]): Promise<number[][]> {
  if (!VOYAGE_API_KEY) throw new Error("VOYAGE_API_KEY is not set");
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${VOYAGE_API_KEY}` },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: "document" }),
  });
  if (!res.ok) throw new Error(`Voyage API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

function buildEmbeddingText(table: string, row: Record<string, unknown>): string {
  if (table === "knowledge") {
    return [row.category, row.key, row.value].filter(Boolean).join(" | ");
  }
  return [row.topic, row.context, row.chosen_option, row.rationale].filter(Boolean).join(" | ");
}

Deno.serve(async (req: Request) => {
  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "BRAIN_SERVICE_ROLE_KEY is not set in Edge Function secrets" }), { status: 500 });
    }
    // Schema 'brain' khong duoc PostgREST expose (chi public/graphql_public).
    // Dung client schema 'public' + goi RPC SQL wrapper (xem brain_embed_helpers.sql) de truy cap brain.* an toan.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body: EmbedRequest = await req.json();
    const { table } = body;

    if (table !== "knowledge" && table !== "decisions") {
      return new Response(JSON.stringify({ error: "table must be 'knowledge' or 'decisions'" }), { status: 400 });
    }

    let rowsToEmbed: { id: string; text: string }[] = [];

    if (body.rows && body.rows.length > 0) {
      rowsToEmbed = body.rows;
    } else if (body.backfill) {
      const limit = body.limit ?? 100;
      const { data: missing, error } = await supabase.rpc("brain_embed_get_missing", { p_table: table, p_limit: limit });
      if (error) throw error;
      rowsToEmbed = (missing ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        text: buildEmbeddingText(table, row),
      }));
    } else {
      return new Response(JSON.stringify({ error: "Provide 'rows' or 'backfill: true'" }), { status: 400 });
    }

    if (rowsToEmbed.length === 0) {
      return new Response(JSON.stringify({ message: "Nothing to embed", embedded: 0 }), { headers: { "Content-Type": "application/json" } });
    }

    const BATCH = 30;
    let successCount = 0;
    for (let i = 0; i < rowsToEmbed.length; i += BATCH) {
      const batch = rowsToEmbed.slice(i, i + BATCH);
      const texts = batch.map((r) => r.text);
      const embeddings = await getVoyageEmbeddings(texts);
      for (let j = 0; j < batch.length; j++) {
        const { error: updateError } = await supabase.rpc("brain_embed_set_embedding", {
          p_table: table,
          p_id: batch[j].id,
          p_embedding: embeddings[j],
        });
        if (!updateError) {
          successCount++;
        } else {
          console.error(`Update failed for id=${batch[j].id}:`, JSON.stringify(updateError));
        }
      }
      await new Promise((r) => setTimeout(r, 1500));
    }

    return new Response(
      JSON.stringify({ message: "Embedding complete", embedded: successCount, total: rowsToEmbed.length, model: VOYAGE_MODEL }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("brain-embed error (full):", JSON.stringify(err, Object.getOwnPropertyNames(err ?? {})));
    const message = err instanceof Error ? err.message : (typeof err === "object" ? JSON.stringify(err) : String(err));
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
