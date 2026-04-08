import { registerAuthController } from "./auth.controller.js";

export const registerAuthRoutes = (api, deps) => {
  registerAuthController(api, deps);
};