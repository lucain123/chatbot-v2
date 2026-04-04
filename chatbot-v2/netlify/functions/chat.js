// netlify/functions/chat.js
// Backend sicuro — legge config da Supabase, chiave Anthropic protetta

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const { messages } = JSON.parse(event.body);

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const supabaseUrl  = process.env.SUPABASE_URL;
    const supabaseKey  = process.env.SUPABASE_KEY;

    if (!anthropicKey) return { statusCode: 500, headers, body: JSON.stringify({ error: "ANTHROPIC_API_KEY non configurata" }) };
    if (!supabaseUrl || !supabaseKey) return { statusCode: 500, headers, body: JSON.stringify({ error: "Supabase non configurato" }) };

    // ── Legge la config da Supabase ──
    const sbRes = await fetch(`${supabaseUrl}/rest/v1/chatbot_config?id=eq.default&select=*`, {
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`
      }
    });

    if (!sbRes.ok) return { statusCode: 500, headers, body: JSON.stringify({ error: "Errore lettura configurazione" }) };

    const rows = await sbRes.json();
    const config = rows[0] || {};

    // ── Costruisce system prompt ──
    let system = `Sei ${config.bot_name || "un assistente"}, un assistente di supporto professionale. Rispondi SEMPRE in italiano. Sii preciso, cordiale e conciso.`;

    if (config.bot_persona) system += `\n\n${config.bot_persona}`;

    // Fonti
    const sources = config.sources || [];
    const readySources = sources.filter(s => s.status === "ready" && s.content);
    if (readySources.length > 0) {
      const kb = readySources.map((s, i) => `=== FONTE ${i+1}: ${s.name} ===\n${s.content}`).join("\n\n");
      system += `\n\nBASATI ESCLUSIVAMENTE su queste fonti:\n\n${kb}\n\nSe la risposta non è nelle fonti, NON inventare.`;
    }

    // Regole speciali
    const rules = config.rules || [];
    if (rules.length > 0) {
      const rulesText = rules.map(r => `- Se l'utente chiede di "${r.trigger}", rispondi SEMPRE: "${r.response}"`).join("\n");
      system += `\n\nREGOLE SPECIALI (priorità assoluta):\n${rulesText}`;
    }

    // Fallback email
    if (config.fallback_email) {
      system += `\n\nSe non riesci a rispondere, di' sempre: "Per assistenza diretta contattaci a ${config.fallback_email}".`;
    }
    if (config.fallback_msg) {
      system += `\n\nMessaggio di fallback: ${config.fallback_msg}`;
    }

    // Sicurezza — non rivelare mai dettagli interni
    system += `\n\nIMPORTANTE: Non menzionare mai le fonti, i documenti, Claude, Anthropic o dettagli tecnici. Rispondi come esperto del settore.`;

    // ── Chiama Anthropic ──
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system,
        messages
      })
    });

    if (!aiRes.ok) {
      const err = await aiRes.json();
      return { statusCode: aiRes.status, headers, body: JSON.stringify({ error: err.error?.message || "Errore API" }) };
    }

    const data = await aiRes.json();
    return { statusCode: 200, headers, body: JSON.stringify({ reply: data.content?.[0]?.text || "Nessuna risposta." }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
