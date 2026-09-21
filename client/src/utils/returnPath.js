// Only same-app passenger destinations can be used after authentication.
export function passengerReturnPath(value) {
  return typeof value === 'string' && /^\/(?:schedules\/[a-zA-Z0-9_-]+\/(?:seats|review)|passenger\/bookings(?:\/[a-zA-Z0-9_-]+(?:\/payment)?)?|passenger\/tickets(?:\/[a-zA-Z0-9_-]+)?)(?:\?[^#\s]*)?$/.test(value) ? value : null;
}

export function roleReturnPath(role, value) {
  if (role === 'PASSENGER') return passengerReturnPath(value);
  return role === 'TICKET_OFFICER' && ['/officer/verify', '/officer/dashboard'].includes(value) ? value : null;
}
