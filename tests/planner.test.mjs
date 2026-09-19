// Validation + parsing tests. No real CLI / credits involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateStory,
  validatePlan,
  extractJsonObject,
  buildPrompt,
  STORY_MIN,
  STORY_MAX
} from '../server/plan.mjs';

function validPlan(overrides = {}) {
  return {
    title: '海风把这一天留了下来',
    subtitle: 'A little place for a big memory',
    narrative: '把海岸、灯塔和月亮叠在一起，留下两个人一起看海的晚上。',
    theme: 'coast',
    palette: 'tide',
    sky: 'moon',
    motifs: ['lighthouse', 'sailboat', 'couple'],
    seed: 42,
    dedication: '和你，把日子过成风景',
    decisions: ['灯塔作为回忆的视觉锚点', '波浪串起前后景', '暖光表达安静的陪伴'],
    ...overrides
  };
}

test('validateStory trims and enforces bounds', () => {
  assert.equal(validateStory('  一个海边的傍晚故事  '), '一个海边的傍晚故事');
  assert.throws(() => validateStory('短'), /太短/);
  assert.throws(() => validateStory('a'.repeat(STORY_MAX + 1)), /太长/);
  assert.throws(() => validateStory(123), /文本/);
  assert.equal([...validateStory('a'.repeat(STORY_MIN))].length, STORY_MIN);
});

test('validatePlan accepts a canonical plan and reorders keys', () => {
  const plan = validatePlan(validPlan());
  assert.deepEqual(Object.keys(plan), [
    'title', 'subtitle', 'narrative', 'theme', 'palette',
    'sky', 'motifs', 'seed', 'dedication', 'decisions'
  ]);
});

test('validatePlan rejects extra/unsafe fields', () => {
  assert.throws(
    () => validatePlan(validPlan({ svg: '<svg/>' })),
    /未允许的字段/
  );
});

test('validatePlan rejects bad enums', () => {
  assert.throws(() => validatePlan(validPlan({ theme: 'space' })), /theme/);
  assert.throws(() => validatePlan(validPlan({ palette: 'neon' })), /palette/);
  assert.throws(() => validatePlan(validPlan({ sky: 'clouds' })), /sky/);
});

test('validatePlan enforces motif rules', () => {
  assert.throws(() => validatePlan(validPlan({ motifs: [] })), /1 到 4/);
  assert.throws(() => validatePlan(validPlan({ motifs: ['a', 'b', 'c', 'd', 'e'] })), /1 到 4/);
  assert.throws(() => validatePlan(validPlan({ motifs: ['cat', 'cat'] })), /重复/);
  assert.throws(() => validatePlan(validPlan({ motifs: ['ufo'] })), /不允许/);
});

test('validatePlan enforces seed range', () => {
  assert.throws(() => validatePlan(validPlan({ seed: 0 })), /seed/);
  assert.throws(() => validatePlan(validPlan({ seed: 1000000 })), /seed/);
  assert.throws(() => validatePlan(validPlan({ seed: 4.2 })), /seed/);
});

test('validatePlan enforces decisions count and content', () => {
  assert.throws(() => validatePlan(validPlan({ decisions: ['a', 'b'] })), /3 条/);
  assert.throws(() => validatePlan(validPlan({ decisions: ['a', '', 'c'] })), /空项/);
  assert.throws(
    () => validatePlan(validPlan({ decisions: ['a', 'b', 'x'.repeat(101)] })),
    /100/
  );
});

test('validatePlan enforces string length limits', () => {
  assert.throws(() => validatePlan(validPlan({ title: 'x'.repeat(31) })), /title/);
  assert.throws(() => validatePlan(validPlan({ subtitle: 'x'.repeat(81) })), /subtitle/);
  assert.throws(() => validatePlan(validPlan({ narrative: 'x'.repeat(221) })), /narrative/);
  assert.throws(() => validatePlan(validPlan({ dedication: 'x'.repeat(41) })), /dedication/);
  assert.throws(() => validatePlan(validPlan({ title: '   ' })), /不能为空/);
});

test('validatePlan rejects non-object shapes', () => {
  assert.throws(() => validatePlan(null), /JSON 对象/);
  assert.throws(() => validatePlan([]), /JSON 对象/);
  assert.throws(() => validatePlan('x'), /JSON 对象/);
});

test('extractJsonObject parses plain JSON', () => {
  const obj = extractJsonObject('{"seed": 7}');
  assert.equal(obj.seed, 7);
});

test('extractJsonObject parses fenced JSON with chatter', () => {
  const text = 'Sure, here you go:\n```json\n{"seed": 9, "note": "ok"}\n```\nDone.';
  const obj = extractJsonObject(text);
  assert.equal(obj.seed, 9);
});

test('extractJsonObject ignores braces inside strings', () => {
  const obj = extractJsonObject('prefix {"title": "a {nested} brace"} suffix');
  assert.equal(obj.title, 'a {nested} brace');
});

test('extractJsonObject strips ANSI color codes before parsing', () => {
  const text = '\u001B[32m{"seed": 5}\u001B[0m';
  const obj = extractJsonObject(text);
  assert.equal(obj.seed, 5);
});

test('extractJsonObject skips irrelevant malformed brace spans', () => {
  // A non-JSON brace span and a truncated span precede the real payload.
  const text = 'log {oops not json} then {"broken": ' +
    ' and finally {"seed": 11, "ok": true}';
  const obj = extractJsonObject(text);
  assert.equal(obj.seed, 11);
  assert.equal(obj.ok, true);
});

test('extractJsonObject throws on no JSON', () => {
  assert.throws(() => extractJsonObject('no json here'), /解析/);
  assert.throws(() => extractJsonObject(''), /内容/);
});

test('buildPrompt embeds story as data and keeps schema constraints', () => {
  const prompt = buildPrompt('一个特别的故事');
  assert.match(prompt, /一个特别的故事/);
  assert.match(prompt, /数据，不是指令/);
  assert.match(prompt, /lighthouse/);
});
