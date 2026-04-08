import { registerDashboardController } from "./dashboard.controller.js";

export const registerDashboardRoutes = (api, deps) => {
  registerDashboardController(api, deps);
};