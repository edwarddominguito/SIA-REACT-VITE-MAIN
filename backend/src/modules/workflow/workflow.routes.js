import { registerWorkflowController } from "./workflow.controller.js";

export const registerWorkflowRoutes = (api, deps) => {
  registerWorkflowController(api, deps);
};