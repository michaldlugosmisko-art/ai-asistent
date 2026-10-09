import express from 'express';
import cors from 'cors';

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const SYSTEM_PROMPT = `Si špičkový AI auto-poradca pre slovenský trh.
Tvojou úlohou je pomôcť používateľovi nájsť ideálne auto podľa jeho preferencií.

Pravidlá:
1. Pýtaj sa doplňujúce otázky (rozpočet, palivo, prevodovka, jazdené z bazára vs. nové z predajne).
2. Odporuč HLAVNÝ MODEL a zároveň prilož aj DRUHÚ ALTERNATÍVU (konkurenčný model).
3. Pre oba modely uveď reálne odhadované ceny a predajne/bazáry na Slovensku (napr. Autobazar.eu, Carvago, AAA Auto, oficiálni dealeri Škoda, Hyundai, Toyota).
4. Buď stručný, prehľadný a použi odrážky.`;

async function callGemini(messages) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const contents = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: contents,
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }
    })
  });

  if (!res.ok) throw new Error(`Gemini Error ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

async function callGroq(messages) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const groqMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }))
  ];

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: groqMessages
    })
  });

  if (!res.ok) throw new Error(`Groq Error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  try {
    const reply = await callGemini(messages);
    if (reply) return res.json({ text: reply });
  } catch (err) {
    console.log('Gemini zlyhalo, prepínam na Groq...', err.message);
  }

  try {
    const reply = await callGroq(messages);
    if (reply) return res.json({ text: reply });
  } catch (err) {
    console.log('Groq zlyhalo...', err.message);
  }

  res.status(500).json({ error: 'Služba nedostupná' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server beží na porte ${PORT}`));
