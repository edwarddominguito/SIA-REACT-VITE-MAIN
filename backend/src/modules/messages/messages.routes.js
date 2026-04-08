import { registerMessagesController } from "./messages.controller.js";

export const registerMessageRoutes = (api, deps) => {
  registerMessagesController(api, deps);
};