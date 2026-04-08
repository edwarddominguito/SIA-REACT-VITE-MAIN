import { createWorkflowModel } from "./workflow.model.js";
import { registerWorkflowServiceRoutes } from "./workflow.service.js";

export const registerWorkflowController = (api, deps) => {
  const model = createWorkflowModel(deps);
  registerWorkflowServiceRoutes(api, model);
};