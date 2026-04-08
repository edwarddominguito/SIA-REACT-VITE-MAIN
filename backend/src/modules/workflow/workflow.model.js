export const createWorkflowModel = (deps) => {
  return {
    getDeps() {
      return deps;
    }
  };
};