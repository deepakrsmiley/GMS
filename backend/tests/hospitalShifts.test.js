const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  shiftsForOrganization,
  shiftIdForInstant,
  istHour,
  sessionBounds,
  currentOrNextSession,
} = require('../utils/hospitalShifts');

describe('hospital shift windows', () => {
  it('keeps Sri Sanjeevi on 7 AM to 7 PM and 7 PM to 7 AM', () => {
    const shifts = shiftsForOrganization({ code: 'HOSP001', name: 'Sri Sanjeevi hospital', kind: 'client' });
    assert.deepEqual(shifts.map((s) => [s.id, s.startHour, s.endHour, s.short]), [
      ['morning', 7, 19, '7AM-7PM'],
      ['night', 19, 7, '7PM-7AM'],
    ]);
  });

  it('uses 10 AM to 10 PM and 10 PM to 10 AM for Srinivasa', () => {
    const byCode = shiftsForOrganization({ code: 'HOSP002', name: 'Client hospital', kind: 'client' });
    const byName = shiftsForOrganization({ code: 'HOSP009', name: 'Srinivasa hospital', kind: 'client' });
    for (const shifts of [byCode, byName]) {
      assert.deepEqual(shifts.map((s) => [s.id, s.range]), [
        ['morning', '10:00 AM to 10:00 PM'],
        ['night', '10:00 PM to 10:00 AM'],
      ]);
    }
  });

  it('classifies Srinivasa bills by India time, including after midnight', () => {
    const schedule = shiftsForOrganization({ code: 'HOSP002', name: 'Srinivasa hospital', kind: 'client' });
    assert.equal(istHour(new Date('2026-10-23T04:30:00.000Z')), 10);
    assert.equal(shiftIdForInstant(new Date('2026-10-23T04:30:00.000Z'), schedule), 'morning');
    assert.equal(shiftIdForInstant(new Date('2026-10-23T04:29:00.000Z'), schedule), 'night');
    assert.equal(shiftIdForInstant(new Date('2026-10-23T16:29:00.000Z'), schedule), 'morning');
    assert.equal(shiftIdForInstant(new Date('2026-10-23T16:30:00.000Z'), schedule), 'night');
    assert.equal(shiftIdForInstant(new Date('2026-10-23T18:30:00.000Z'), schedule), 'night');
  });

  it('opens Srinivasa night at 10 PM and keeps that account separate from the morning', () => {
    const schedule = shiftsForOrganization({ code: 'HOSP002', name: 'Srinivasa hospital', kind: 'client' });
    const morning = sessionBounds('2026-11-04', 'morning', schedule);
    const night = sessionBounds('2026-11-04', 'night', schedule);
    assert.equal(morning.from.toISOString(), '2026-11-04T04:30:00.000Z');
    assert.equal(morning.to.toISOString(), '2026-11-04T16:30:00.000Z');
    assert.equal(night.from.toISOString(), '2026-11-04T16:30:00.000Z');
    assert.equal(night.to.toISOString(), '2026-11-05T04:30:00.000Z');

    const atNightOpen = new Date('2026-11-04T16:30:00.000Z');
    const nightNow = currentOrNextSession('night', schedule, atNightOpen);
    assert.equal(nightNow.from.toISOString(), night.from.toISOString());

    const afternoon = new Date('2026-11-04T09:30:00.000Z');
    const upcomingNight = currentOrNextSession('night', schedule, afternoon);
    assert.equal(upcomingNight.from.toISOString(), night.from.toISOString());
    const morningNow = currentOrNextSession('morning', schedule, afternoon);
    assert.equal(morningNow.from.toISOString(), morning.from.toISOString());
  });

  it('classifies the default 7 AM boundary in India time', () => {
    const schedule = shiftsForOrganization({ code: 'HOSP001', name: 'Sri Sanjeevi hospital', kind: 'client' });
    assert.equal(shiftIdForInstant(new Date('2026-10-23T01:30:00.000Z'), schedule), 'morning');
    assert.equal(shiftIdForInstant(new Date('2026-10-23T01:29:00.000Z'), schedule), 'night');
    assert.equal(shiftIdForInstant(new Date('2026-10-23T13:30:00.000Z'), schedule), 'night');
  });
});
