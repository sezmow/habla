// 14-day practice minutes, stacked by what the time was spent on.
// Speaking = coral, listening = indigo, other practice = teal (validated palette).

import { useState } from "react";
import type { DayActivity } from "../engine/types";

const SERIES = [
  { key: "speaking", label: "Speaking", color: "var(--chart-speaking)" },
  { key: "listening", label: "Listening", color: "var(--chart-listening)" },
  { key: "other", label: "Other practice", color: "var(--chart-other)" },
] as const;

function split(d: DayActivity) {
  const speaking = d.speakingSeconds / 60;
  const listening = d.listeningSeconds / 60;
  const other = Math.max(0, d.seconds / 60 - speaking - listening);
  return { speaking, listening, other, total: speaking + listening + other };
}

function niceMax(v: number) {
  const steps = [5, 10, 15, 20, 30, 45, 60, 90, 120];
  return steps.find((s) => s >= v) ?? Math.ceil(v / 60) * 60;
}

export function ActivityChart({ days, goal }: { days: DayActivity[]; goal: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const data = days.map((d) => ({ d, ...split(d) }));
  const max = niceMax(Math.max(goal, ...data.map((x) => x.total)));
  const W = 640;
  const H = 180;
  const padL = 30;
  const padB = 22;
  const plotH = H - padB - 8;
  const slot = (W - padL) / data.length;
  const barW = Math.min(24, slot * 0.6);
  const y = (m: number) => 8 + plotH - (m / max) * plotH;
  const ticks = [0, max / 2, max];
  const fmt = (m: number) => (m < 1 && m > 0 ? "<1" : String(Math.round(m)));
  const label = (d: DayActivity) => new Date(d.date + "T12:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <div>
      <div className="row-between wrap" style={{ gap: 10, marginBottom: 10 }}>
        <div className="legend" aria-label="Legend">
          {SERIES.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
          <span>
            <i className="legend-line" />
            Daily goal
          </span>
        </div>
        <button className="link-btn small" onClick={() => setTable((t) => !t)}>
          {table ? "Show chart" : "Show as table"}
        </button>
      </div>
      {table ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Speaking</th>
              <th>Listening</th>
              <th>Other</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.map((x) => (
              <tr key={x.d.date}>
                <td>{label(x.d)}</td>
                <td className="num">{fmt(x.speaking)} min</td>
                <td className="num">{fmt(x.listening)} min</td>
                <td className="num">{fmt(x.other)} min</td>
                <td className="num">
                  <strong>{fmt(x.total)} min</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="chart-wrap" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Minutes practiced per day for the last 14 days">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
                <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="chart-axis">
                  {Math.round(t)}
                </text>
              </g>
            ))}
            <line x1={padL} x2={W} y1={y(goal)} y2={y(goal)} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="0" opacity={0.6} />
            {data.map((x, i) => {
              const cx = padL + slot * i + slot / 2;
              let acc = 0;
              const segs = SERIES.map((s) => ({ s, v: x[s.key] })).filter((p) => p.v > 0.05);
              return (
                <g key={x.d.date} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${label(x.d)}: ${fmt(x.total)} minutes`}>
                  <rect x={padL + slot * i} y={0} width={slot} height={H - padB} fill="transparent" />
                  {hover === i && <rect x={padL + slot * i + 2} y={4} width={slot - 4} height={H - padB - 4} rx={6} fill="var(--surface-hover)" />}
                  {segs.map((p, k) => {
                    const top = y(acc + p.v);
                    const h = Math.max(1, y(acc) - top - (k < segs.length - 1 ? 2 : 0));
                    acc += p.v;
                    const isTop = k === segs.length - 1;
                    return isTop ? (
                      <path key={p.s.key} d={roundedTop(cx - barW / 2, top, barW, h, Math.min(4, h))} fill={p.s.color} />
                    ) : (
                      <rect key={p.s.key} x={cx - barW / 2} y={top + 2} width={barW} height={Math.max(0.5, h)} fill={p.s.color} />
                    );
                  })}
                  <text x={cx} y={H - 6} textAnchor="middle" className="chart-axis">
                    {new Date(x.d.date + "T12:00").toLocaleDateString(undefined, { weekday: "narrow" })}
                  </text>
                </g>
              );
            })}
          </svg>
          {hover != null && (
            <div className="chart-tip" style={{ left: `${((padL + slot * hover + slot / 2) / W) * 100}%` }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{label(data[hover].d)}</div>
              {SERIES.map((s) => (
                <div key={s.key} className="row-between" style={{ gap: 16 }}>
                  <span className="row" style={{ gap: 6 }}>
                    <i className="tip-swatch" style={{ background: s.color }} />
                    {s.label}
                  </span>
                  <span className="num">{fmt(data[hover][s.key])} min</span>
                </div>
              ))}
              <div className="row-between" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid var(--border)", fontWeight: 650 }}>
                <span>Total</span>
                <span className="num">{fmt(data[hover].total)} min</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}
