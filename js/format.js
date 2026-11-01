const activityFormatter = new Intl.NumberFormat('en-GB', {
  maximumSignificantDigits: 6,
});

/** Display rounding only: retain precision across activity units and magnitudes. */
export function formatNumber(value) {
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude < 0.0001 || magnitude >= 1e9) return value.toExponential(5);
  return activityFormatter.format(value);
}

/** Render an elapsed interval without rounding whole minutes before decomposition. */
export function formatDuration(minutes) {
  const totalSeconds = Math.round(minutes * 60);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [
    days ? `${days} d` : '',
    hours ? `${hours} h` : '',
    mins ? `${mins} min` : '',
    seconds ? `${seconds} s` : '',
    totalSeconds === 0 ? '0 min' : '',
  ].filter(Boolean).join(' ');
}
