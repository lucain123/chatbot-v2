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
    const geminiKey = process.env.GEMINI_API_KEY;

    console.log("Test senza Supabase - Gemini key:", !!geminiKey);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: messages.map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          })),
          generationConfig: { maxOutputTokens: 1024 }
        })
      }
    );

    console.log("Gemini status:", geminiRes.status);
    const data = await geminiRes.json();
    console.log("Gemini data:", JSON.stringify(data).slice(0, 300));

    if (!geminiRes.ok) return { statusCode: 500, headers, body: JSON.stringify({ error: data.error?.message }) };

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Nessuna risposta.";
    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };

  } catch (err) {
    console.log("ERRORE:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
Commit → aspetta deploy → riprova! 🚀Hai utilizzato 90% del tuo limite di sessione
