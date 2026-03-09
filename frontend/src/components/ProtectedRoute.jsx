import React from "react";
import { Navigate } from "react-router-dom";
import { requireRole } from "../lib/auth.js";

export default function ProtectedRoute({ role, children }) {
  const res = requireRole(role);
  if (!res.ok) return <Navigate to="/login" replace />;
  return children;
}
