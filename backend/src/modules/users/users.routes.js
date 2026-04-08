import { registerUsersController } from "./users.controller.js";

export const registerUserRoutes = (api, deps) => {
  registerUsersController(api, deps);
};