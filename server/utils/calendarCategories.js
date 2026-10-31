// Calendar events are colour-coded by category. The colours themselves live in
// public/upcoming-events.css, keyed by these ids.
const CATEGORIES = [
  { id: 'academic', label: 'Academics & Exams' },
  { id: 'holiday', label: 'Holidays & Breaks' },
  { id: 'sports', label: 'Sports' },
  { id: 'arts', label: 'Arts & Performances' },
  { id: 'service', label: 'Service & Community' },
  { id: 'family', label: 'Parents & Family' },
  { id: 'school', label: 'School Events' },
];

const DEFAULT_CATEGORY = 'school';
const IDS = CATEGORIES.map((c) => c.id);

// First match wins, so the more specific groups come first.
const KEYWORDS = [
  ['holiday', /\b(holiday|break|no school|vacation|day off|new year|songkran|loy krathong|king|queen|mother'?s day|father'?s day|constitution|christmas|chakri|visakha|buddhist|school closed)\b/i],
  ['academic', /\b(exam|exams|midterm|finals?|test|quiz|assessment|ap |sat|act|report card|grades?|semester|term|registration|orientation|deadline|course|map |testing)\b/i],
  ['sports', /\b(sport|sports|badminton|basketball|football|soccer|swim|swimming|volleyball|tennis|track|athletics|tournament|match|game|race|pe |field day|cross country|rugby|cricket)\b/i],
  ['arts', /\b(concert|music|band|choir|drama|play|theat(re|er)|musical|art|arts|exhibition|show|talent|performance|dance|recital|gallery)\b/i],
  ['service', /\b(service|community|charity|volunteer|fundraiser|fundraising|drive|clean[- ]?up|cas|donation)\b/i],
  ['family', /\b(parent|parents|family|conference|ptc|open house|coffee|graduation|ceremony|meeting|curriculum night)\b/i],
];

function isCategory(value) {
  return IDS.includes(value);
}

function guessCategory(title) {
  const text = String(title || '');
  const hit = KEYWORDS.find(([, re]) => re.test(text));
  return hit ? hit[0] : DEFAULT_CATEGORY;
}

module.exports = { CATEGORIES, DEFAULT_CATEGORY, isCategory, guessCategory };
