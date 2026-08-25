/**
 * India calendar-day helpers. OP tokens and "today OP" reset at 12:00 AM IST.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { kolkataDate, addCalendarDays, istDayBounds, istDayFilter } = require('../utils/istDay');

describe('istDay', () => {
  it('treats YYYY-MM-DD as an India calendar day from 12:00 AM IST', () => {
    assert.equal(kolkataDate('2026-08-26'), '2026-08-26');
    assert.equal(addCalendarDays('2026-08-26', 1), '2026-08-27');

    const { iso, from, to } = istDayBounds('2026-08-26');
    assert.equal(iso, '2026-08-26');
    // 12:00 AM IST = previous day 18:30 UTC
    assert.equal(from.toISOString(), '2026-08-25T18:30:00.000Z');
    assert.equal(to.toISOString(), '2026-08-26T18:30:00.000Z');

    const justAfterMidnightIst = new Date('2026-08-25T18:45:00.000Z');
    const stillPreviousDay = new Date('2026-08-25T18:00:00.000Z');
    assert.equal(justAfterMidnightIst >= from && justAfterMidnightIst < to, true);
    assert.equal(stillPreviousDay >= from && stillPreviousDay < to, false);
  });

  it('builds a tokenDate filter for that India day', () => {
    const filter = istDayFilter('tokenDate', '2026-08-26');
    assert.equal(filter.tokenDate.$gte.toISOString(), '2026-08-25T18:30:00.000Z');
    assert.equal(filter.tokenDate.$lt.toISOString(), '2026-08-26T18:30:00.000Z');
  });
});
