const test = require('node:test');
const assert = require('node:assert/strict');

const { friendlyAiError } = require('../server/utils/calendarEventsAi');

test('an invalid or expired AI key is reported as a key problem for the site owner', () => {
  assert.match(friendlyAiError(new Error('[400 Bad Request] API key not valid. Please pass a valid API key. API_KEY_INVALID')), /key is not valid.*GEMINI_API_KEY/);
  assert.match(friendlyAiError(new Error('API key expired. Please renew the API key.')), /key is not valid/);
});

test('a usage limit and a retired model each get their own message', () => {
  assert.match(friendlyAiError(new Error('[429 Too Many Requests] RESOURCE_EXHAUSTED')), /reached its limit/);
  assert.match(friendlyAiError(new Error('[404 Not Found] models/x is not found for API version v1beta')), /no longer available/);
});

test('any other failure keeps the general "could not reach" message', () => {
  assert.match(friendlyAiError(new Error('fetch failed')), /Could not reach the AI service/);
  assert.match(friendlyAiError(undefined), /Could not reach the AI service/);
});