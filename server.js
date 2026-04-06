// ============================================================
// MESHACK BUDGET BOT — WhatsApp + Gemini + Google Sheets
// ============================================================
// Deploy this to Render.com (free) or any Node.js host.
// Set the environment variables listed in .env.example
// ============================================================

import express   from 'express';
import twilio    from 'twilio';
import fetch     from 'node-fetch';

const app  = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ── Env ───────────────────────────────────────────────────────
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  GEMINI_API_KEY,
  APPS_SCRIPT_URL,   // your deployed Google Apps Script Web App URL
  PORT = 3000
} = process.env;

// ── Twilio client ─────────────────────────────────────────────
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// ── Helpers ───────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function currentMonth() {
  return MONTHS[new Date().getMonth()];
}

function fmt(n) {
  n = parseFloat(n) || 0;
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
  return n.toLocaleString();
}

// ── Gemini call ───────────────────────────────────────────────
async function callGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.15, maxOutputTokens: 600 }
      })
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

// ── Apps Script call ──────────────────────────────────────────
async function appsScript(params) {
  const url = APPS_SCRIPT_URL + '?' + new URLSearchParams(params).toString();
  const res = await fetch(url);
  return res.json();
}

// ── Intent classification + parsing ──────────────────────────
async function classifyAndParse(text) {
  const today = new Date().toISOString().split('T')[0];

  const prompt = `You are Meshack's personal budget assistant. Analyse this WhatsApp message and decide what to do.

Today is ${today}. Current month: ${currentMonth()}.

Budget categories:
  N = Need  (rent, food, transport, utilities, essentials)
  W = Want  (entertainment, shopping, non-essentials)
  G = Goal  (savings, investment, future plans)
  C = Charitable (donations, gifts, helping others)

Respond ONLY with a JSON object. No markdown, no explanation, just the JSON.

If the message is logging an EXPENSE or INCOME, return:
{
  "intent": "log",
  "type": "expense" | "income",
  "source": "<short description>",
  "date": "<YYYY-MM-DD>",
  "amount": <number>,
  "category": "N" | "W" | "G" | "C",
  "comment": "<any extra detail or empty string>",
  "month": "<3-letter month e.g. Apr>"
}

If the message is asking about TRENDS, SUMMARY, BALANCE, or SPENDING ANALYSIS, return:
{
  "intent": "query",
  "question": "<the user's question, cleaned up>",
  "month": "<which month they're asking about, or current month if unclear>"
}

If the message is unclear or a greeting, return:
{
  "intent": "help"
}

Message: "${text.replace(/"/g, "'")}"`;

  const raw   = await callGemini(prompt);
  const clean = raw.replace(/```json|```/gi, '').trim();
  return JSON.parse(clean);
}

// ── Format a trend answer ─────────────────────────────────────
async function answerTrendQuestion(question, month) {
  const sheetData = await appsScript({ action: 'getData', month });

  if (sheetData.error) {
    return `No data found for *${month}*. Log some expenses first!`;
  }

  // Build a compact data summary for Gemini
  const { totalIncome, budgetData, actualBalance, expenses, incomeRows } = sheetData;

  const expenseSummary = expenses.map(e =>
    `${e.date}  ${e.source}  ${e.category}  ${e.amount}`
  ).join('\n');

  const catSummary = Object.entries(budgetData).map(([code, v]) =>
    `${v.name}: budgeted ${v.budgeted}, actual ${v.actual}`
  ).join('\n');

  const dataBlock = `
Month: ${month}
Total income: ${totalIncome} TZS
Remaining balance: ${actualBalance} TZS
Category summary:
${catSummary}
Expenses (date, name, category, amount):
${expenseSummary || '(none)'}
Income sources:
${incomeRows.map(r => `${r.source}: ${r.actual}`).join('\n') || '(none)'}
  `.trim();

  const prompt = `You are Meshack's personal budget assistant. Answer the question below using the data provided.
Be concise, warm, and use WhatsApp-friendly formatting (bold with *asterisks*, line breaks).
Use TZS amounts. Give practical advice if relevant.

Question: ${question}

Data:
${dataBlock}`;

  return callGemini(prompt);
}

// ── Confirmation message builder ──────────────────────────────
function buildConfirmation(parsed, saveResult) {
  const catNames = { N:'🏠 Need', W:'🛍️ Want', G:'🎯 Goal', C:'💙 Charitable' };
  const typeEmoji = parsed.type === 'income' ? '💵' : '💸';
  const action    = parsed.type === 'income' ? 'Income' : 'Expense';

  return (
    `✅ *${action} Saved!*\n\n` +
    `${typeEmoji} *${parsed.source}*\n` +
    `📅 ${parsed.date}\n` +
    `💰 ${fmt(parsed.amount)} TZS\n` +
    (parsed.type !== 'income' ? `📂 ${catNames[parsed.category] || parsed.category}\n` : '') +
    `🗓️ Sheet: ${saveResult.month || parsed.month}\n` +
    (parsed.comment ? `📝 ${parsed.comment}\n` : '') +
    `\nSend *balance* or *summary* to see your ${parsed.month} overview.`
  );
}

const HELP_MSG =
  `👋 Hi Meshack! Here's what I can do:\n\n` +
  `*Log an expense:*\n` +
  `  _"Paid 5,000 for lunch today"\n` +
  `  "Rent 165,000 on the 13th"\n` +
  `  "Gave 16,000 to Aledesyo"_\n\n` +
  `*Log income:*\n` +
  `  _"Got 500,000 from Sieyuan"\n` +
  `  "Overtime pay 136,000"_\n\n` +
  `*Ask about trends:*\n` +
  `  _"How is my spending this month?"\n` +
  `  "What's my balance for April?"\n` +
  `  "Where am I overspending?"_\n\n` +
  `I'll understand plain English — just talk naturally! 😊`;

// ── Main webhook ──────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  const incomingMsg = (req.body.Body || '').trim();
  const from        = req.body.From; // e.g. whatsapp:+255712345678

  console.log(`[${new Date().toISOString()}] FROM: ${from}  MSG: ${incomingMsg}`);

  let replyText = '';

  try {
    const parsed = await classifyAndParse(incomingMsg);
    console.log('Gemini classified:', JSON.stringify(parsed));

    if (parsed.intent === 'log') {
      // ── Save to Google Sheets ──
      const action = parsed.type === 'income' ? 'addIncome' : 'addExpense';
      const params = parsed.type === 'income'
        ? {
            action,
            source:   parsed.source,
            date:     parsed.date,
            actual:   parsed.amount,
            comment:  parsed.comment || '',
            month:    parsed.month || currentMonth()
          }
        : {
            action,
            source:   parsed.source,
            date:     parsed.date,
            amount:   parsed.amount,
            category: parsed.category,
            comment:  parsed.comment || '',
            month:    parsed.month || currentMonth()
          };

      const result = await appsScript(params);

      if (result.error) {
        replyText = `❌ Couldn't save: ${result.error}`;
      } else {
        replyText = buildConfirmation(parsed, result);
      }

    } else if (parsed.intent === 'query') {
      // ── Answer trend question ──
      replyText = await answerTrendQuestion(
        parsed.question,
        parsed.month || currentMonth()
      );

    } else {
      replyText = HELP_MSG;
    }

  } catch (err) {
    console.error('Error:', err);
    replyText =
      `⚠️ Something went wrong: ${err.message}\n\n` +
      `Try sending a simpler message or check your setup.`;
  }

  // Send WhatsApp reply via Twilio
  try {
    await twilioClient.messages.create({
      from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
      to:   from,
      body: replyText
    });
  } catch (twilioErr) {
    console.error('Twilio send error:', twilioErr.message);
  }

  // Always respond 200 to Twilio quickly
  res.sendStatus(200);
});

// ── Health check ──────────────────────────────────────────────
app.get('/', (_req, res) => res.send('Meshack Budget Bot is running ✅'));

app.listen(PORT, () => {
  console.log(`🤖 Meshack Budget Bot listening on port ${PORT}`);
});
