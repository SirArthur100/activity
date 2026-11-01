import test from 'node:test';
import assert from 'node:assert/strict';
import { ISOTOPES, UNITS, ValidationError, calculateActivity, parseActivity, parseLocalDateTime } from '../js/calculator.js';

const start = Date.UTC(2026, 10, 1, 9, 0);
const tc = ISOTOPES.find(item => item.id === 'Tc-99m');
const base = { isotopeId: 'Tc-99m', measuredActivity: 740, unit: 'MBq', measuredAt: start, administeredAt: start };
const close = (actual, expected, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * tolerance, `${actual} ≠ ${expected}`);
const invalid = (changes, field) => assert.throws(() => calculateActivity({ ...base, ...changes }), error =>
  error instanceof ValidationError && error.field === field);

test('all isotope constants have explicit physical half-lives and LNHB/DDEP provenance', () => {
  assert.equal(ISOTOPES.length, 11);
  assert.equal(new Set(ISOTOPES.map(item => item.id)).size, ISOTOPES.length);
  for (const item of ISOTOPES) {
    assert.ok(item.halfLifeMinutes > 0);
    assert.equal(item.sourceUrl, `https://www.lnhb.fr/nuclides/${item.id}_tables.pdf`);
    assert.equal(item.sourceName, 'LNHB / DDEP');
  }
  close(tc.halfLifeMinutes, 360.402);
  close(ISOTOPES.find(item => item.id === 'O-15').halfLifeMinutes * 60, 122.266);
});

test('one half-life halves the syringe activity; equal timestamps preserve it', () => {
  const initial = calculateActivity(base);
  assert.equal(initial.netMBq, 740);
  assert.equal(initial.remainingFraction, 1);
  const decayed = calculateActivity({ ...base, administeredAt: start + tc.halfLifeMinutes * 60000 });
  close(decayed.netMBq, 370);
  close(decayed.remainingFraction, 0.5);
});

test('known Tc-99m one-hour example uses unrounded exponential decay', () => {
  const result = calculateActivity({ ...base, administeredAt: start + 3600000 });
  // Independently evaluated with Python Decimal at 50-digit precision.
  close(result.netMBq, 659.35000880306701157221048991487208429527393198250);
  assert.equal(result.elapsedMinutes, 60);
});

test('unit conversions have identical physical results', () => {
  for (const [unit, measuredActivity] of Object.entries({ MBq: 740, GBq: 0.740, mCi: 20, uCi: 20000 })) {
    const result = calculateActivity({ ...base, measuredActivity, unit });
    close(result.netMBq, 740);
    close(result.netInUnit, measuredActivity);
  }
  assert.equal(UNITS.mCi.toMBq, 37);
});

test('later residue is back-corrected before subtracting at administration', () => {
  const administeredAt = start + tc.halfLifeMinutes * 60000;
  const result = calculateActivity({ ...base, administeredAt, residue: {
    activity: 5, unit: 'MBq', measuredAt: administeredAt + tc.halfLifeMinutes * 60000,
  } });
  close(result.grossMBq, 370);
  close(result.residueMBq, 10);
  close(result.netMBq, 360);
  close(result.residueElapsedMinutes, tc.halfLifeMinutes);
  assert.equal(result.hasResidue, true);
});

test('residue may use a different unit, be zero, or equal the full activity', () => {
  close(calculateActivity({ ...base, residue: { activity: 1, unit: 'mCi', measuredAt: start } }).netMBq, 703);
  assert.equal(calculateActivity({ ...base, residue: { activity: 0, unit: 'MBq', measuredAt: start } }).netMBq, 740);
  assert.equal(calculateActivity({ ...base, residue: { activity: 740, unit: 'MBq', measuredAt: start } }).netMBq, 0);
});

test('decimal comma and decimal point are accepted without ambiguous grouping', () => {
  for (const [text, expected] of [['740', 740], [' 12,5 ', 12.5], ['12.5', 12.5], [',5', 0.5], ['.5', 0.5], ['0', 0]]) {
    assert.equal(parseActivity(text), expected);
  }
  for (const value of ['', ' ', null, undefined, true, {}, '-1', '-0', 'NaN', 'Infinity', '1e3', '1 000', '1,000.5', '1.000,5', '1,2,3', '12 MBq', Infinity, NaN, -1]) {
    assert.throws(() => parseActivity(value), ValidationError);
  }
  assert.throws(() => parseActivity(`0.${'0'.repeat(400)}1`), /too small/);
  close(calculateActivity({ ...base, measuredActivity: '740,5' }).netMBq, 740.5);
});

test('invalid units, isotope, values and timestamps do not yield a result', () => {
  invalid({ isotopeId: 'unknown' }, 'isotopeId');
  invalid({ measuredActivity: 0 }, 'measuredActivity');
  invalid({ measuredActivity: -1 }, 'measuredActivity');
  invalid({ measuredActivity: 'bad' }, 'measuredActivity');
  invalid({ unit: 'Bq' }, 'unit');
  invalid({ unit: '__proto__' }, 'unit');
  invalid({ measuredAt: NaN }, 'measuredAt');
  invalid({ administeredAt: '2026-11-01' }, 'administeredAt');
  invalid({ administeredAt: 9e15 }, 'administeredAt');
  invalid({ residue: { activity: '', unit: 'MBq', measuredAt: start } }, 'residue.activity');
  invalid({ residue: { activity: 1, unit: 'bad', measuredAt: start } }, 'residue.unit');
  invalid({ residue: { activity: 1, unit: 'MBq', measuredAt: NaN } }, 'residue.measuredAt');
});

test('invalid chronology and impossible corrected residue are rejected', () => {
  invalid({ administeredAt: start - 60000 }, 'administeredAt');
  invalid({ residue: { activity: 1, unit: 'MBq', measuredAt: start - 60000 } }, 'residue.measuredAt');
  invalid({ residue: { activity: 741, unit: 'MBq', measuredAt: start } }, 'residue.activity');
  invalid({ residue: { activity: 400, unit: 'MBq', measuredAt: start + tc.halfLifeMinutes * 60000 } }, 'residue.activity');
});

test('overflow and decay underflow are rejected, including residue correction', () => {
  invalid({ measuredActivity: 1e308, unit: 'GBq' }, 'measuredActivity');
  invalid({ isotopeId: 'O-15', administeredAt: start + 100 * 86400000 }, 'administeredAt');
  invalid({ isotopeId: 'O-15', residue: { activity: 1, unit: 'MBq', measuredAt: start + 100 * 86400000 } }, 'residue.activity');
  // Zero residue remains exactly zero even across an extreme time interval.
  assert.equal(calculateActivity({ ...base, residue: { activity: 0, unit: 'MBq', measuredAt: start + 100 * 86400000 } }).residueMBq, 0);
});

test('local dates are parsed strictly, with seconds and leap days', () => {
  const timestamp = parseLocalDateTime('2024-02-29', '12:34:56');
  const parsed = new Date(timestamp);
  assert.equal(parsed.getFullYear(), 2024);
  assert.equal(parsed.getMonth(), 1);
  assert.equal(parsed.getDate(), 29);
  assert.equal(parsed.getHours(), 12);
  assert.equal(parsed.getMinutes(), 34);
  assert.equal(parsed.getSeconds(), 56);
  for (const [date, time] of [['2025-02-29', '12:00'], ['2026-04-31', '12:00'], ['2026-13-01', '12:00'], ['2026-01-00', '12:00'], ['2026-01-01', '24:00'], ['2026-01-01', '23:60'], ['2026-01-01', '23:59:60'], ['2026-1-1', '12:00'], ['', '12:00'], ['2026-01-01', ''], ['0000-01-01', '12:00']]) {
    assert.throws(() => parseLocalDateTime(date, time), ValidationError);
  }
});

test('different dates allow a correct calculation across midnight', () => {
  const measuredAt = parseLocalDateTime('2026-11-01', '23:30');
  const administeredAt = parseLocalDateTime('2026-11-02', '00:30');
  const result = calculateActivity({ ...base, measuredAt, administeredAt });
  assert.equal(result.elapsedMinutes, 60);
  close(result.netMBq, 659.35000880306701157221048991487208429527393198250);
});

test('Europe/Budapest daylight-saving gaps and repeated times cannot silently change the calculation', () => {
  const previousTZ = process.env.TZ;
  process.env.TZ = 'Europe/Budapest';
  try {
    assert.throws(() => parseLocalDateTime('2026-03-29', '02:30'), /does not exist/);
    assert.throws(() => parseLocalDateTime('2026-10-25', '02:30'), /occurs twice/);
    const springStart = parseLocalDateTime('2026-03-29', '01:30');
    const springEnd = parseLocalDateTime('2026-03-29', '03:30');
    assert.equal(calculateActivity({ ...base, measuredAt: springStart, administeredAt: springEnd }).elapsedMinutes, 60);
    const fallStart = parseLocalDateTime('2026-10-25', '01:30');
    const fallEnd = parseLocalDateTime('2026-10-25', '03:30');
    assert.equal(calculateActivity({ ...base, measuredAt: fallStart, administeredAt: fallEnd }).elapsedMinutes, 180);
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});
