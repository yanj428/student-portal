const { GoogleGenerativeAI } = require('@google/generative-ai');

const { GEMINI_API_KEY } = require('../config');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_EVENTS = 40;

const PROMPT = `This image shows a school calendar, events list, or announcement with dates on it. Find every distinct event you can identify.

Respond with ONLY a raw JSON array of objects, one per event, each shaped exactly like this:
{"day": "12", "month": "Sep", "title": "Midterm Exams Begin", "subtitle": "All grades - Main building"}

Rules:
- "day" is the day-of-month as a plain number string (no leading zero, no "th"/"st"/"nd").
- "month" is a 3-letter English abbreviation: one of Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec.
- "title" is the short event name.
- "subtitle" is any extra detail shown (grade level, location, time) - use an empty string if none is visible.
- Skip anything without a clear date attached to it.
- Do not include markdown code fences, explanation, or any text outside the JSON array.`;

function extractJsonArray(text) {
  const trimmed = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(trimmed);
}

function normalizeEvents(parsed) {
  if (!Array.isArray(parsed)) throw new Error('Model response was not a JSON array.');

  return parsed
    .slice(0, MAX_EVENTS)
    .map((e) => {
      const day = typeof e?.day === 'string' ? e.day.trim().replace(/\D/g, '') : '';
      const month = typeof e?.month === 'string' ? e.month.trim().slice(0, 3) : '';
      const monthNormalized = MONTHS.find((m) => m.toLowerCase() === month.toLowerCase()) || '';
      const title = typeof e?.title === 'string' ? e.title.trim().slice(0, 200) : '';
      const subtitle = typeof e?.subtitle === 'string' ? e.subtitle.trim().slice(0, 200) : '';
      return { day, month: monthNormalized, title, subtitle };
    })
    // A day/month/title the model couldn't actually read is worse than
    // just not offering that row at all for the admin to review.
    .filter((e) => e.day && e.month && e.title);
}

function isAiConfigured() {
  return !!GEMINI_API_KEY;
}

// Reads a calendar/events photo and returns candidate {day, month, title,
// subtitle} events for an admin to review before adding any of them.
// Throws with a message safe to show an admin directly.
async function extractCalendarEvents(imageBuffer, mimeType) {
  if (!GEMINI_API_KEY) {
    throw new Error('AI event extraction is not set up yet. Add GEMINI_API_KEY to the server .env file.');
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  let response;
  try {
    const result = await model.generateContent([
      { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
      PROMPT,
    ]);
    response = result.response.text();
  } catch {
    throw new Error('Could not reach the AI service. Please try again in a moment.');
  }

  let parsed;
  try {
    parsed = extractJsonArray(response);
  } catch {
    throw new Error('The AI could not read any events from this image. Try a clearer photo.');
  }

  const events = normalizeEvents(parsed);
  if (events.length === 0) {
    throw new Error('No events with a clear date were found in this image.');
  }
  return events;
}

module.exports = { extractCalendarEvents, isAiConfigured };
