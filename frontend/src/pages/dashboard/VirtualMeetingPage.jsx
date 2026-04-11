import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/layout/DashboardLayout.jsx";
import UIFeedback from "@/ui/UIFeedback.jsx";
import useUiFeedback from "@/hooks/useUiFeedback.js";
import { AGENT_NAV_ITEMS, CUSTOMER_NAV_ITEMS } from "@/data/constants.js";
import { getCurrentUser, safeArray, saveArray, subscribeKeys } from "@/services/storageService.js";
import { apiRequest } from "@/api/client.js";
import { pushNotification } from "@/utils/notifications.js";
import {
  eventDateTimeStamp,
  formatDateTimeLabel,
  formatWorkflowStatus,
  normalizeWorkflowStatus,
  statusBadgeClass
} from "@/utils/domain.js";
import {
  cleanEmail,
  cleanPhone,
  cleanText,
  getOperatingHoursForDate,
  isFutureOrNowSlot,
  isValidEmail,
  isValidPhone,
  isWithinOperatingHours,
  normalizeDateTimeInput
} from "@/utils/input.js";

const MEET_REASON_TEMPLATES = [
  "Financing consultation",
  "Schedule property visit plan",
  "Contract and offer discussion",
  "Investment advice"
];

const PAGE_CONFIG = {
  customer: {
    suiteLabel: "Customer Suite",
    profileRole: "Customer",
    navItems: CUSTOMER_NAV_ITEMS,
    heroTitle: "Virtual Meetings",
    heroCopy: "Create and track your virtual meeting requests from a dedicated route.",
    backPath: "/customer/meets"
  },
  agent: {
    suiteLabel: "Agent Suite",
    profileRole: "Agent",
    navItems: AGENT_NAV_ITEMS,
    heroTitle: "Virtual Meeting Queue",
    heroCopy: "Review the virtual meetings assigned to you on a dedicated page route.",
    backPath: "/agent"
  }
};

const toLocalDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const createCustomerForm = (user) => ({
  fullName: user?.fullName || "",
  email: user?.email || "",
  phone: user?.phone || "",
  date: "",
  time: "",
  reason: "",
  notes: ""
});

export default function VirtualMeetingPage({ role = "customer" }) {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const feedback = useUiFeedback();
  const page = PAGE_CONFIG[role] || PAGE_CONFIG.customer;
  const [meets, setMeets] = useState([]);
  const [customerForm, setCustomerForm] = useState(() => createCustomerForm(user));
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const refresh = () => setMeets(safeArray("officeMeets"));
    refresh();
    return subscribeKeys(["officeMeets"], refresh);
  }, []);

  const saveMeetsLocal = (next) => {
    saveArray("officeMeets", next);
    setMeets(next);
  };

  const notifyRoles = ({ roles = [], includeUsers = [], title = "Notification", message = "", type = "general", meta = {} }) => {
    const users = safeArray("allUsers");
    const roleSet = new Set((roles || []).map((entry) => String(entry || "").toLowerCase()));
    const recipients = new Set((includeUsers || []).map((entry) => String(entry || "").trim()).filter(Boolean));

    users.forEach((entry) => {
      const username = String(entry?.username || "").trim();
      const entryRole = String(entry?.role || "").toLowerCase();
      if (username && roleSet.has(entryRole)) {
        recipients.add(username);
      }
    });

    recipients.forEach((recipient) => {
      if (recipient === user?.username) return;
      pushNotification({ to: recipient, type, title, message, meta });
    });
  };

  const virtualMeets = useMemo(() => {
    const username = String(user?.username || "").trim();
    const filtered = meets.filter((meet) => {
      const mode = String(meet?.mode || "").trim().toLowerCase();
      if (mode !== "virtual") return false;
      if (role === "agent") {
        return String(meet?.assignedAgent || meet?.agent || "").trim() === username;
      }
      return String(meet?.customer || meet?.requestedBy || "").trim() === username;
    });

    return filtered
      .slice()
      .sort((a, b) => {
        const aStamp = eventDateTimeStamp(a.date, a.time);
        const bStamp = eventDateTimeStamp(b.date, b.time);
        if (Number.isFinite(aStamp) && Number.isFinite(bStamp)) return aStamp - bStamp;
        return String(a?.createdAt || "").localeCompare(String(b?.createdAt || ""));
      });
  }, [meets, role, user?.username]);

  const activeVirtualMeets = useMemo(
    () => virtualMeets.filter((meet) => {
      const status = normalizeWorkflowStatus(meet.status, "office_meeting");
      return status === "pending" || status === "confirmed" || status === "rescheduled";
    }),
    [virtualMeets]
  );

  const nextVirtualMeet = useMemo(() => {
    const now = Date.now();
    return virtualMeets
      .map((meet) => ({ ...meet, stamp: eventDateTimeStamp(meet.date, meet.time) }))
      .filter((meet) => Number.isFinite(meet.stamp) && meet.stamp >= now)
      .sort((a, b) => a.stamp - b.stamp)[0] || null;
  }, [virtualMeets]);

  const operatingHours = useMemo(
    () => getOperatingHoursForDate(customerForm.date),
    [customerForm.date]
  );

  const reasonLength = useMemo(
    () => cleanText(customerForm.reason, 600).length,
    [customerForm.reason]
  );

  const handleTabChange = (nextTab) => {
    if (role === "agent") {
      navigate("/agent", { state: { section: nextTab } });
      return;
    }

    if (nextTab === "dashboard") navigate("/customer/dashboard");
    else if (nextTab === "browse") navigate("/customer/book-appointment");
    else if (nextTab === "appointments") navigate("/customer/appointments");
    else if (nextTab === "meets") navigate("/customer/meets");
    else if (nextTab === "trips") navigate("/customer/trips");
    else if (nextTab === "calendar") navigate("/customer/calendar");
    else if (nextTab === "messages") navigate("/customer/messages");
    else if (nextTab === "reviews") navigate("/customer/reviews");
    else if (nextTab === "profile") navigate("/customer/profile");
  };

  const goBackToOfficeMeetings = () => {
    if (role === "agent") {
      navigate("/agent", { state: { section: "meets" } });
      return;
    }
    navigate(page.backPath);
  };

  const submitCustomerVirtualMeet = async () => {
    if (isSubmitting) return;

    const fullName = cleanText(customerForm.fullName, 80);
    const email = cleanEmail(customerForm.email);
    const phone = cleanPhone(customerForm.phone);
    const reason = cleanText(customerForm.reason, 600);
    const notes = cleanText(customerForm.notes, 1200);
    const { date, time } = normalizeDateTimeInput(customerForm.date, customerForm.time);

    if (!fullName || !email || !phone || !date || !time || !reason) {
      feedback.notify("Please complete all virtual meeting fields.", "error");
      return;
    }
    if (!isValidEmail(email)) {
      feedback.notify("Please provide a valid email.", "error");
      return;
    }
    if (!isValidPhone(phone)) {
      feedback.notify("Please provide a valid phone number.", "error");
      return;
    }
    if (!isWithinOperatingHours(date, time)) {
      if (operatingHours.isClosed) {
        feedback.notify("Virtual meetings are not available on Sunday.", "error");
      } else {
        feedback.notify(`Meeting time must be within ${operatingHours.label}.`, "error");
      }
      return;
    }
    if (!isFutureOrNowSlot(date, time)) {
      feedback.notify("Meeting schedule must be now or in the future.", "error");
      return;
    }

    const duplicate = virtualMeets.some((meet) =>
      String(meet.date || "") === date &&
      String(meet.time || "") === time &&
      normalizeWorkflowStatus(meet.status, "office_meeting") === "pending"
    );
    if (duplicate) {
      feedback.notify("You already have a pending virtual request for that slot.", "error");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await apiRequest("/api/office-meets", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          email,
          phone,
          customer: user.username,
          requestedBy: user.username,
          date,
          time,
          reason,
          mode: "virtual",
          notes
        })
      });
      const savedMeet = res?.data;
      if (!savedMeet?.id) {
        throw new Error("Virtual meeting was not saved by the server.");
      }

      const assignedAgent = String(savedMeet.assignedAgent || savedMeet.agent || "").trim();
      saveMeetsLocal([
        savedMeet,
        ...meets.filter((meet) => String(meet?.id || "").trim() !== String(savedMeet.id))
      ]);
      notifyRoles({
        roles: ["admin"],
        includeUsers: assignedAgent ? [assignedAgent] : [],
        type: "office-meet",
        title: "New Virtual Meeting Request",
        message: `Customer @${user.username} requested a virtual meeting on ${formatDateTimeLabel(date, time)}.`,
        meta: {
          customer: user.username,
          assignedAgent,
          mode: "virtual",
          date,
          time
        }
      });
      setCustomerForm(createCustomerForm(user));
      feedback.notify("Virtual meeting request submitted.", "success");
    } catch (error) {
      feedback.notify(error?.message || "Unable to submit virtual meeting request.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const profileName = role === "agent"
    ? (user?.fullName || user?.username || "Agent")
    : (user?.fullName || "Customer");

  return (
    <DashboardLayout
      suiteLabel={page.suiteLabel}
      profileName={profileName}
      profileRole={page.profileRole}
      role={role}
      navItems={page.navItems}
      activeTab="meets"
      onTabChange={handleTabChange}
    >
      <section className="meet-page">
        <div className="meet-page-inner">
          {/* Page header */}
          <div className="meet-page-header">
            <div className="meet-page-icon"><i className="bi bi-camera-video"></i></div>
            <div>
              <h2 className="meet-page-title">Request a Meeting</h2>
              <p className="meet-page-subtitle">Share your preferred schedule, meeting mode, and reason.</p>
            </div>
          </div>

          {role === "customer" && (
            <div className="meet-form-card">
              {/* Mode row */}
              <div className="meet-mode-row">
                <span className="meet-section-label">Mode</span>
                <div className="meet-mode-group">
                  <button type="button" onClick={goBackToOfficeMeetings}>
                    <i className="bi bi-building"></i>In Office
                  </button>
                  <button type="button" className="active" disabled>
                    <i className="bi bi-camera-video"></i>Virtual
                  </button>
                </div>
              </div>

              <hr className="meet-divider" />

              {/* Details */}
              <fieldset className="meet-section">
                <legend className="meet-section-label">Details</legend>
                <div className="meet-field-grid meet-grid-3">
                  <div className="meet-field">
                    <label className="form-label">Full Name</label>
                    <input className="form-control" value={customerForm.fullName} onChange={(event) => setCustomerForm((current) => ({ ...current, fullName: event.target.value }))} />
                  </div>
                  <div className="meet-field">
                    <label className="form-label">Email</label>
                    <input className="form-control" type="email" value={customerForm.email} onChange={(event) => setCustomerForm((current) => ({ ...current, email: event.target.value }))} />
                  </div>
                  <div className="meet-field">
                    <label className="form-label">Phone</label>
                    <input className="form-control" value={customerForm.phone} onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))} />
                  </div>
                  <div className="meet-field">
                    <label className="form-label">Date</label>
                    <input className="form-control" type="date" min={toLocalDateInputValue()} value={customerForm.date} onChange={(event) => setCustomerForm((current) => ({ ...current, date: event.target.value }))} />
                  </div>
                  <div className="meet-field">
                    <label className="form-label">Time <span className="meet-hint-inline">{operatingHours.label}</span></label>
                    <input
                      className="form-control"
                      type="time"
                      min={operatingHours.minTime || undefined}
                      max={operatingHours.maxTime || undefined}
                      disabled={operatingHours.isClosed}
                      value={customerForm.time}
                      onChange={(event) => setCustomerForm((current) => ({ ...current, time: event.target.value }))}
                    />
                  </div>
                </div>
              </fieldset>

              <hr className="meet-divider" />

              {/* Reason */}
              <fieldset className="meet-section">
                <legend className="meet-section-label">Reason</legend>
                <div className="meet-reason-quick">
                  {MEET_REASON_TEMPLATES.map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={customerForm.reason.includes(item) ? "active" : ""}
                      onClick={() => {
                        setCustomerForm((current) => {
                          const nextReason = current.reason.includes(item)
                            ? current.reason.replace(item, "").replace(/\s{2,}/g, " ").trim()
                            : [current.reason, item].filter(Boolean).join(". ");
                          return { ...current, reason: nextReason };
                        });
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <textarea
                  className="form-control"
                  rows="2"
                  placeholder="Describe the purpose of your meeting..."
                  value={customerForm.reason}
                  onChange={(event) => setCustomerForm((current) => ({ ...current, reason: event.target.value }))}
                ></textarea>
                <div className="meet-char-count">{reasonLength}/600</div>
              </fieldset>

              {/* Submit */}
              <div className="meet-submit-row">
                <button type="button" className="btn btn-outline-dark" onClick={() => setCustomerForm(createCustomerForm(user))}>
                  Clear
                </button>
                <button
                  type="button"
                  className="btn btn-dark"
                  disabled={isSubmitting}
                  onClick={submitCustomerVirtualMeet}
                >
                  {isSubmitting ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <UIFeedback
        toasts={feedback.toasts}
        closeToast={feedback.closeToast}
        confirmState={feedback.confirmState}
        cancelConfirm={feedback.cancelConfirm}
        confirm={feedback.confirm}
        toastPlacement="dashboard-top"
      />
    </DashboardLayout>
  );
}
