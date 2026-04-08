import { registerPropertiesController } from "./properties.controller.js";

export const registerPropertyRoutes = (api, deps) => {
  registerPropertiesController(api, deps);
};