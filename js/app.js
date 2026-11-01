import { ISOTOPES, UNITS, parseActivity, parseLocalDateTime, calculateActivity } from './calculator.js';
import { formatNumber, formatDuration } from './format.js';

const $ = (id) => document.getElementById(id);
const form = $('activity-form');
const touched = new Set();
let currentResult = null;
let currentInput = null;
let announceTimer;
let toastTimer;

const pad = (value) => String(value).padStart(2, '0');
const localDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const localTime = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
const unitLabel = (unit) => UNITS[unit].label;

function formatActivity(value, unit) {
  return `${formatNumber(value)} ${unitLabel(unit)}`;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const offset = -date.getTimezoneOffset();
  const zone = `UTC${offset >= 0 ? '+' : '−'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
  return `${localDate(date)} ${localTime(date)} (${zone})`;
}

function setDateTime(prefix, date) {
  $(`${prefix}-date`).value = localDate(date);
  $(`${prefix}-time`).value = localTime(date);
}

function updateIsotope() {
  const isotope = ISOTOPES.find((item) => item.id === $('isotope').value);
  $('half-life-value').textContent = isotope.halfLifeLabel;
  $('half-life-source').href = isotope.sourceUrl;
  document.querySelectorAll('[data-isotope]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.isotope === isotope.id)));
}

function clearErrors() {
  form.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'));
  form.querySelectorAll('.field-error').forEach((error) => { error.hidden = true; error.textContent = ''; });
  $('error-summary').hidden = true;
  $('error-summary').textContent = '';
}

function showFieldError(id, message) {
  $(id)?.setAttribute('aria-invalid', 'true');
  const error = $(`${id}-error`);
  if (error) { error.textContent = message; error.hidden = false; }
}

function announce(message) {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { $('result-announcement').textContent = message; }, 500);
}

function hideResult(message, isError = false) {
  currentResult = null;
  currentInput = null;
  $('result-content').hidden = true;
  $('result-empty').hidden = false;
  $('empty-message').textContent = message;
  $('result-status').textContent = isError ? 'Check your entries' : 'Ready when you are';
  $('result-status').classList.toggle('has-error', isError);
  $('mobile-result-value').textContent = isError ? 'Check your entries' : 'Awaiting measurements';
  document.querySelector('.result-placeholder span').textContent = ` ${unitLabel($('activity-unit').value)}`;
  announce(message);
}

const errorFields = {
  isotopeId: 'isotope', measuredActivity: 'measured-activity', unit: 'activity-unit',
  measuredAt: 'measurement-time', administeredAt: 'administration-time',
  'residue.activity': 'residue-activity', 'residue.unit': 'residue-unit', 'residue.measuredAt': 'residue-time',
};

function collectInput() {
  const residueEnabled = $('residue-toggle').checked;
  const required = ['measured-activity', 'measurement-date', 'measurement-time', 'administration-date', 'administration-time'];
  if (residueEnabled) required.push('residue-activity', 'residue-date', 'residue-time');
  const problems = [];
  const missing = required.filter((id) => !$(id).value.trim());
  for (const id of missing) if (touched.has(id)) problems.push({ id, message: 'Enter a value to calculate.' });

  const parseReading = (id, allowZero) => {
    if (!$(id).value.trim()) return null;
    try {
      const value = parseActivity($(id).value);
      if (!allowZero && value === 0) throw new Error('Measured activity must be greater than zero.');
      return value;
    } catch (error) { problems.push({ id, message: error.message }); return null; }
  };
  const parseTime = (prefix) => {
    const date = $(`${prefix}-date`).value;
    const time = $(`${prefix}-time`).value;
    if (!date || !time) return null;
    try { return parseLocalDateTime(date, time); }
    catch (error) { problems.push({ id: `${prefix}-time`, message: error.message }); return null; }
  };
  const input = {
    isotopeId: $('isotope').value,
    measuredActivity: parseReading('measured-activity', false),
    unit: $('activity-unit').value,
    measuredAt: parseTime('measurement'),
    administeredAt: parseTime('administration'),
    residue: residueEnabled ? { activity: parseReading('residue-activity', true), unit: $('residue-unit').value, measuredAt: parseTime('residue') } : null,
  };
  return { input, problems, missing };
}

function updateShortcuts() {
  let valid = false;
  try { parseLocalDateTime($('measurement-date').value, $('measurement-time').value); valid = true; } catch { /* Incomplete measurement time. */ }
  document.querySelectorAll('[data-offset]').forEach((button) => { button.disabled = !valid; });
}

function renderResult(result, input) {
  currentResult = result;
  currentInput = input;
  const { unit } = input;
  const factor = UNITS[unit].toMBq;
  const net = result.netMBq / factor;
  const residueEnabled = Boolean(input.residue);
  const alternateUnit = unit === 'mCi' || unit === 'uCi' ? 'MBq' : 'mCi';
  $('result-empty').hidden = true;
  $('result-content').hidden = false;
  $('result-status').textContent = 'Updated automatically';
  $('result-status').classList.remove('has-error');
  $('result-value').textContent = formatNumber(net);
  $('result-value').classList.toggle('compact-number', formatNumber(net).length > 9);
  $('result-unit').textContent = unitLabel(unit);
  $('result-secondary').textContent = `= ${formatActivity(result.netMBq / UNITS[alternateUnit].toMBq, alternateUnit)}`;
  $('elapsed').textContent = `${formatDuration(result.elapsedMinutes)} from measurement`;
  $('gross-result').textContent = formatActivity(result.grossMBq / factor, unit);
  $('residue-result').textContent = `− ${formatActivity(result.residueMBq / factor, unit)}`;
  $('net-result').textContent = formatActivity(net, unit);
  $('residue-result-row').hidden = !residueEnabled;
  $('net-result-row').hidden = !residueEnabled;
  $('result-note').textContent = residueEnabled
    ? `Residue corrected back ${formatDuration(result.residueElapsedMinutes)} to the injection time.`
    : 'Before any syringe residue is subtracted. Enable residue correction if a reading is available.';
  $('result-isotope').textContent = `${input.isotopeId} · T½ ${result.isotope.halfLifeLabel}`;
  $('result-time').textContent = formatTimestamp(input.administeredAt);
  $('mobile-result-value').textContent = formatActivity(net, unit);
  announce(`${residueEnabled ? 'Net administered activity' : 'Activity at administration'}: ${formatActivity(net, unit)}. ${formatDuration(result.elapsedMinutes)} from measurement.`);
}

function update() {
  clearErrors();
  $('copy-fallback').hidden = true;
  updateShortcuts();
  const residueEnabled = $('residue-toggle').checked;
  $('result-title').textContent = residueEnabled ? 'NET ADMINISTERED ACTIVITY' : 'ACTIVITY AT ADMINISTRATION';
  $('mobile-result-label').textContent = residueEnabled ? 'Net administered activity' : 'Activity at administration';
  const { input, problems, missing } = collectInput();
  if (problems.length) {
    for (const problem of problems) showFieldError(problem.id, problem.message);
    hideResult('Complete or correct the highlighted entries to calculate.', true);
    $('error-summary').textContent = problems[0].message;
    $('error-summary').hidden = false;
    return;
  }
  if (missing.length) {
    hideResult(residueEnabled ? 'Enter the activity, both times, and the residue reading and time. Your result updates automatically.' : 'Enter an activity and both times. Your result updates automatically.');
    return;
  }
  try { renderResult(calculateActivity(input), input); }
  catch (error) {
    showFieldError(errorFields[error.field] || 'measured-activity', error.message);
    hideResult('Complete or correct the highlighted entries to calculate.', true);
    $('error-summary').textContent = error.message;
    $('error-summary').hidden = false;
  }
}

function buildCopyText() {
  const result = currentResult;
  const input = currentInput;
  if (!result || !input) return '';
  const lines = [
    'Nuclear medicine activity calculation',
    `Radionuclide: ${input.isotopeId}; physical half-life: ${result.isotope.halfLifeLabel} (LNHB/DDEP)`,
    `Measured: ${input.measuredActivity} ${unitLabel(input.unit)} at ${formatTimestamp(input.measuredAt)}`,
    `Administration: ${formatTimestamp(input.administeredAt)}`,
    `Elapsed: ${formatDuration(result.elapsedMinutes)}`,
    `Activity at administration: ${formatActivity(result.grossMBq / UNITS[input.unit].toMBq, input.unit)}`,
  ];
  if (input.residue) lines.push(
    `Residue measured: ${input.residue.activity} ${unitLabel(input.residue.unit)} at ${formatTimestamp(input.residue.measuredAt)}`,
    `Residue corrected to administration: ${formatActivity(result.residueMBq / UNITS[input.unit].toMBq, input.unit)}`,
    `Net administered activity: ${formatActivity(result.netMBq / UNITS[input.unit].toMBq, input.unit)}`,
  );
  else lines.push('No residue correction applied.');
  lines.push('Displayed results rounded to 6 significant digits (scientific notation for very small/large values).', `Half-life reference: ${result.isotope.sourceUrl}`, 'Physical decay calculation; verify against the department’s validated procedure.');
  return lines.join('\n');
}

function showToast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2500);
}

function resetCalculation() {
  const now = new Date();
  for (const prefix of ['measurement', 'administration', 'residue']) {
    $(`${prefix}-date`).value = localDate(now);
    $(`${prefix}-time`).value = '';
  }
  $('measured-activity').value = '';
  $('residue-activity').value = '';
  $('residue-toggle').checked = false;
  $('residue-fields').hidden = true;
  $('residue-fields').disabled = true;
  $('residue-unit').value = $('activity-unit').value;
  touched.clear();
  update();
}

function initialize() {
  $('isotope').replaceChildren(...ISOTOPES.map((isotope) => new Option(`${isotope.symbol} · ${isotope.name}`, isotope.id)));
  $('isotope').value = 'Tc-99m';
  const rows = ISOTOPES.map((isotope) => {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = isotope.symbol;
    const value = document.createElement('td');
    const link = document.createElement('a');
    link.textContent = `${isotope.halfLifeLabel} ↗`;
    link.href = isotope.sourceUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${isotope.id}: ${isotope.halfLifeLabel}, reference opens in new tab`);
    value.append(link);
    row.append(name, value);
    return row;
  });
  $('isotope-references').replaceChildren(...rows);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'device local time';
  $('timezone-note').textContent = `Local time · ${zone}. Seconds are supported. Check the date for overnight calculations.`;
  updateIsotope();
  resetCalculation();
}

form.addEventListener('input', (event) => {
  if (event.target.matches('input:not([type="checkbox"])')) update();
});
form.addEventListener('focusout', (event) => {
  if (event.target.matches('input:not([type="checkbox"])')) { touched.add(event.target.id); update(); }
});
form.addEventListener('change', (event) => {
  if (event.target.id === 'isotope') updateIsotope();
  if (event.target.id === 'activity-unit') {
    if (!$('residue-activity').value.trim()) $('residue-unit').value = event.target.value;
  }
  if (event.target.id === 'residue-toggle') {
    $('residue-fields').hidden = !event.target.checked;
    $('residue-fields').disabled = !event.target.checked;
    if (event.target.checked) $('residue-activity').focus({ preventScroll: true });
  }
  update();
});
form.addEventListener('submit', (event) => { event.preventDefault(); update(); });
document.querySelectorAll('[data-isotope]').forEach((button) => button.addEventListener('click', () => {
  $('isotope').value = button.dataset.isotope;
  updateIsotope();
  update();
}));
document.querySelectorAll('[data-now]').forEach((button) => button.addEventListener('click', () => { setDateTime(button.dataset.now, new Date()); update(); }));
document.querySelectorAll('[data-offset]').forEach((button) => button.addEventListener('click', () => {
  try {
    const measuredAt = parseLocalDateTime($('measurement-date').value, $('measurement-time').value);
    setDateTime('administration', new Date(measuredAt + Number(button.dataset.offset) * 60000));
    update();
  } catch { update(); }
}));
$('reset-button').addEventListener('click', () => { resetCalculation(); $('measured-activity').focus(); showToast('Ready for a new calculation'); });
$('copy-result').addEventListener('click', async () => {
  const text = buildCopyText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Calculation copied');
  } catch {
    $('copy-text').value = text;
    $('copy-fallback').hidden = false;
    $('copy-text').focus();
    $('copy-text').select();
    showToast('Select and copy the calculation below');
  }
});
initialize();
