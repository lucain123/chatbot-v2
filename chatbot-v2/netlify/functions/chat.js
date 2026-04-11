exports.handler = async function(event) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    var body = JSON.parse(event.body);
    var messages = body.messages;
    var geminiKey = process.env.GEMINI_API_KEY;

    console.log("Gemini key presente:", !!geminiKey);

    var contents = messages.map(function(m) {
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      };
    });

    var geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + geminiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: contents,
          generationConfig: { maxOutputTokens: 1024 }
        })
      }
    );

    console.log("Gemini status:", geminiRes.status);
    var data = await geminiRes.json();
    console.log("Gemini data:", JSON.stringify(data).slice(0, 300));

    if (!geminiRes.ok) {
      return { statusCode: 500, headers: headers, body: JSON.stringify({ error: data.error.message }) };
    }

    var reply = data.candidates[0].content.parts[0].text;
    return { statusCode: 200, headers: headers, body: JSON.stringify({ reply: reply }) };

  } catch(err) {
    console.log("ERRORE:", err.message);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
