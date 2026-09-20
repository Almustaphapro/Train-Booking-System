export const label = value => value.toLowerCase().replaceAll('_', ' ').replace(/^./, char => char.toUpperCase());
export const routeLabel = row => `${row.originStation.name} → ${row.destinationStation.name}`;
export const money = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(Number(value));
export const dateTime = value => new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
export const statuses = { stations: ['ACTIVE', 'INACTIVE'], routes: ['ACTIVE', 'INACTIVE'], trains: ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED'], seats: ['ACTIVE', 'OUT_OF_SERVICE'], schedules: ['SCHEDULED', 'BOARDING', 'DEPARTED', 'COMPLETED', 'CANCELLED'] };
const field = (name, title, type = 'text', extra = {}) => ({ name, title, type, ...extra });
export const management = {
  stations: { singular: 'station', title: 'Stations', description: 'Manage the places where every journey begins and ends.', options: [],
    fields: [field('name', 'Station name', 'text', { maxLength: 150 }), field('code', 'Station code', 'text', { maxLength: 20 }), field('city', 'City', 'text', { maxLength: 100 }), field('state', 'State', 'text', { maxLength: 100 })],
    columns: [['Station', row => row.name], ['Code', row => row.code], ['Location', row => `${row.city}, ${row.state}`]],
  },
  routes: { singular: 'route', title: 'Routes', description: 'Connect two stations and define distance and travel time. Each direction is a separate route.', options: ['stations'],
    fields: [field('originStationId', 'Origin station', 'select', { source: 'stations' }), field('destinationStationId', 'Destination station', 'select', { source: 'stations' }), field('distanceKm', 'Distance (km)', 'number', { min: '0.01', max: '999999.99', step: '0.01' }), field('estimatedDuration', 'Estimated duration (minutes)', 'number', { min: 1, max: 10080, step: 1 })],
    columns: [['Journey', routeLabel], ['Distance', row => `${row.distanceKm} km`], ['Duration', row => `${row.estimatedDuration} min`]],
  },
  trains: { singular: 'train', title: 'Trains', description: 'Define your fleet and capacity, then configure the seats for each train.', options: [],
    fields: [field('name', 'Train name', 'text', { maxLength: 150 }), field('code', 'Train code', 'text', { maxLength: 30 }), field('capacity', 'Capacity', 'number', { min: 1, max: 1000, step: 1 })],
    columns: [['Train', row => row.name], ['Code', row => row.code], ['Seats / capacity', row => `${row._count.seats} / ${row.capacity}`]],
  },
  seats: { singular: 'seat', title: 'Seats', description: 'Manage physical seats. Out-of-service seats are blocked on upcoming scheduled journeys.', options: ['trains'],
    fields: [field('trainId', 'Train', 'select', { source: 'trains' }), field('seatNumber', 'Seat number', 'text', { maxLength: 10 }), field('seatClass', 'Seat class', 'select', { values: ['ECONOMY', 'BUSINESS'] })],
    columns: [['Seat', row => row.seatNumber], ['Train', row => `${row.train.name} · ${row.train.code}`], ['Class', row => label(row.seatClass)]],
  },
  schedules: { singular: 'schedule', title: 'Schedules', description: 'Plan departures, assign a train and set the fare for each seat class.', options: ['trains', 'routes'],
    fields: [field('trainId', 'Train', 'select', { source: 'trains' }), field('routeId', 'Route', 'select', { source: 'routes' }), field('departureTime', 'Departure', 'datetime-local'), field('arrivalTime', 'Arrival', 'datetime-local'), field('fareEconomy', 'Economy fare (NGN)', 'number', { min: 0, max: '9999999999.99', step: '0.01' }), field('fareBusiness', 'Business fare (NGN)', 'number', { min: 0, max: '9999999999.99', step: '0.01' })],
    columns: [['Journey', row => routeLabel(row.route)], ['Train', row => row.train.code], ['Departure', row => dateTime(row.departureTime)], ['Arrival', row => dateTime(row.arrivalTime)], ['Economy / Business', row => `${money(row.fareEconomy)} / ${money(row.fareBusiness)}`], ['Seats', row => row._count.scheduleSeats]],
  },
};
export function formValues(resource, row, trainId = '') {
  const result = Object.fromEntries(management[resource].fields.map(({ name, type, values }) => {
    let value = row?.[name] ?? (name === 'trainId' ? trainId : values?.[0] ?? '');
    if (type === 'datetime-local' && value) { const date = new Date(value); value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
    return [name, String(value)];
  }));
  return { ...result, status: row?.status ?? statuses[resource][0] };
}
export function payload(resource, values, original) {
  const data = { ...values };
  const initial = original ? formValues(resource, original) : null;
  for (const { name, type } of management[resource].fields) {
    if (['capacity', 'estimatedDuration'].includes(name)) data[name] = Number(data[name]);
    // datetime-local displays minutes. Preserve the original instant, including
    // seconds and offset, unless the administrator actually edits that field.
    if (type === 'datetime-local') data[name] = initial && values[name] === initial[name] ? original[name] : new Date(data[name]).toISOString();
  }
  return data;
}
