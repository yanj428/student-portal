// Calendar events are colour-coded by category. The colours themselves live in
// public/upcoming-events.css, keyed by these ids.
const CATEGORIES = [
  { id: 'academic', label: 'Academics & Exams' },
  { id: 'holiday', label: 'Holidays & Breaks' },
  { id: 'sports', label: 'Sports' },
  { id: 'activities', label: 'Activities' },
  { id: 'family', label: 'Parents & Family' },
  { id: 'school', label: 'School Events' },
];

const DEFAULT_CATEGORY = 'school';
const IDS = CATEGORIES.map((c) => c.id);

// First match wins, so the more specific groups come first.
const KEYWORDS = [
  ['holiday', /\b(early finish|in-service|holiday|break|no school|vacation|day off|new year|songkran|loy krathong|king|queen|mother'?s day|father'?s day|constitution|christmas|chakri|visakha|buddhist|school closed)\b/i],
  ['academic', /\b(exam|exams|midterm|finals?|test|quiz|assessment|ap |sat|act|report card|grades?|semester|term|registration|orientation|deadline|course|map |testing)\b/i],
  ['sports', /\b(sport|sports|badminton|basketball|football|soccer|swim|swimming|volleyball|tennis|track|athletics|tournament|match|game|race|pe |field day|cross country|rugby|cricket)\b/i],
  ['activities', /\b(activity|activities|life ?skills?|block|club|clubs|camp|house day|enrichment|workshop|community|volunteer|charity|fundraiser|fundraising|clean[- ]?up|concert|music|band|choir|drama|theat(re|er)|musical|talent|performance|dance|recital|exhibition|show|halloween)\b/i],
  ['family', /\b(parent|parents|family|conference|ptc|open house|coffee|graduation|ceremony|meeting|curriculum night)\b/i],
];

// Events saved before the groups were merged still say rts or service.
const RETIRED = { arts: 'activities', service: 'activities' };
const normalizeCategory = (id) => RETIRED[id] || id;

function isCategory(value) {
  return IDS.includes(value);
}

function guessCategory(title) {
  const text = String(title || '');
  const hit = KEYWORDS.find(([, re]) => re.test(text));
  return hit ? hit[0] : DEFAULT_CATEGORY;
}

module.exports = { normalizeCategory, CATEGORIES, DEFAULT_CATEGORY, isCategory, guessCategory };
