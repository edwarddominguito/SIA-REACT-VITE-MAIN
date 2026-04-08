export const createStateModel = (deps) => {
  return {
    getDeps() {
      return deps;
    }
  };
};