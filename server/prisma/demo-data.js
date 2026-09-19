export const demoStations = [
  { code: 'DEMO-ABV', name: 'Abuja Idu', city: 'Abuja', state: 'Federal Capital Territory' },
  { code: 'DEMO-KAD', name: 'Kaduna Rigasa', city: 'Kaduna', state: 'Kaduna' },
  { code: 'DEMO-LOS', name: 'Lagos Mobolaji Johnson', city: 'Lagos', state: 'Lagos' },
  { code: 'DEMO-IBA', name: 'Ibadan Moniya', city: 'Ibadan', state: 'Oyo' },
];

export const demoUsers = [
  { fullName: 'Demo Administrator', email: 'admin@trainapp.test', phone: '+2340000000001', role: 'ADMIN', passwordVariable: 'DEMO_ADMIN_PASSWORD' },
  { fullName: 'Demo Ticket Officer', email: 'officer@trainapp.test', phone: '+2340000000002', role: 'TICKET_OFFICER', passwordVariable: 'DEMO_OFFICER_PASSWORD' },
  { fullName: 'Demo Passenger', email: 'passenger@trainapp.test', phone: '+2340000000003', role: 'PASSENGER', passwordVariable: 'DEMO_PASSENGER_PASSWORD' },
];

export const demoTrains = [
  { code: 'DEMO-NORTH', name: 'DEMONSTRATION Northern Train', capacity: 24 },
  { code: 'DEMO-WEST', name: 'DEMONSTRATION Western Train', capacity: 24 },
];

// All distances, durations, departure times and fares below are fabricated examples.
// They are NOT Nigerian Railway Corporation schedules, prices or operational data.
export const demoRoutes = [
  { origin: 'DEMO-ABV', destination: 'DEMO-KAD', train: 'DEMO-NORTH', distanceKm: '180.00', estimatedDuration: 150, hourUtc: 7, economy: '4500.00', business: '9000.00' },
  { origin: 'DEMO-KAD', destination: 'DEMO-ABV', train: 'DEMO-NORTH', distanceKm: '180.00', estimatedDuration: 150, hourUtc: 13, economy: '4500.00', business: '9000.00' },
  { origin: 'DEMO-LOS', destination: 'DEMO-IBA', train: 'DEMO-WEST', distanceKm: '160.00', estimatedDuration: 165, hourUtc: 7, economy: '4000.00', business: '8500.00' },
  { origin: 'DEMO-IBA', destination: 'DEMO-LOS', train: 'DEMO-WEST', distanceKm: '160.00', estimatedDuration: 165, hourUtc: 13, economy: '4000.00', business: '8500.00' },
];

export const expectedDemoCounts = { users: 3, stations: 4, routes: 4, trains: 2, seats: 48, schedules: 12, scheduleSeats: 288 };
