# ChatBot Assistenza v2 — Con Supabase

## Struttura
```
chatbot-v2/
├── netlify/functions/chat.js   ← Backend sicuro
├── admin/index.html            ← Pannello Admin
├── chat/index.html             ← Chatbot pubblico
└── netlify.toml
```

## Variabili d'ambiente su Netlify
Vai su: Site settings → Environment variables → Add variable

| Nome variabile       | Valore                          |
|----------------------|---------------------------------|
| ANTHROPIC_API_KEY    | sk-ant-...la tua chiave...      |
| SUPABASE_URL         | https://dmafhgewcnmteylbiyqo.supabase.co |
| SUPABASE_KEY         | sb_publishable_6oQJn6zDZg4Fea_sRenQNQ_PlveL9tS |

## Deploy
1. Carica questa cartella su GitHub
2. Collega a Netlify
3. Aggiungi le 3 variabili d'ambiente
4. Deploy!

## URL
- Admin: https://tuosito.netlify.app/admin/
- Chat:  https://tuosito.netlify.app/chat/

## Password admin default
admin1234  ← Cambiala subito!
