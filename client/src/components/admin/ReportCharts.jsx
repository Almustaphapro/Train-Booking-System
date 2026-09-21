import { useState } from 'react';
import { money } from './MonitoringUI.jsx';

const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
export function TrendChart({ title, rows, field, currency = false }) {
  const [active, setActive] = useState(null);
  if (!rows.length) return <section className="monitor-chart"><header><h2>{title}</h2><span>Daily · WAT</span></header><p className="monitor-empty">No data is available for this period.</p></section>;
  const values = rows.map(row => Number(row[field])), peak = Math.max(0, ...values), maximum = peak || 1;
  const x = index => 48 + index * 510 / Math.max(1, rows.length - 1), y = value => 154 - value / maximum * 125;
  const points = rows.map((row, index) => `${x(index)},${y(Number(row[field]))}`).join(' ');
  const format = value => currency ? money(value) : Number(value).toLocaleString();
  const selected = rows[active ?? rows.length - 1];
  return <section className="monitor-chart"><header><h2>{title}</h2><span>Daily · WAT</span></header>
    {peak === 0 && <p className="monitor-empty">No {currency ? 'paid revenue' : 'bookings'} in this period.</p>}
    <svg viewBox="0 0 600 190" className="monitor-trend" aria-label={`${title}, ${rows.length} days. Exact values are in the data table.`} role="img">
      {[0, .5, 1].map(fraction => <g key={fraction}><line x1="48" x2="570" y1={y(maximum * fraction)} y2={y(maximum * fraction)} className="chart-grid"/><text x="42" y={y(maximum * fraction) + 4} textAnchor="end">{new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(maximum * fraction)}</text></g>)}
      <polyline points={points} fill="none" className="chart-line"/>
      {rows.map((row, index) => <circle key={row.date} cx={x(index)} cy={y(Number(row[field]))} r={active === index ? 5 : 3} className="chart-point" onMouseEnter={() => setActive(index)}><title>{dateLabel(row.date)}: {format(row[field])}</title></circle>)}
      <text x="48" y="182">{dateLabel(rows[0].date)}</text><text x="558" y="182" textAnchor="end">{dateLabel(rows.at(-1).date)}</text>
    </svg>
    <label className="chart-inspector">Inspect day <input aria-label={`Inspect ${title.toLowerCase()} day`} type="range" min={0} max={rows.length - 1} value={active ?? rows.length - 1} onChange={event => setActive(Number(event.target.value))}/><output>{dateLabel(selected.date)} · {format(selected[field])}</output></label>
    <details className="chart-data"><summary>View exact daily data</summary><div className="admin-table-scroll"><table className="admin-table"><caption className="sr-only">{title}</caption><thead><tr><th>Date · WAT</th><th>{currency ? 'NGN' : 'Bookings'}</th></tr></thead><tbody>{rows.map(row => <tr key={row.date}><td>{row.date}</td><td>{format(row[field])}</td></tr>)}</tbody></table></div></details>
  </section>;
}
export function BarChart({ title, rows, emptyText }) {
  const max = Math.max(1, ...rows.map(row => row.value));
  return <section className="monitor-chart"><header><h2>{title}</h2><span>Selected period</span></header>
    {!rows.some(row => row.value > 0) ? <p className="monitor-empty">{emptyText}</p> : <ul className="monitor-bars">{rows.map(row => <li key={row.key}><div><span>{row.label}</span><strong>{row.value.toLocaleString()}</strong></div><div className="monitor-bar-track" aria-hidden="true"><span style={{ width: `${row.value / max * 100}%` }}/></div></li>)}</ul>}
  </section>;
}
