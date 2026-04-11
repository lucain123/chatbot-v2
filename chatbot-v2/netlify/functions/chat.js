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
      var rows = await sbRes.json();
      config = rows[0] || {};
      console.log("Config caricata:", config.bot_name);
    } catch(sbErr) {
      console.log("Supabase errore:", sbErr.message);
    }

    // Scarica contenuto URL se non ancora scaricato
    var sources = config.sources || [];
    var sourcesAggiornate = false;

    for (var i = 0; i < sources.length; i++) {
      var src = sources[i];
      if (src.type === "url" && (!src.content || src.content.startsWith("[Contenuto"))) {
        try {
          console.log("Scarico URL:", src.url);
          var urlRes = await fetch(src.url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; ChatBot/1.0)" }
          });
          var html = await urlRes.text();

          // Estrae testo dal HTML rimuovendo i tag
          var testo = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 15000);

          src.content = testo;
          src.status = "ready";
          sourcesAggiornate = true;
          console.log("URL scaricato, caratteri:", testo.length);
        } catch(urlErr) {
          console.log("Errore scaricamento URL:", urlErr.message);
          src.content = "[Impossibile scaricare il contenuto di: " + src.url + "]";
          src.status = "ready";
        }
      }
    }

    // Salva fonti aggiornate su Supabase
    if (sourcesAggiornate) {
      try {
        await fetch(supabaseUrl + "/rest/v1/chatbot_config?id=eq.default", {
          method: "PATCH",
          headers: {
            "apikey": supabaseKey,
            "Authorization": "Bearer " + supabaseKey,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
          },
          body: JSON.stringify({ sources: sources })
        });
        console.log("Fonti aggiornate su Supabase");
      } catch(saveErr) {
        console.log("Errore salvataggio fonti:", saveErr.message);
      }
    }

    // System prompt
    var systemPrompt = "Sei " + (config.bot_name || "un assistente") + ", un assistente di supporto professionale. Rispondi SEMPRE in italiano. Sii preciso, cordiale e conciso.";

    if (config.bot_persona) {
      systemPrompt += "\n\n" + config.bot_persona;
    }

    var readySources = sources.filter(function(s) { return s.status === "ready" && s.content && !s.content.startsWith("[Impossibile"); });
    if (readySources.length > 0) {
      var kb = readySources.map(function(s, idx) {
        return "=== FONTE " + (idx+1) + ": " + s.name + " ===\n" + s.content;
      }).join("\n\n");
      systemPrompt += "\n\nBASATI ESCLUSIVAMENTE su queste fonti:\n\n" + kb + "\n\nSe la risposta non e' nelle fonti, NON inventare.";
    }

    var rules = config.rules || [];
    if (rules.length > 0) {
      var rulesText = rules.map(function(r) {
        return '- Se l\'utente chiede di "' + r.trigger + '", rispondi SEMPRE: "' + r.response + '"';
      }).join("\n");
      systemPrompt += "\n\nREGOLE SPECIALI (priorita' assoluta):\n" + rulesText;
    }

    if (config.fallback_email) {
      systemPrompt += "\n\nSe non riesci a rispondere, di' sempre: \"Per assistenza contattaci a " + config.fallback_email + "\".";
    }

    systemPrompt += "\n\nIMPORTANTE: Non menzionare mai le fonti, Claude, Anthropic o dettagli tecnici.";

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
