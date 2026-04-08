import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { seedDefaultData, startApiSync } from "@/services/storageService.js";

const AppContext = createContext({
  ready: false
});

let bootstrapped = false;

export function AppProvider({ children }) {
  const [ready, setReady] = useState(() => bootstrapped);

  useEffect(() => {
    if (!bootstrapped) {
      bootstrapped = true;
      seedDefaultData();
      startApiSync().catch(() => {});
    }
    setReady(true);
  }, []);

  const value = useMemo(() => ({ ready }), [ready]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  return useContext(AppContext);
}
