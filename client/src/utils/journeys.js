export const railwayTimezone = 'Africa/Lagos';
export function travelDate(value = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: railwayTimezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export const journeyTime = value => new Intl.DateTimeFormat('en-NG', { timeZone: railwayTimezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
export const journeyDate = value => new Intl.DateTimeFormat('en-NG', { timeZone: railwayTimezone, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value.length === 10 ? `${value}T12:00:00+01:00` : value));
export const fare = (value, currency = 'NGN') => new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(Number(value));
export function duration(minutes) { return minutes < 1 ? 'Less than 1 min' : `${minutes >= 60 ? `${Math.floor(minutes / 60)}h ` : ''}${minutes % 60 ? `${minutes % 60}m` : ''}`.trim(); }
