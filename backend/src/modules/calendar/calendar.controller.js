import { createCalendarModel } from "./calendar.model.js";
import { registerCalendarServiceRoutes } from "./calendar.service.js";

export const registerCalendarController = (api, deps) => {
  const model = createCalendarModel(deps);
  registerCalendarServiceRoutes(api, model);
};