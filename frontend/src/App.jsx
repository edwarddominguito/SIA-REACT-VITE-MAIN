import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Home from "./pages/Home.jsx";
import PublicPropertyDetails from "./pages/PublicPropertyDetails.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminAddUser from "./pages/AdminAddUser.jsx";
import AgentDashboard from "./pages/AgentDashboard.jsx";
import CustomerDashboard from "./pages/CustomerDashboard.jsx";
import Notifications from "./pages/Notifications.jsx";

import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { getCurrentUser } from "./lib/storage.js";

function HomeRedirect() {
  const u = getCurrentUser();
  if (!u) return <Navigate to="/" replace />;
  if (u.role === "admin") return <Navigate to="/admin" replace />;
  if (u.role === "agent") return <Navigate to="/agent" replace />;
  return <Navigate to="/customer" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/properties/:id" element={<PublicPropertyDetails />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/dashboard" element={<HomeRedirect />} />
      <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />

      <Route path="/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/add-user" element={<ProtectedRoute role="admin"><AdminAddUser /></ProtectedRoute>} />
      <Route path="/agent" element={<ProtectedRoute role="agent"><AgentDashboard /></ProtectedRoute>} />
      <Route path="/customer/*" element={<ProtectedRoute role="customer"><CustomerDashboard /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
