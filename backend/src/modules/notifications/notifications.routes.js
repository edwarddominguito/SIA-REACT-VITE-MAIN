import { registerNotificationsController } from "./notifications.controller.js";

export const registerNotificationRoutes = (api, deps) => {
  registerNotificationsController(api, deps);
};