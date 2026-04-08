export const createAuthModel = (deps) => {
  return {
    getDeps() {
      return deps;
    }
  };
};