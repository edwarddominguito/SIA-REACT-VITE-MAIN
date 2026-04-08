import { isActiveStatus, normalizeWorkflowStatus } from "@/utils/domain.js";

export const getAgentAvailabilityStatus = (agentLike) => {
  const raw = String(agentLike?.availabilityStatus || "available").trim().toLowerCase();
  if (raw === "busy" || raw === "offline") return raw;
  return "available";
};

export const isActiveAppointmentStatus = (statusLike) => {
  return isActiveStatus(statusLike, "appointment");
};

export const isActiveMeetStatus = (statusLike) => {
  return isActiveStatus(statusLike, "office_meeting");
};

export const appointmentStatusPriority = (statusLike) => {
  const status = normalizeWorkflowStatus(statusLike, "appointment");
  if (status === "pending") return 0;
  if (status === "confirmed" || status === "rescheduled") return 1;
  if (status === "completed" || status === "cancelled" || status === "no_show" || status === "expired") return 2;
  return 3;
};
