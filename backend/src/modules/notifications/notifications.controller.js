import { createNotificationsModel } from "./notifications.model.js";
import { registerNotificationsServiceRoutes } from "./notifications.service.js";

export const registerNotificationsController = (api, deps) => {
  const model = createNotificationsModel(deps);
  registerNotificationsServiceRoutes(api, model);
};