import { registerCalendarController } from "./calendar.controller.js";

export const registerCalendarRoutes = (api, deps) => {
  registerCalendarController(api, deps);
};