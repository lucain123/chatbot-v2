// netlify/functions/chat.js
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

    console.log("GEMINI KEY presente:", !!geminiKey);
    console.log("SUPABASE URL presente:", !!supabaseUrl);
    console.log("SUPABASE KEY presente:", !!supabaseKey);

    if (!geminiKey)   return { statusCode: 500, headers, body: JSON.stringify({ error: "GEMINI_API_KEY mancante" }) };
    if (!supabaseUrl) return { statusCode: 500, headers, body: JSON.stringify({ error: "SUPABASE_URL mancante" }) };

    const sbRes = await fetch(`${supabaseUrl}/rest/v1/chatbot_config?id=eq.default&select=*`, {
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`
      }
    });

    console.log("Supabase status:", sbRes.status);
    const rows = await sbRes.json();
    console.log("Supabase rows:", JSON.stringify(rows).slice(0, 200));
    const config = rows[0] || {};

    let systemPrompt = `Sei ${config.bot_name || "un assistente"}, un assistente di supporto professionale. Rispondi SEMPRE in italiano.`;
    if (config.bot_persona) systemPrompt += `\n\n${config.bot_persona}`;

    const sources = config.sources || [];
    const readySources = sources.filter(s => s.status === "ready" && s.content);
    if (readySources.length > 0) {
      const kb = readySources.map((s, i) => `=== FONTE ${i+1}: ${s.name} ===\n${s.content}`).join("\n\n");
      systemPrompt += `\n\nBASATI su queste fonti:\n\n${kb}`;
    }

    const rules = config.rules || [];
    if (rules.length > 0) {
      const rulesText = rules.map(r => `- Se l'utente chiede di "${r.trigger}", rispondi: "${r.response}"`).join("\n");
      systemPrompt += `\n\nREGOLE:\n${rulesText}`;
    }

    if (config.fallback_email) {
      systemPrompt += `\n\nSe non sai rispondere di': "Contattaci a ${config.fallback_email}"`;
    }

    systemPrompt += `\n\nNon menzionare mai fonti, Gemini, Google o dettagli tecnici.`;

    const geminiMessages = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    console.log("Chiamata Gemini...");

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: geminiMessages,
          generationConfig: { maxOutputTokens: 1024, temperature: 0.7 }
        })
      }
    );

    console.log("Gemini status:", geminiRes.status);
    const geminiData = await geminiRes.json();
    console.log("Gemini response:", JSON.stringify(geminiData).slice(0, 300));

    if (!geminiRes.ok) {
      return { statusCode: geminiRes.status, headers, body: JSON.stringify({ error: geminiData.error?.message || "Errore Gemini" }) };
    }

    const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Nessuna risposta.";
    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };

  } catch (err) {
    console.log("ERRORE:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
