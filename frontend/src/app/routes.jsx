import { Navigate, Route, Routes } from "react-router-dom";
import { dashboardRoutes, publicRoutes } from "@/config/routeConfig.js";
import ProtectedRoute from "@/layout/ProtectedRoute.jsx";
import { getCurrentUser } from "@/services/storageService.js";

function HomeRedirect() {
  const user = getCurrentUser();
  if (!user) return <Navigate to="/" replace />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (user.role === "agent") return <Navigate to="/agent" replace />;
  return <Navigate to="/customer/dashboard" replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      {publicRoutes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}

      <Route path="/dashboard" element={<HomeRedirect />} />
      <Route path="/notifications" element={<ProtectedRoute>{dashboardRoutes.notifications}</ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute role="admin">{dashboardRoutes.admin}</ProtectedRoute>} />
      <Route path="/admin/add-user" element={<ProtectedRoute role="admin">{dashboardRoutes.adminAddUser}</ProtectedRoute>} />
      <Route path="/agent" element={<ProtectedRoute role="agent">{dashboardRoutes.agent}</ProtectedRoute>} />
      <Route path="/customer/*" element={<ProtectedRoute role="customer">{dashboardRoutes.customer}</ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
