import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, safeArray, saveArray, subscribeKeys } from "@/services/storageService.js";
import { apiRequest } from "@/api/client.js";
import DashboardLayout from "@/layout/DashboardLayout.jsx";
import UIFeedback from "@/ui/UIFeedback.jsx";
import { AGENT_NAV_ITEMS } from "@/data/constants.js";
import {
  isActiveAppointmentStatus,
  isActiveMeetStatus
} from "@/utils/workflow.js";
import {
  formatDateTimeLabel,
  isActiveStatus,
  tripStatus
} from "@/utils/domain.js";
import useUiFeedback from "@/hooks/useUiFeedback.js";
import { pushNotification } from "@/utils/notifications.js";
import {
  cleanText,
  getOperatingHoursForDate,
  isFutureOrNowSlot,
  isWithinOperatingHours,
  normalizeDateTimeInput
} from "@/utils/input.js";

const buildTripTitle = (selectedProperties) => {
  const picks = Array.isArray(selectedProperties) ? selectedProperties.filter(Boolean) : [];
  if (!picks.length) return "Property Tour";
  if (picks.length === 1) return `${picks[0].title || "Property"} Tour`;
  return `${picks.length} Property Tour`;
};

const buildTripLocation = (selectedProperties) => {
  const locations = Array.from(
    new Set(
      (Array.isArray(selectedProperties) ? selectedProperties : [])
        .map((p) => String(p?.location || "").trim())
        .filter(Boolean)
    )
  );
  if (!locations.length) return "Davao City";
  if (locations.length === 1) return locations[0];
  return "Multiple Properties";
};

const initialForm = () => ({ customer: "", date: "", time: "", propertyIds: [], notes: "" });

export default function AgentScheduleTripPage() {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const feedback = useUiFeedback();

  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  const [trips, setTrips] = useState([]);
  const [apps, setApps] = useState([]);
  const [meets, setMeets] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [mineProps, setMineProps] = useState([]);

  const refreshAll = () => {
    const allUsers = safeArray("allUsers");
    const allProps = safeArray("allProperties");
    setCustomers(allUsers.filter((u) => u?.role === "customer"));
    setMineProps(allProps.filter((p) => p?.agent === user?.username));
    setTrips(safeArray("allTrips"));
    setApps(safeArray("allAppointments"));
    setMeets(safeArray("officeMeets"));
  };

  useEffect(() => {
    refreshAll();
    return subscribeKeys(["allUsers", "allProperties", "allTrips", "allAppointments", "officeMeets"], refreshAll);
  }, []);

  const tripOperatingHours = useMemo(() => getOperatingHoursForDate(form.date), [form.date]);

  const canSchedule = customers.length > 0 && mineProps.length > 0;

  const hasAgentScheduleConflict = (date, time) => {
    const agentUsername = String(user?.username || "").trim();
    if (!agentUsername || !date || !time) return false;
    if (apps.some((a) => {
      if (String(a?.assignedAgent || a?.agent || "").trim() !== agentUsername) return false;
      if (!isActiveAppointmentStatus(a?.status)) return false;
      return String(a?.date || "").trim() === date && String(a?.time || "").trim() === time;
    })) return true;
    if (meets.some((m) => {
      if (String(m?.assignedAgent || m?.agent || "").trim() !== agentUsername) return false;
      if (!isActiveMeetStatus(m?.status)) return false;
      return String(m?.date || "").trim() === date && String(m?.time || "").trim() === time;
    })) return true;
    return trips.some((t) => {
      if (String(t?.agent || "").trim() !== agentUsername) return false;
      if (!isActiveStatus(tripStatus(t), "tour")) return false;
      return String(t?.date || "").trim() === date && String(t?.time || "").trim() === time;
    });
  };

  const hasCustomerScheduleConflict = (customerUsername, date, time) => {
    const customer = String(customerUsername || "").trim();
    if (!customer || !date || !time) return false;
    if (apps.some((a) => {
      if (String(a?.customer || "").trim() !== customer) return false;
      if (!isActiveAppointmentStatus(a?.status)) return false;
      return String(a?.date || "").trim() === date && String(a?.time || "").trim() === time;
    })) return true;
    if (meets.some((m) => {
      const requestedBy = String(m?.customer || m?.requestedBy || "").trim();
      if (requestedBy !== customer) return false;
      if (!isActiveMeetStatus(m?.status)) return false;
      return String(m?.date || "").trim() === date && String(m?.time || "").trim() === time;
    })) return true;
    return trips.some((t) => {
      if (!isActiveStatus(tripStatus(t), "tour")) return false;
      const primary = String(t?.customer || "").trim();
      const attendees = Array.isArray(t?.attendees) ? t.attendees.map(String) : [];
      if (primary !== customer && !attendees.includes(customer)) return false;
      return String(t?.date || "").trim() === date && String(t?.time || "").trim() === time;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    const customer = cleanText(form.customer, 40);
    const customerRecord = customers.find((c) => String(c?.username || "").trim() === customer);
    const { date, time } = normalizeDateTimeInput(form.date, form.time);
    const propertyIds = Array.from(new Set((form.propertyIds || []).map((id) => String(id))));
    const notes = cleanText(form.notes, 400);

    if (!customer || !date || !time || !propertyIds.length) {
      feedback.notify("Customer, date, time, and at least one property are required.", "error");
      return;
    }
    if (!isFutureOrNowSlot(date, time)) {
      feedback.notify("Tour schedule must be now or in the future.", "error");
      return;
    }
    if (!isWithinOperatingHours(date, time)) {
      if (tripOperatingHours.isClosed) {
        feedback.notify("Tours are not available on Sunday.", "error");
      } else {
        feedback.notify(`Tour time must be within ${tripOperatingHours.label}.`, "error");
      }
      return;
    }
    const selectedProperties = propertyIds
      .map((pid) => mineProps.find((p) => String(p.id) === String(pid)))
      .filter(Boolean);
    if (!customerRecord) {
      feedback.notify("Select a valid customer before scheduling the trip.", "error");
      return;
    }
    if (!selectedProperties.length || selectedProperties.length !== propertyIds.length) {
      feedback.notify("Select at least one valid property from your listings.", "error");
      return;
    }
    if (hasAgentScheduleConflict(date, time)) {
      feedback.notify("You already have an appointment, office meet, or trip at that schedule.", "error");
      return;
    }
    if (hasCustomerScheduleConflict(customer, date, time)) {
      feedback.notify("That customer already has another appointment, meet, or trip at that schedule.", "error");
      return;
    }

    try {
      setSaving(true);
      const res = await apiRequest("/api/trips", {
        method: "POST",
        body: JSON.stringify({
          customer,
          title: buildTripTitle(selectedProperties),
          location: buildTripLocation(selectedProperties),
          date,
          time,
          propertyIds: selectedProperties.map((p) => String(p.id)),
          notes
        })
      });
      const nextTrip = res?.data;
      if (!nextTrip?.id) throw new Error("Tour was not saved by the server.");

      const existing = safeArray("allTrips");
      saveArray("allTrips", [nextTrip, ...existing.filter((t) => String(t?.id || "") !== String(nextTrip.id))]);

      pushNotification({
        to: customer,
        type: "trip",
        title: "Property Tour Scheduled",
        message: `Agent @${user?.username} scheduled your property tour on ${formatDateTimeLabel(date, time)}.`,
        meta: {
          tripId: nextTrip.id,
          agent: user?.username || "",
          date,
          time,
          propertyIds: nextTrip.propertyIds
        }
      });

      feedback.notify("Tour scheduled.", "success");
      navigate("/agent", { state: { section: "trips" } });
    } catch (error) {
      feedback.notify(error?.message || "Unable to schedule tour.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <DashboardLayout
      suiteLabel="Agent Suite"
      profileName={user.fullName || user.username}
      profileRole="Agent"
      role="agent"
      navItems={AGENT_NAV_ITEMS}
      activeTab="trips"
      onTabChange={(s) => navigate("/agent", { state: { section: s } })}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 10px" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0 }}>Schedule Property Tour</h1>
        <button className="btn btn-outline-dark btn-sm" onClick={() => navigate("/agent", { state: { section: "trips" } })}>
          <i className="bi bi-arrow-left me-1"></i>Back to Tours
        </button>
      </div>

      <section className="agent-panel">
        <form onSubmit={handleSubmit}>
          <div className="row g-3">

            {/* Customer */}
            <div className="col-12">
              <label className="form-label small text-muted mb-1">Customer *</label>
              <select
                className="form-select"
                value={form.customer}
                onChange={(e) => setForm((s) => ({ ...s, customer: e.target.value }))}
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.username}>
                    {c.fullName || c.username} (@{c.username})
                  </option>
                ))}
              </select>
              {!customers.length && (
                <div className="small text-muted mt-1">No customer accounts are available yet.</div>
              )}
            </div>

            {/* Date & Time */}
            <div className="col-md-6">
              <label className="form-label small text-muted mb-1">Date *</label>
              <input
                className="form-control"
                type="date"
                value={form.date}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  setForm((s) => {
                    const keepTime = s.time && isWithinOperatingHours(nextDate, s.time);
                    return { ...s, date: nextDate, time: keepTime ? s.time : "" };
                  });
                }}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small text-muted mb-1">Time *</label>
              <input
                className="form-control"
                type="time"
                min={tripOperatingHours.minTime || undefined}
                max={tripOperatingHours.maxTime || undefined}
                disabled={tripOperatingHours.isClosed}
                value={form.time}
                onChange={(e) => setForm((s) => ({ ...s, time: e.target.value }))}
              />
              <div className="small text-muted mt-1">
                Operating hours: Mon–Fri 8:00 AM–5:00 PM &nbsp;|&nbsp; Sat 8:00 AM–1:00 PM &nbsp;|&nbsp; Sun closed
              </div>
              {!!form.date && (
                <div className="small text-muted mt-1">Selected day: {tripOperatingHours.label}</div>
              )}
            </div>

            {/* Properties */}
            <div className="col-12">
              <label className="form-label small text-muted mb-1">Properties to Visit *</label>
              {mineProps.length ? (
                <div className="trip-pick-scroll">
                  {mineProps.map((p) => {
                    const checked = (form.propertyIds || []).includes(String(p.id));
                    return (
                      <label key={p.id} className="trip-pick-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setForm((s) => ({
                              ...s,
                              propertyIds: e.target.checked
                                ? [...(s.propertyIds || []), String(p.id)]
                                : (s.propertyIds || []).filter((id) => String(id) !== String(p.id))
                            }))
                          }
                        />
                        <span>{p.title}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="small text-muted">No properties available. Add properties first.</div>
              )}
            </div>

            {/* Notes */}
            <div className="col-12">
              <label className="form-label small text-muted mb-1">Notes</label>
              <textarea
                className="form-control"
                rows="3"
                placeholder="Add notes for this tour..."
                value={form.notes}
                onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>

          </div>

          <div className="d-flex gap-2 mt-3">
            <button className="btn btn-dark" disabled={saving || !canSchedule}>
              {saving ? "Scheduling..." : "Schedule Tour"}
            </button>
            <button type="button" className="btn btn-outline-dark" disabled={saving} onClick={() => setForm(initialForm())}>
              Clear
            </button>
            <button type="button" className="btn btn-outline-dark" disabled={saving} onClick={() => navigate("/agent", { state: { section: "trips" } })}>
              Cancel
            </button>
          </div>
        </form>
      </section>

      <UIFeedback
        toasts={feedback.toasts}
        closeToast={feedback.closeToast}
        confirmState={feedback.confirmState}
        cancelConfirm={feedback.cancelConfirm}
        confirm={feedback.confirm}
      />
    </DashboardLayout>
  );
}
