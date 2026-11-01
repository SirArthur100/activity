/**
 * Physical activity decay only. All timestamp arguments are epoch milliseconds.
 * Half-lives are the central values in the linked LNHB/DDEP evaluations, checked
 * 2026-11-01. Display rounding must never be used as input to this module.
 */

const sourceName = 'LNHB / DDEP';
const isotope = (id, symbol, name, halfLifeMinutes, halfLifeLabel) => Object.freeze({
  id, symbol, name, halfLifeMinutes, halfLifeLabel, sourceName,
  sourceUrl: `https://www.lnhb.fr/nuclides/${id}_tables.pdf`,
});

export const ISOTOPES = Object.freeze([
  isotope('Tc-99m', '⁹⁹ᵐTc', 'Technetium-99m', 6.0067 * 60, '6.0067 h'),
  isotope('F-18', '¹⁸F', 'Fluorine-18', 1.82890 * 60, '1.82890 h'),
  isotope('Ga-68', '⁶⁸Ga', 'Gallium-68', 67.83, '67.83 min'),
  isotope('I-123', '¹²³I', 'Iodine-123', 13.2234 * 60, '13.2234 h'),
  isotope('I-131', '¹³¹I', 'Iodine-131', 8.0233 * 1440, '8.0233 d'),
  isotope('Lu-177', '¹⁷⁷Lu', 'Lutetium-177', 6.6443 * 1440, '6.6443 d'),
  isotope('In-111', '¹¹¹In', 'Indium-111', 2.8049 * 1440, '2.8049 d'),
  isotope('Y-90', '⁹⁰Y', 'Yttrium-90', 2.6684 * 1440, '2.6684 d'),
  isotope('C-11', '¹¹C', 'Carbon-11', 20.361, '20.361 min'),
  isotope('N-13', '¹³N', 'Nitrogen-13', 9.9589, '9.9589 min'),
  isotope('O-15', '¹⁵O', 'Oxygen-15', 122.266 / 60, '122.266 s'),
]);

// The curie is exactly 3.7 × 10^10 Bq; 1 mCi = 37 MBq.
// NIST SP 811, Appendix B.9 (Radiology):
// https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9
export const UNITS = Object.freeze({
  MBq: Object.freeze({ label: 'MBq', toMBq: 1 }),
  GBq: Object.freeze({ label: 'GBq', toMBq: 1000 }),
  mCi: Object.freeze({ label: 'mCi', toMBq: 37 }),
  uCi: Object.freeze({ label: 'µCi', toMBq: 0.037 }),
});

export class ValidationError extends Error {
  constructor(message, field = '') {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/** A comma or point is a decimal separator; grouping and exponent syntax are not accepted. */
export function parseActivity(value) {
  const validType = typeof value === 'string' || typeof value === 'number';
  const text = typeof value === 'string' ? value.trim() : String(value);
  const validSyntax = typeof value === 'number' || /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text);
  const parsed = Number(text.replace(',', '.'));
  if (!validType || !validSyntax || text === '' || !Number.isFinite(parsed) || parsed < 0) {
    throw new ValidationError('Enter a nonnegative activity using a decimal point or comma, without thousands separators.', 'activity');
  }
  if (parsed === 0 && /[1-9]/.test(text)) {
    throw new ValidationError('The activity is too small for the supported numeric range.', 'activity');
  }
  return parsed;
}

function matchesLocal(date, year, month, day, hour, minute, second) {
  return date.getFullYear() === year && date.getMonth() === month - 1 &&
    date.getDate() === day && date.getHours() === hour &&
    date.getMinutes() === minute && date.getSeconds() === second;
}

/**
 * Parse native date/time inputs in the device time zone. Explicitly reject both
 * nonexistent spring-forward times and repeated fall-back times, rather than
 * silently choosing an instant the user did not specify.
 */
export function parseLocalDateTime(dateText, timeText) {
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  const timeParts = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeText);
  if (!dateParts || !timeParts) {
    throw new ValidationError('Enter a complete date and time.', 'dateTime');
  }
  const [, year, month, day] = dateParts.map(Number);
  const hour = Number(timeParts[1]);
  const minute = Number(timeParts[2]);
  const second = Number(timeParts[3] || 0);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31 ||
      hour > 23 || minute > 59 || second > 59) {
    throw new ValidationError('Enter a valid calendar date and time.', 'dateTime');
  }

  // setFullYear avoids JavaScript's special interpretation of years 00–99.
  const local = new Date(0);
  local.setFullYear(year, month - 1, day);
  local.setHours(hour, minute, second, 0);
  if (!matchesLocal(local, year, month, day, hour, minute, second)) {
    throw new ValidationError('This date or local time does not exist. Check the calendar and clock change.', 'dateTime');
  }

  const wallClock = new Date(0);
  wallClock.setUTCFullYear(year, month - 1, day);
  wallClock.setUTCHours(hour, minute, second, 0);
  const offsets = new Set([-2, -1, 0, 1, 2].map(days =>
    new Date(local.getTime() + days * 86400000).getTimezoneOffset()));
  for (const offset of offsets) {
    const candidate = new Date(wallClock.getTime() + offset * 60000);
    if (candidate.getTime() !== local.getTime() &&
        matchesLocal(candidate, year, month, day, hour, minute, second)) {
      throw new ValidationError('This local time occurs twice when clocks move back. An unambiguous local time is required.', 'dateTime');
    }
  }
  return local.getTime();
}

function activity(value, field, allowZero = true) {
  let parsed;
  try {
    parsed = parseActivity(value);
  } catch (error) {
    throw new ValidationError(error.message, field);
  }
  if (!allowZero && parsed === 0) {
    throw new ValidationError('Measured activity must be greater than zero.', field);
  }
  return parsed;
}

function unitFactor(unit, field) {
  if (!Object.hasOwn(UNITS, unit)) {
    throw new ValidationError('Select a valid activity unit.', field);
  }
  return UNITS[unit].toMBq;
}

function timestamp(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) ||
      !Number.isFinite(new Date(value).getTime())) {
    throw new ValidationError('Enter a valid date and time.', field);
  }
  return value;
}

function finitePositive(value, field) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError('The activity is outside the supported numeric range. Check the activity, unit and time interval.', field);
  }
  return value;
}

/**
 * Correct the full syringe forward to administration. Correct post-injection
 * residue backward to that SAME instant, then subtract it. No intermediate
 * rounding and no biological clearance or daughter ingrowth are modeled.
 */
export function calculateActivity({ isotopeId, measuredActivity, unit, measuredAt, administeredAt, residue = null }) {
  const selectedIsotope = ISOTOPES.find(item => item.id === isotopeId);
  if (!selectedIsotope) throw new ValidationError('Select an isotope.', 'isotopeId');
  const initial = activity(measuredActivity, 'measuredActivity', false);
  const factor = unitFactor(unit, 'unit');
  const initialMBq = finitePositive(initial * factor, 'measuredActivity');
  const start = timestamp(measuredAt, 'measuredAt');
  const administration = timestamp(administeredAt, 'administeredAt');
  if (administration < start) {
    throw new ValidationError('Administration must be at or after the initial measurement. Check both dates when crossing midnight.', 'administeredAt');
  }

  const elapsedMinutes = (administration - start) / 60000;
  const remainingFraction = Math.exp(-Math.LN2 * elapsedMinutes / selectedIsotope.halfLifeMinutes);
  const grossMBq = finitePositive(initialMBq * remainingFraction, 'administeredAt');
  let residueMBq = 0;
  let residueElapsedMinutes = null;
  if (residue !== null && residue !== undefined) {
    if (typeof residue !== 'object') throw new ValidationError('Enter the residual activity and measurement time.', 'residue.activity');
    const residual = activity(residue.activity, 'residue.activity');
    const residualFactor = unitFactor(residue.unit, 'residue.unit');
    const residualTime = timestamp(residue.measuredAt, 'residue.measuredAt');
    if (residualTime < administration) {
      throw new ValidationError('Measure syringe residue at or after administration.', 'residue.measuredAt');
    }
    residueElapsedMinutes = (residualTime - administration) / 60000;
    if (residual > 0) {
      const residualMBqMeasured = finitePositive(residual * residualFactor, 'residue.activity');
      residueMBq = finitePositive(residualMBqMeasured * Math.exp(Math.LN2 * residueElapsedMinutes / selectedIsotope.halfLifeMinutes), 'residue.activity');
    }
    if (residueMBq > grossMBq) {
      throw new ValidationError('Corrected syringe residue exceeds the activity available at administration. Check the activity, unit and times.', 'residue.activity');
    }
  }

  const netMBq = grossMBq - residueMBq;
  const netInUnit = netMBq / factor;
  const grossInUnit = grossMBq / factor;
  const residueInUnit = residueMBq / factor;
  if (![netInUnit, grossInUnit, residueInUnit].every(Number.isFinite) ||
      (netMBq > 0 && netInUnit === 0)) {
    throw new ValidationError('The result is outside the supported numeric range for this unit.', 'unit');
  }
  return {
    isotope: selectedIsotope, unit, initialMBq, grossMBq, residueMBq, netMBq,
    netInUnit, grossInUnit, residueInUnit, elapsedMinutes, residueElapsedMinutes,
    remainingFraction, hasResidue: residue !== null && residue !== undefined,
  };
}
