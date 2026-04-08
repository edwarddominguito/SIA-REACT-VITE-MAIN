import { createPropertiesModel } from "./properties.model.js";
import { registerPropertiesServiceRoutes } from "./properties.service.js";

export const registerPropertiesController = (api, deps) => {
  const model = createPropertiesModel(deps);
  registerPropertiesServiceRoutes(api, model);
};