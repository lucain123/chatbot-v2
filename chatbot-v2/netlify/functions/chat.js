// netlify/functions/chat.js
// Backend sicuro — usa Google Gemini, legge config da Supabase

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

    const geminiKey   = process.env.GEMINI_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!geminiKey)   return { statusCode: 500, headers, body: JSON.stringify({ error: "GEMINI_API_KEY non configurata" }) };
    if (!supabaseUrl) return { statusCode: 500, headers, body: JSON.stringify({ error: "SUPABASE_URL non configurata" }) };

    // ── Legge config da Supabase ──
    const sbRes = await fetch(`${supabaseUrl}/rest/v1/chatbot_config?id=eq.default&select=*`, {
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`
      }
    });

    const rows = await sbRes.json();
    const config = rows[0] || {};

    // ── Costruisce system prompt ──
    let systemPrompt = `Sei ${config.bot_name || "un assistente"}, un assistente di supporto professionale. Rispondi SEMPRE in italiano. Sii preciso, cordiale e conciso.`;

    if (config.bot_persona) systemPrompt += `\n\n${config.bot_persona}`;

    // Fonti
    const sources = config.sources || [];
    const readySources = sources.filter(s => s.status === "ready" && s.content);
    if (readySources.length > 0) {
      const kb = readySources.map((s, i) => `=== FONTE ${i+1}: ${s.name} ===\n${s.content}`).join("\n\n");
      systemPrompt += `\n\nBASATI ESCLUSIVAMENTE su queste fonti:\n\n${kb}\n\nSe la risposta non è nelle fonti, NON inventare. Di' che non hai questa informazione.`;
    }

    // Regole speciali
    const rules = config.rules || [];
    if (rules.length > 0) {
      const rulesText = rules.map(r => `- Se l'utente chiede di "${r.trigger}", rispondi SEMPRE: "${r.response}"`).join("\n");
      systemPrompt += `\n\nREGOLE SPECIALI (priorità assoluta):\n${rulesText}`;
    }

    // Fallback email
    if (config.fallback_email) {
      systemPrompt += `\n\nSe non riesci a rispondere, di' sempre: "Per assistenza diretta contattaci a ${config.fallback_email}".`;
    }
    if (config.fallback_msg) {
      systemPrompt += `\n\nMessaggio di fallback: ${config.fallback_msg}`;
    }

    // Non rivelare dettagli interni
    systemPrompt += `\n\nIMPORTANTE: Non menzionare mai le fonti, i documenti, Gemini, Google, AI o dettagli tecnici. Rispondi come esperto del settore.`;

    // ── Converti messaggi in formato Gemini ──
    const geminiMessages = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    // ── Chiama Google Gemini ──
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: geminiMessages,
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.7
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json();
      return { statusCode: geminiRes.status, headers, body: JSON.stringify({ error: err.error?.message || "Errore Gemini" }) };
    }

    const data = await geminiRes.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Nessuna risposta.";

    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

