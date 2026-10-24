const { GoogleGenerativeAI } = require('@google/generative-ai');

const { GEMINI_API_KEY } = require('../config');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_EVENTS = 40;

const PROMPT = `This image shows a school calendar, events list, or announcement with dates on it. Find every distinct event you can identify.

Respond with ONLY a raw JSON array of objects, one per event, each shaped exactly like this:
{"day": "12", "month": "Sep", "title": "Midterm Exams Begin", "subtitle": "All grades - Main building"}

Rules:
- "day" is the day-of-month as a plain number string (no leading zero, no "th"/"st"/"nd"). If an event spans multiple consecutive days in the same month, write it as "start-end", e.g. "19-20".
- "month" is a 3-letter English abbreviation: one of Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec.
- "title" is the short event name.
- "subtitle" is any extra detail shown (grade level, location, time) - use an empty string if none is visible.
- Skip anything without a clear date attached to it.
- Do not include markdown code fences, explanation, or any text outside the JSON array.`;

function extractJsonArray(text) {
  const trimmed = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(trimmed);
}

// The model is asked to write a multi-day event as a single "19-20" range,
// but it doesn't always follow that - it sometimes lists the same event
// once per day instead. Rather than depend on the prompt alone, collapse
// same month/title/subtitle events that land on consecutive days back into
// one ranged entry.
function mergeConsecutiveDuplicates(events) {
  const sorted = [...events].sort((a, b) => {
    const monthDiff = MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month);
    if (monthDiff !== 0) return monthDiff;
    return Number(String(a.day).split('-')[0]) - Number(String(b.day).split('-')[0]);
  });

  const merged = [];
  sorted.forEach((e) => {
    const last = merged[merged.length - 1];
    const lastEndDay = last ? Number(String(last.day).split('-').pop()) : null;
    const thisStartDay = Number(String(e.day).split('-')[0]);

    if (last && last.month === e.month && last.title === e.title && last.subtitle === e.subtitle && thisStartDay === lastEndDay + 1) {
      const startDay = String(last.day).split('-')[0];
      last.day = `${startDay}-${String(e.day).split('-').pop()}`;
      return;
    }
    merged.push({ ...e });
  });

  return merged;
}

function normalizeEvents(parsed) {
  if (!Array.isArray(parsed)) throw new Error('Model response was not a JSON array.');

  const events = parsed
    .slice(0, MAX_EVENTS)
    .map((e) => {
      // Keeps a "19-20" range intact while still stripping ordinal suffixes
      // ("19th-20th") and stray characters - anything but digits and the
      // range hyphen.
      const day = typeof e?.day === 'string' ? e.day.trim().replace(/[^\d-]/g, '').replace(/^-+|-+$/g, '') : '';
      const month = typeof e?.month === 'string' ? e.month.trim().slice(0, 3) : '';
      const monthNormalized = MONTHS.find((m) => m.toLowerCase() === month.toLowerCase()) || '';
      const title = typeof e?.title === 'string' ? e.title.trim().slice(0, 200) : '';
      const subtitle = typeof e?.subtitle === 'string' ? e.subtitle.trim().slice(0, 200) : '';
      return { day, month: monthNormalized, title, subtitle };
    })
    // A day/month/title the model couldn't actually read is worse than
    // just not offering that row at all for the admin to review.
    .filter((e) => e.day && e.month && e.title);

  return mergeConsecutiveDuplicates(events);
}

const NOT_CONFIGURED_MESSAGE = 'AI event extraction is not set up yet. Add GEMINI_API_KEY to the server .env file.';

function isAiConfigured() {
  return !!GEMINI_API_KEY;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Gemini's flash models return a 503 "high demand" error fairly often for
// brief spells that clear up within a couple seconds - worth a couple of
// quick automatic retries before making the admin re-click the button.
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

function isRetryable(err) {
  return /503|overloaded|high demand/i.test(err.message || '');
}

async function generateWithRetry(model, parts) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await model.generateContent(parts);
      return result.response.text();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) break;
      console.error(`[calendarEventsAi] Gemini request failed (attempt ${attempt}/${MAX_ATTEMPTS}, retrying):`, err.message);
      // eslint-disable-next-line no-await-in-loop
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastErr;
}

// Reads a calendar/events photo and returns candidate {day, month, title,
// subtitle} events for an admin to review before adding any of them.
// Throws with a message safe to show an admin directly.
async function extractCalendarEvents(imageBuffer, mimeType) {
  if (!GEMINI_API_KEY) throw new Error(NOT_CONFIGURED_MESSAGE);

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

  let response;
  try {
    response = await generateWithRetry(model, [{ inlineData: { data: imageBuffer.toString('base64'), mimeType } }, PROMPT]);
  } catch (err) {
    console.error('[calendarEventsAi] Gemini request failed:', err.message);
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

module.exports = { extractCalendarEvents, isAiConfigured, NOT_CONFIGURED_MESSAGE };
