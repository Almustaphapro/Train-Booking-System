import { PDFDocument } from 'pdfkit';
import { fileURLToPath } from 'node:url';

const regular = fileURLToPath(new URL('./fonts/NotoSans-Regular.ttf', import.meta.url));
const bold = fileURLToPath(new URL('./fonts/NotoSans-Bold.ttf', import.meta.url));
const date = value => new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
const time = value => new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));

export function ticketPdf({ ticket: t, serverTime }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, font: regular,
      info: { Title: `RailConnect ticket ${t.ticketNumber}`, Author: 'RailConnect', Subject: t.isDemo ? 'Academic demonstration ticket — not valid for real travel' : 'Electronic railway ticket' } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk)); doc.on('error', reject); doc.on('end', () => resolve(Buffer.concat(chunks)));
    try {
      doc.registerFont('Regular', regular).registerFont('Bold', bold);
      const left = 40, width = doc.page.width - 80;
      const text = (value, x, y, size = 11, weight = 'Regular', color = '#202e29', w = width) => {
        doc.font(weight).fontSize(size).fillColor(color).text(String(value), x, y, { width: w, lineGap: 2 });
      };
      doc.rect(0, 0, doc.page.width, 106).fill('#125c46');
      text('RailConnect', left, 28, 24, 'Bold', '#ffffff');
      text('ELECTRONIC RAILWAY TICKET', left, 67, 10, 'Regular', '#ffffff');
      text(t.status, 400, 39, 15, 'Bold', '#ffffff', 155);
      let y = 122;
      text(t.isDemo ? 'DEMONSTRATION TICKET · NOT VALID FOR REAL TRAVEL' : 'YOUR JOURNEY DETAILS', left, y, 10, 'Bold', '#805816'); y += 26;
      function row(fields) {
        const gap = 18, cellWidth = (width - gap * (fields.length - 1)) / fields.length;
        let height = 0;
        for (const [i, [label, value]] of fields.entries()) {
          const x = left + i * (cellWidth + gap);
          text(label.toUpperCase(), x, y, 8, 'Regular', '#53675e', cellWidth);
          text(value, x, y + 16, 11, 'Bold', '#202e29', cellWidth);
          height = Math.max(height, doc.y - y);
        }
        y += height + 13;
        doc.moveTo(left, y).lineTo(left + width, y).strokeColor('#d9e2dd').lineWidth(0.6).stroke(); y += 13;
      }
      row([['Passenger', t.passengerName]]);
      row([['Train', `${t.train.name} (${t.train.code})`]]);
      row([['Origin', t.origin], ['Destination', t.destination]]);
      row([['Departure · WAT', `${date(t.departureTime)} · ${time(t.departureTime)}`], ['Arrival · WAT', `${date(t.arrivalTime)} · ${time(t.arrivalTime)}`]]);
      row([['Seat', t.seatNumber], ['Class', t.seatClass === 'BUSINESS' ? 'Business' : 'Economy'], ['Fare', new Intl.NumberFormat('en-NG', { style: 'currency', currency: t.currency }).format(Number(t.fare))]]);
      row([['Booking reference', t.bookingReference], ['Ticket number', t.ticketNumber]]);
      if (y + 190 > doc.page.height - 40) { doc.addPage(); y = 40; }
      doc.image(t.qrDataUrl, left, y, { width: 145, height: 145 });
      const x = left + 164, remaining = width - 164;
      text('SECURE QR TICKET', x, y + 10, 11, 'Bold', '#125c46', remaining);
      text(t.message, x, y + 33, 10, 'Regular', '#202e29', remaining);
      text('Keep this ticket private. Its QR contains only a secure token. Current validity must be checked by the server.', x, doc.y + 10, 9, 'Regular', '#53675e', remaining);
      text(`Status checked: ${date(serverTime)} · ${time(serverTime)} WAT. A saved copy does not guarantee current validity.`, left, y + 154, 8, 'Regular', '#53675e');
      text(t.isDemo ? 'University demonstration project. Schedules and fares are not official NRC data.' : 'All journey times are in West Africa Time (Africa/Lagos).', left, doc.y + 7, 8, 'Regular', '#53675e');
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}
