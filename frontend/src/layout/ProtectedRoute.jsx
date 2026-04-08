import { Navigate, useLocation } from "react-router-dom";
import { requireRole } from "@/services/authService.js";
import { clearCurrentUser } from "@/services/storageService.js";

export default function ProtectedRoute({ role, children }) {
  const location = useLocation();
  const res = requireRole(role);
  if (!res.ok) {
    if (res.reason === "forbidden" && res.user?.role) {
      const redirectPath =
        res.user.role === "admin"
          ? "/admin"
          : res.user.role === "agent"
            ? "/agent"
            : "/customer/dashboard";
      return <Navigate to={redirectPath} replace />;
    }

    if (res.reason === "invalid") {
      clearCurrentUser();
    }

    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
