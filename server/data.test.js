import test from 'node:test';
import assert from 'node:assert/strict';
import { numeric, historyRange, aggregate, dubaiDateTime, normalizeHistory } from './data.js';

test('missing sensor states do not silently turn into zero', () => {
  for (const value of [null, undefined, '', 'unknown', 'unavailable', ' ']) assert.equal(numeric(value), null);
  assert.equal(numeric('0'), 0);
  assert.equal(numeric('36.4'), 36.4);
});
test('history rejects reversed, malformed and excessive date ranges', () => {
  const now = Date.UTC(2026, 10, 5);
  assert.throws(() => historyRange({ start: 'bad', end: 'bad' }, now));
  assert.throws(() => historyRange({ start: '2026-11-05', end: '2026-11-01' }, now));
  assert.throws(() => historyRange({ start: '2026-01-01', end: '2026-11-05' }, now));
  assert.throws(() => historyRange({ range: 'everything' }, now));
  assert.equal(historyRange({ range: '7d' }, now).end - historyRange({ range: '7d' }, now).start, 7 * 86400000);
});
test('statistics preserve zero and exclude missing readings', () => {
  assert.deepEqual(aggregate([{ value: 0 }, { value: null }, { value: 10 }]), { min: 0, max: 10, average: 5, count: 2 });
  assert.deepEqual(aggregate([]), { min: null, max: null, average: null, count: 0 });
});
test('Dubai local date input has an explicit UTC offset', () => {
  assert.equal(dubaiDateTime('2026-11-05T12:00'), '2026-11-05T12:00:00+04:00');
});
test('history retains unavailable gaps, timestamp ordering, and real zeros', () => {
  const rows = [{state:'0',last_changed:'2026-11-05T01:00:00Z'}, {state:'unavailable',last_changed:'2026-11-05T02:00:00Z'}];
  assert.deepEqual(normalizeHistory(rows).map(p => p.value), [0, null]);
});
