import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { dateOnlyValue, eventDateTimeStamp, formatClockTime } from "@/utils/domain.js";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TYPE_ORDER = ["appointment", "meet", "trip", "event"];
const TYPE_META = {
  all: { label: "All events", shortLabel: "All", icon: "bi-grid-1x2" },
  appointment: { label: "Appointments", shortLabel: "Appointments", icon: "bi-calendar2-check" },
  meet: { label: "Office Meetings", shortLabel: "Meetings", icon: "bi-building" },
  trip: { label: "Property Tours", shortLabel: "Tours", icon: "bi-car-front" },
  event: { label: "Other Events", shortLabel: "Other", icon: "bi-calendar-event" }
};

const dateKey = (dateValue) => {
  return dateOnlyValue(dateValue);
};

const parseDateOnly = (rawDate) => {
  const value = dateOnlyValue(rawDate);
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (![year, month, day].every(Number.isInteger)) return null;
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const normalizeType = (rawType) => {
  const value = String(rawType || "event").trim().toLowerCase();
  if (value === "office-meet") return "meet";
  if (value === "tour") return "trip";
  if (TYPE_META[value]) return value;
  return "event";
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

  const totalCells = cells.length <= 35 ? 35 : 42;
  const remaining = totalCells - cells.length;
  for (let day = 1; day <= remaining; day += 1) {
    cells.push({ date: new Date(year, monthIndex + 1, day), inMonth: false });
  }

  return cells;
};

const getEventTimestamp = (dateLike, timeLike) => {
  return eventDateTimeStamp(dateLike, timeLike);
};

const isSameMonth = (dateObject, monthStart) =>
  dateObject?.getFullYear() === monthStart.getFullYear() &&
  dateObject?.getMonth() === monthStart.getMonth();

const formatMonthRange = (monthStart) => {
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const startLabel = monthStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = monthEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel} - ${endLabel}`;
};

const formatAgendaDate = (dateObject, timeLike) => {
  if (!(dateObject instanceof Date) || Number.isNaN(dateObject.getTime())) return "-";
  const dateLabel = dateObject.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const timeLabel = formatClockTime(timeLike, "");
  return timeLabel ? `${dateLabel} \u2022 ${timeLabel}` : dateLabel;
};

const formatStatusLabel = (statusLike) => {
  const value = String(statusLike || "").trim().replace(/-/g, " ");
  if (!value) return "Pending";
  return value.replace(/\b\w/g, (match) => match.toUpperCase());
};

const countLabel = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

export default function DashboardCalendar({
  title = "Events Calendar",
  subtitle = "See your upcoming events this month",
  events = [],
  storageKey = "dashboard-calendar-cursor"
}) {
  const [cursor, setCursor] = useState(() => {
    const fallback = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    if (typeof window === "undefined" || !storageKey) {
      return fallback;
    }

    try {
      const saved = window.localStorage.getItem(storageKey);
      const parsed = saved ? new Date(saved) : null;
      if (parsed && !Number.isNaN(parsed.getTime())) {
        return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
      }
    } catch {
      // ignore storage failures
    }

    return fallback;
  });
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    if (typeof window === "undefined" || !storageKey) {
      return;
    }

    try {
      const value = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-01`;
      window.localStorage.setItem(storageKey, value);
    } catch {
      // ignore storage failures
    }
  }, [cursor, storageKey]);

  const monthStart = useMemo(
    () => new Date(cursor.getFullYear(), cursor.getMonth(), 1),
    [cursor]
  );
  const monthLabel = monthStart.toLocaleString(undefined, { month: "long", year: "numeric" });
  const monthRangeLabel = useMemo(() => formatMonthRange(monthStart), [monthStart]);
  const monthCells = useMemo(
    () => buildMonthCells(monthStart.getFullYear(), monthStart.getMonth()),
    [monthStart]
  );

  const normalizedEvents = useMemo(
    () =>
      (events || [])
        .map((evt, idx) => {
          const dateObject = parseDateOnly(evt?.date);
          if (!dateObject) return null;
          const type = normalizeType(evt?.type);
          const status = String(evt?.status || "").trim().toLowerCase();
          const stamp = getEventTimestamp(evt?.date, evt?.time);
          const titleLabel = String(evt?.title || "Event").trim() || "Event";
          const subtitleLabel = String(evt?.subtitle || evt?.location || "").trim();
          const descriptionLabel = String(evt?.description || evt?.notes || "").trim();

          return {
            id: evt?.id || `evt-${idx}`,
            title: titleLabel,
            subtitle: subtitleLabel,
            description: descriptionLabel,
            type,
            status,
            date: dateKey(dateObject),
            dateObject,
            time: String(evt?.time || "").trim(),
            stamp: Number.isFinite(stamp) ? stamp : dateObject.getTime(),
            searchText: [
              titleLabel,
              subtitleLabel,
              descriptionLabel,
              TYPE_META[type]?.label || TYPE_META.event.label,
              status,
              evt?.date,
              evt?.time
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
          };
        })
        .filter(Boolean)
        .sort((a, b) => Number(a.stamp || 0) - Number(b.stamp || 0)),
    [events]
  );

  const monthEventCounts = useMemo(() => {
    const counts = { all: 0, appointment: 0, meet: 0, trip: 0, event: 0 };
    normalizedEvents.forEach((evt) => {
      if (!isSameMonth(evt.dateObject, monthStart)) return;
      counts.all += 1;
      if (Object.prototype.hasOwnProperty.call(counts, evt.type)) {
        counts[evt.type] += 1;
      } else {
        counts.event += 1;
      }
    });
    return counts;
  }, [monthStart, normalizedEvents]);

  const filterTabs = useMemo(() => {
    const keys = TYPE_ORDER.filter((type) => normalizedEvents.some((evt) => evt.type === type));
    return ["all", ...keys].map((key) => ({
      key,
      label: TYPE_META[key]?.label || TYPE_META.event.label,
      count: monthEventCounts[key] || 0
    }));
  }, [monthEventCounts, normalizedEvents]);

  const filteredEvents = useMemo(
    () =>
      normalizedEvents.filter((evt) => {
        const matchesType = activeFilter === "all" || evt.type === activeFilter;
        const matchesSearch = !deferredSearch || evt.searchText.includes(deferredSearch);
        return matchesType && matchesSearch;
      }),
    [activeFilter, deferredSearch, normalizedEvents]
  );

  const byDate = useMemo(() => {
    const map = new Map();
    filteredEvents.forEach((evt) => {
      const list = map.get(evt.date) || [];
      list.push(evt);
      map.set(evt.date, list);
    });
    map.forEach((list, key) => {
      map.set(
        key,
        list.slice().sort((a, b) => Number(a.stamp || 0) - Number(b.stamp || 0))
      );
    });
    return map;
  }, [filteredEvents]);

  const monthEvents = useMemo(
    () => filteredEvents.filter((evt) => isSameMonth(evt.dateObject, monthStart)),
    [filteredEvents, monthStart]
  );

  const focusDate = useMemo(() => {
    const today = new Date();
    if (isSameMonth(today, monthStart)) return today;
    return monthStart;
  }, [monthStart]);

  const summaryItems = useMemo(
    () =>
      [
        { key: "all", label: "This month", value: monthEvents.length },
        ...TYPE_ORDER.map((type) => ({
          key: type,
          label: TYPE_META[type]?.shortLabel || "Other",
          value: monthEvents.filter((evt) => evt.type === type).length
        }))
      ].filter((item, index) => index === 0 || item.value > 0),
    [monthEvents]
  );

  const todayKey = dateKey(new Date());
  const monthDateKeys = useMemo(
    () => new Set(monthCells.filter((cell) => cell.inMonth).map((cell) => dateKey(cell.date))),
    [monthCells]
  );
  const hasFilters = activeFilter !== "all" || Boolean(search.trim());
  const upcomingMonthEvents = useMemo(() => {
    const now = Date.now();
    const futureEvents = monthEvents.filter((evt) => Number(evt.stamp || 0) >= now);
    const source = futureEvents.length ? futureEvents : monthEvents;
    return source.slice(0, 5);
  }, [monthEvents]);

  useEffect(() => {
    const fallbackKey = upcomingMonthEvents[0]?.date || monthEvents[0]?.date || dateKey(focusDate);
    const nextDateKey = selectedDateKey && monthDateKeys.has(selectedDateKey) ? selectedDateKey : fallbackKey;
    if (nextDateKey && nextDateKey !== selectedDateKey) {
      setSelectedDateKey(nextDateKey);
    }
  }, [focusDate, monthDateKeys, monthEvents, selectedDateKey, upcomingMonthEvents]);

  const selectedDateEvents = useMemo(
    () => (selectedDateKey ? byDate.get(selectedDateKey) || [] : []),
    [byDate, selectedDateKey]
  );

  useEffect(() => {
    const nextEventId = selectedDateEvents.some((evt) => evt.id === selectedEventId)
      ? selectedEventId
      : selectedDateEvents[0]?.id || "";
    if (nextEventId !== selectedEventId) {
      setSelectedEventId(nextEventId);
    }
  }, [selectedDateEvents, selectedEventId]);

  const selectedDateObject = useMemo(
    () => parseDateOnly(selectedDateKey),
    [selectedDateKey]
  );
  const selectedEvent = useMemo(
    () => selectedDateEvents.find((evt) => evt.id === selectedEventId) || selectedDateEvents[0] || null,
    [selectedDateEvents, selectedEventId]
  );

  const handleSelectDate = (dateObject) => {
    if (!(dateObject instanceof Date) || Number.isNaN(dateObject.getTime())) return;
    const key = dateKey(dateObject);
    if (!key) return;
    if (!isSameMonth(dateObject, monthStart)) {
      setCursor(new Date(dateObject.getFullYear(), dateObject.getMonth(), 1));
    }
    setSelectedDateKey(key);
    setSelectedEventId((byDate.get(key) || [])[0]?.id || "");
  };

  const agendaHeading = selectedDateObject
    ? selectedDateObject.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : monthLabel;
  const agendaSubheading = selectedDateEvents.length
    ? `${countLabel(selectedDateEvents.length, "event")} scheduled for this day.`
    : "No scheduled events for this day.";
  const headKicker = hasFilters ? "Filtered calendar view" : "Monthly operations planner";
  const headBadgeIcon = activeFilter === "all" ? "bi-calendar4-week" : (TYPE_META[activeFilter]?.icon || TYPE_META.event.icon);
  const selectedTypeMeta = TYPE_META[selectedEvent?.type] || TYPE_META.event;
  const nextUpcoming = upcomingMonthEvents[0] || null;
  const sidebarHeading = selectedDateEvents.length ? "Selected Day" : "Upcoming Focus";

  return (
    <section className="agent-panel dashboard-calendar-panel">
      <div className="dashboard-calendar-shell">
        <div className="dashboard-calendar-head">
          <div className="dashboard-calendar-head-main">
            <div className="dashboard-calendar-head-badge" aria-hidden="true">
              <i className={`bi ${headBadgeIcon}`}></i>
            </div>
            <div className="dashboard-calendar-head-copy">
              <span className="dashboard-calendar-head-kicker">{headKicker}</span>
              <h3>{title}</h3>
              <p>{subtitle}</p>
            </div>
          </div>
          <div className="dashboard-calendar-head-summary">
            <div className="dashboard-calendar-head-pill emphasis">
              <i className="bi bi-lightning-charge"></i>
              <span>{countLabel(monthEvents.length, "event")}</span>
            </div>
          </div>
        </div>

        <div className="dashboard-calendar-toolbar">
          <div className="dashboard-calendar-controls">
            <button
              type="button"
              className="dashboard-calendar-control-btn"
              onClick={() => {
                const today = new Date();
                setCursor(today);
                handleSelectDate(today);
              }}
            >
              Today
            </button>

            <div className="dashboard-calendar-nav">
              <button
                type="button"
                className="dashboard-calendar-nav-btn"
                onClick={() => setCursor((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
                aria-label="Previous month"
              >
                <i className="bi bi-chevron-left"></i>
              </button>
              <strong>{monthLabel}</strong>
              <button
                type="button"
                className="dashboard-calendar-nav-btn"
                onClick={() => setCursor((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}
                aria-label="Next month"
              >
                <i className="bi bi-chevron-right"></i>
              </button>
            </div>
          </div>
        </div>

        <div className="dashboard-calendar-layout">
          <div className="dashboard-calendar-main-column">
            <div className="dashboard-calendar-overview">
              <div className="dashboard-calendar-overview-main">
                <div className="dashboard-calendar-date-card">
                  <span>{focusDate.toLocaleString(undefined, { month: "short" }).toUpperCase()}</span>
                  <strong>{String(focusDate.getDate()).padStart(2, "0")}</strong>
                </div>

                <div className="dashboard-calendar-overview-copy">
                  <small>{headKicker}</small>
                  <strong>{monthLabel}</strong>
                  <span>{monthRangeLabel}</span>
                  {nextUpcoming && (
                    <div className="dashboard-calendar-overview-next">
                      Next up: {nextUpcoming.title} at {formatAgendaDate(nextUpcoming.dateObject, nextUpcoming.time)}
                    </div>
                  )}
                </div>
              </div>

              <div className="dashboard-calendar-metrics">
                {summaryItems.map((item) => (
                  <div key={item.key} className={`dashboard-calendar-metric type-${item.key}`}>
                    <small>{item.label}</small>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="dashboard-calendar-board">
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
                  const isSelected = key === selectedDateKey;

                  return (
                    <article
                      key={key}
                      className={`dashboard-calendar-cell ${cell.inMonth ? "in-month" : "out-month"} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
                    >
                      <div className="dashboard-calendar-cell-head">
                        <div className="dashboard-calendar-day-wrap">
                          <button
                            type="button"
                            className="dashboard-calendar-day-button"
                            onClick={() => handleSelectDate(cell.date)}
                            aria-pressed={isSelected ? "true" : "false"}
                            aria-label={`View events for ${cell.date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`}
                          >
                            <div className="dashboard-calendar-day">{cell.date.getDate()}</div>
                          </button>
                          {!!list.length && <span className="dashboard-calendar-day-total">{list.length}</span>}
                        </div>
                      </div>

                      <div className="dashboard-calendar-events">
                        {list.slice(0, 2).map((evt) => {
                          const typeMeta = TYPE_META[evt.type] || TYPE_META.event;
                          return (
                          <button
                            key={evt.id}
                            type="button"
                            className={`dashboard-calendar-chip type-${evt.type}${selectedEvent?.id === evt.id ? " active" : ""}`}
                            title={`${evt.title} \u2022 ${formatAgendaDate(evt.dateObject, evt.time)}`}
                            onClick={() => {
                              handleSelectDate(cell.date);
                              setSelectedEventId(evt.id);
                            }}
                          >
                            <span>{formatClockTime(evt.time, "Any time")}</span>
                            <strong>{evt.title}</strong>
                            <small>{typeMeta.label}</small>
                          </button>
                        );
                        })}

                        {list.length > 2 && (
                          <button
                            type="button"
                            className="dashboard-calendar-more"
                            onClick={() => handleSelectDate(cell.date)}
                          >
                            +{list.length - 2} more
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
