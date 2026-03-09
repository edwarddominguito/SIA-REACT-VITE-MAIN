import React, { useMemo, useState } from "react";
import { formatClockTime, formatDateTimeLabel } from "../lib/dashboardUtils.js";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const dateKey = (dateValue) => {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const parseDateOnly = (rawDate) => {
  const value = String(rawDate || "").trim();
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const buildMonthCells = (year, monthIndex) => {
  const first = new Date(year, monthIndex, 1);
  const firstWeekdayMonBased = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const prevMonthDays = new Date(year, monthIndex, 0).getDate();

  const cells = [];

  for (let i = firstWeekdayMonBased - 1; i >= 0; i -= 1) {
    const day = prevMonthDays - i;
    const d = new Date(year, monthIndex - 1, day);
    cells.push({ date: d, inMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: new Date(year, monthIndex, day), inMonth: true });
  }

  const remaining = 42 - cells.length;
  for (let day = 1; day <= remaining; day += 1) {
    cells.push({ date: new Date(year, monthIndex + 1, day), inMonth: false });
  }

  return cells;
};

export default function DashboardCalendar({
  title = "Events Calendar",
  subtitle = "See your upcoming events this month",
  events = []
}) {
  const [cursor, setCursor] = useState(() => new Date());

  const monthStart = useMemo(
    () => new Date(cursor.getFullYear(), cursor.getMonth(), 1),
    [cursor]
  );
  const monthLabel = monthStart.toLocaleString(undefined, { month: "long", year: "numeric" });
  const monthCells = useMemo(
    () => buildMonthCells(monthStart.getFullYear(), monthStart.getMonth()),
    [monthStart]
  );

  const normalizedEvents = useMemo(
    () =>
      (events || [])
        .map((evt, idx) => {
          const d = parseDateOnly(evt?.date);
          if (!d) return null;
          return {
            id: evt?.id || `evt-${idx}`,
            title: String(evt?.title || "Event").trim(),
            type: String(evt?.type || "event").trim().toLowerCase(),
            status: String(evt?.status || "").trim().toLowerCase(),
            date: dateKey(d),
            time: String(evt?.time || "").trim()
          };
        })
        .filter(Boolean),
    [events]
  );

  const byDate = useMemo(() => {
    const map = new Map();
    normalizedEvents.forEach((evt) => {
      const list = map.get(evt.date) || [];
      list.push(evt);
      map.set(evt.date, list);
    });
    return map;
  }, [normalizedEvents]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return normalizedEvents
      .map((evt) => {
        const stamp = new Date(`${evt.date}T${evt.time || "00:00"}:00`);
        return { ...evt, ts: Number.isNaN(stamp.getTime()) ? now : stamp.getTime() };
      })
      .filter((evt) => evt.ts >= now - 60000)
      .sort((a, b) => a.ts - b.ts)
      .slice(0, 6);
  }, [normalizedEvents]);

  const todayKey = dateKey(new Date());

  return (
    <section className="agent-panel dashboard-calendar-panel">
      <div className="dashboard-calendar-head">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <div className="dashboard-calendar-nav">
          <button
            type="button"
            className="btn btn-outline-dark btn-sm"
            onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            <i className="bi bi-chevron-left"></i>
          </button>
          <strong>{monthLabel}</strong>
          <button
            type="button"
            className="btn btn-outline-dark btn-sm"
            onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            <i className="bi bi-chevron-right"></i>
          </button>
        </div>
      </div>

      <div className="dashboard-calendar-layout">
        <div className="dashboard-calendar-grid-wrap">
          <div className="dashboard-calendar-weekdays">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="dashboard-calendar-grid">
            {monthCells.map((cell) => {
              const key = dateKey(cell.date);
              const list = byDate.get(key) || [];
              const isToday = key === todayKey;
              return (
                <article
                  key={key}
                  className={`dashboard-calendar-cell ${cell.inMonth ? "in-month" : "out-month"} ${isToday ? "today" : ""}`}
                >
                  <div className="dashboard-calendar-day">{cell.date.getDate()}</div>
                  <div className="dashboard-calendar-events">
                    {list.slice(0, 2).map((evt) => (
                      <div key={evt.id} className={`dashboard-calendar-chip type-${evt.type}`}>
                        <span>{formatClockTime(evt.time, "")}</span>
                        <strong>{evt.title}</strong>
                      </div>
                    ))}
                    {list.length > 2 && <div className="dashboard-calendar-more">+{list.length - 2} more</div>}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="dashboard-calendar-upcoming">
          <h4>Upcoming</h4>
          <div className="dashboard-calendar-upcoming-list">
            {upcoming.map((evt) => (
              <article key={`up-${evt.id}`} className={`dashboard-calendar-upcoming-item type-${evt.type}`}>
                <div className="dashboard-calendar-upcoming-time">
                  {formatDateTimeLabel(evt.date, evt.time)}
                </div>
                <div className="dashboard-calendar-upcoming-title">{evt.title}</div>
                {!!evt.status && <div className="dashboard-calendar-upcoming-status">{evt.status}</div>}
              </article>
            ))}
            {!upcoming.length && (
              <div className="dashboard-calendar-empty">No upcoming events.</div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
