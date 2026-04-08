import { createDashboardModel } from "./dashboard.model.js";
import { registerDashboardServiceRoutes } from "./dashboard.service.js";

export const registerDashboardController = (api, deps) => {
  const model = createDashboardModel(deps);
  registerDashboardServiceRoutes(api, model);
};