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
    var anthropicKey = process.env.ANTHROPIC_API_KEY;
    var supabaseUrl = process.env.SUPABASE_URL;
    var supabaseKey = process.env.SUPABASE_KEY;

    console.log("Anthropic key presente:", !!anthropicKey);
    console.log("Supabase URL presente:", !!supabaseUrl);

    if (!anthropicKey) {
      return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "ANTHROPIC_API_KEY mancante" }) };
    }

    // Legge config da Supabase
    var config = {};
    try {
      var sbRes = await fetch(supabaseUrl + "/rest/v1/chatbot_config?id=eq.default&select=*", {
        headers: {
          "apikey": supabaseKey,
          "Authorization": "Bearer " + supabaseKey
        }
      });
      console.log("Supabase status:", sbRes.status);
      var rows = await sbRes.json();
      config = rows[0] || {};
      console.log("Config caricata:", config.bot_name);
    } catch(sbErr) {
      console.log("Supabase errore:", sbErr.message);
    }

    // System prompt
    var systemPrompt = "Sei " + (config.bot_name || "un assistente") + ", un assistente di supporto professionale. Rispondi SEMPRE in italiano. Sii preciso, cordiale e conciso.";

    if (config.bot_persona) {
      systemPrompt += "\n\n" + config.bot_persona;
    }

    var sources = config.sources || [];
    var readySources = sources.filter(function(s) { return s.status === "ready" && s.content; });
    if (readySources.length > 0) {
      var kb = readySources.map(function(s, i) { return "=== FONTE " + (i+1) + ": " + s.name + " ===\n" + s.content; }).join("\n\n");
      systemPrompt += "\n\nBASATI ESCLUSIVAMENTE su queste fonti:\n\n" + kb + "\n\nSe la risposta non e' nelle fonti, NON inventare.";
    }

    var rules = config.rules || [];
    if (rules.length > 0) {
      var rulesText = rules.map(function(r) { return '- Se l\'utente chiede di "' + r.trigger + '", rispondi SEMPRE: "' + r.response + '"'; }).join("\n");
      systemPrompt += "\n\nREGOLE SPECIALI (priorita' assoluta):\n" + rulesText;
    }

    if (config.fallback_email) {
      systemPrompt += "\n\nSe non riesci a rispondere, di' sempre: \"Per assistenza diretta contattaci a " + config.fallback_email + "\".";
    }

    systemPrompt += "\n\nIMPORTANTE: Non menzionare mai le fonti, Claude, Anthropic o dettagli tecnici.";

    console.log("Chiamata Anthropic...");

    var aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages
      })
    });

    console.log("Anthropic status:", aiRes.status);
    var data = await aiRes.json();
    console.log("Anthropic data:", JSON.stringify(data).slice(0, 200));

    if (!aiRes.ok) {
      return { statusCode: aiRes.status, headers: headers, body: JSON.stringify({ error: data.error ? data.error.message : "Errore API" }) };
    }

    var reply = data.content[0].text;
    return { statusCode: 200, headers: headers, body: JSON.stringify({ reply: reply }) };

  } catch(err) {
    console.log("ERRORE:", err.message);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
