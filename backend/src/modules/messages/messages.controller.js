import { createMessagesModel } from "./messages.model.js";
import { registerMessagesServiceRoutes } from "./messages.service.js";

export const registerMessagesController = (api, deps) => {
  const model = createMessagesModel(deps);
  registerMessagesServiceRoutes(api, model);
};