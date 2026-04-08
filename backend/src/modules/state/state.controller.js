import { createStateModel } from "./state.model.js";
import { registerStateServiceRoutes } from "./state.service.js";

export const registerStateController = (api, deps) => {
  const model = createStateModel(deps);
  registerStateServiceRoutes(api, model);
};