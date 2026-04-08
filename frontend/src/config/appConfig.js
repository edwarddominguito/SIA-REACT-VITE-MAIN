export const appConfig = Object.freeze({
  apiBaseUrl: String(import.meta.env.VITE_API_BASE_URL || "http://localhost:3000").replace(/\/+$/, ""),
  appName: "TES Property",
  storageKeys: Object.freeze({
    currentUser: "currentUser"
  })
});

export default appConfig;

