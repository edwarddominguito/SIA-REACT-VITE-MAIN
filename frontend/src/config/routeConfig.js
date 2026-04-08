import { createElement } from "react";
import ForgotPasswordPage from "../pages/auth/ForgotPasswordPage.jsx";
import LoginPage from "../pages/auth/LoginPage.jsx";
import RegisterPage from "../pages/auth/RegisterPage.jsx";
import AdminAddUserPage from "../pages/dashboard/AdminAddUserPage.jsx";
import AdminDashboardPage from "../pages/dashboard/AdminDashboardPage.jsx";
import AgentDashboardPage from "../pages/dashboard/AgentDashboardPage.jsx";
import CustomerDashboardPage from "../pages/dashboard/CustomerDashboardPage.jsx";
import NotificationsPage from "../pages/notifications/NotificationsPage.jsx";
import HomePage from "../pages/public/HomePage.jsx";
import PropertyDetailsPage from "../pages/public/PropertyDetailsPage.jsx";

export const publicRoutes = Object.freeze([
  { path: "/", element: createElement(HomePage) },
  { path: "/properties/:id", element: createElement(PropertyDetailsPage) },
  { path: "/login", element: createElement(LoginPage) },
  { path: "/register", element: createElement(RegisterPage) },
  { path: "/forgot-password", element: createElement(ForgotPasswordPage) }
]);

export const dashboardRoutes = Object.freeze({
  notifications: createElement(NotificationsPage),
  admin: createElement(AdminDashboardPage),
  adminAddUser: createElement(AdminAddUserPage),
  agent: createElement(AgentDashboardPage),
  customer: createElement(CustomerDashboardPage)
});
