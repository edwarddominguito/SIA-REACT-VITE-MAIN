import { registerStateController } from "./state.controller.js";

export const registerStateRoutes = (api, deps) => {
  registerStateController(api, deps);
};