import { createAuthModel } from "./auth.model.js";
import { registerAuthServiceRoutes } from "./auth.service.js";

export const registerAuthController = (api, deps) => {
  const model = createAuthModel(deps);
  registerAuthServiceRoutes(api, model);
};