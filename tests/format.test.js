import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, formatDuration } from '../js/format.js';

test('small GBq results retain meaningful precision', () => {
  assert.equal(formatNumber(0.00149), '0.00149');
  assert.equal(formatNumber(0.001490123), '0.00149012');
  assert.equal(formatNumber(0.185123456), '0.185123');
});

test('ordinary activity results display up to six significant digits', () => {
  assert.equal(formatNumber(659.350008), '659.35');
  assert.equal(formatNumber(740), '740');
  assert.equal(formatNumber(123456.789), '123,457');
  assert.equal(formatNumber(123456789), '123,457,000');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(-0), '0');
});

test('very small and very large values use six significant digits in scientific notation', () => {
  assert.equal(formatNumber(0.0001), '0.0001');
  assert.equal(formatNumber(0.000012345678), '1.23457e-5');
  assert.equal(formatNumber(1e9), '1.00000e+9');
  assert.equal(formatNumber(1.23456789e12), '1.23457e+12');
  assert.equal(formatNumber(-1.23456789e12), '-1.23457e+12');
});

test('positive activities never appear as zero', () => {
  for (const activity of [Number.MIN_VALUE, 1e-300, 1e-12, 0.0000001, 0.0000999999, 0.0001, 0.001, 0.00149]) {
    assert.ok(Number(formatNumber(activity)) > 0, `Lost nonzero activity ${activity}`);
  }
});

test('elapsed intervals preserve seconds near minute and hour boundaries', () => {
  assert.equal(formatDuration(0), '0 min');
  assert.equal(formatDuration(1 / 60), '1 s');
  assert.equal(formatDuration(59 / 60), '59 s');
  assert.equal(formatDuration(1), '1 min');
  assert.equal(formatDuration(59 + 59 / 60), '59 min 59 s');
  assert.equal(formatDuration(60), '1 h');
  assert.equal(formatDuration(60 + 1 / 60), '1 h 1 s');
});

test('long intervals include days and omit empty components', () => {
  assert.equal(formatDuration(1440), '1 d');
  assert.equal(formatDuration(2 * 1440 + 3 * 60 + 4 + 5 / 60), '2 d 3 h 4 min 5 s');
  assert.equal(formatDuration(1440 + 1 / 60), '1 d 1 s');
});

test('fractional seconds round once before decomposing the duration', () => {
  assert.equal(formatDuration(0.49 / 60), '0 min');
  assert.equal(formatDuration(0.51 / 60), '1 s');
  assert.equal(formatDuration(59.6 / 60), '1 min');
  assert.equal(formatDuration(3599.6 / 60), '1 h');
  assert.equal(formatDuration(86399.6 / 60), '1 d');
});
