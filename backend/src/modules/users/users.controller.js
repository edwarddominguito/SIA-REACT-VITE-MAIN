import { createUsersModel } from "./users.model.js";
import { registerUsersServiceRoutes } from "./users.service.js";

export const registerUsersController = (api, deps) => {
  const model = createUsersModel(deps);
  registerUsersServiceRoutes(api, model);
};