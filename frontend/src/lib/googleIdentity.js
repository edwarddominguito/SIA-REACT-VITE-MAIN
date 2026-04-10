const GOOGLE_IDENTITY_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();

let googleScriptPromise = null;
let initializedClientId = "";
let activeCredentialHandler = null;

const ensureBrowser = () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Google Sign-In is only available in the browser.");
  }
};

const getGoogleApi = () => window.google?.accounts?.id || null;

export const hasGoogleIdentityConfig = Boolean(GOOGLE_CLIENT_ID);

export const getGoogleIdentityConfigError = () =>
  "Google Sign-In is not configured. Set VITE_GOOGLE_CLIENT_ID in frontend/.env.";

export const clearGoogleAutoSelect = () => {
  try {
    getGoogleApi()?.disableAutoSelect();
  } catch {
    // Ignore client-side cleanup issues during logout.
  }
};

export const loadGoogleIdentity = async () => {
  if (!hasGoogleIdentityConfig) {
    throw new Error(getGoogleIdentityConfigError());
  }

  ensureBrowser();
  if (getGoogleApi()) return window.google;
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`);
    const handleLoad = () => {
      if (getGoogleApi()) {
        resolve(window.google);
        return;
      }
      reject(new Error("Google Sign-In loaded, but the Google Identity API is unavailable."));
    };
    const handleError = () => reject(new Error("Unable to load Google Sign-In right now."));

    if (existing) {
      if (getGoogleApi()) {
        resolve(window.google);
        return;
      }

      let pollTimeout = 0;
      const pollForApi = () => {
        if (getGoogleApi()) {
          resolve(window.google);
          return;
        }
        pollTimeout += 1;
        if (pollTimeout >= 100) {
          reject(new Error("Google Sign-In script is present but did not finish loading."));
          return;
        }
        window.setTimeout(pollForApi, 50);
      };

      existing.addEventListener("load", handleLoad, { once: true });
      existing.addEventListener("error", handleError, { once: true });
      pollForApi();
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    googleScriptPromise = null;
    throw error;
  });

  return googleScriptPromise;
};

const configureGoogleIdentity = async (callback) => {
  if (typeof callback !== "function") {
    throw new Error("Google Sign-In requires a credential callback.");
  }

  const google = await loadGoogleIdentity();
  const api = google.accounts.id;
  activeCredentialHandler = callback;

  if (initializedClientId !== GOOGLE_CLIENT_ID) {
    api.initialize({
      client_id: GOOGLE_CLIENT_ID,
      ux_mode: "popup",
      callback: (response) => activeCredentialHandler?.(response)
    });
    initializedClientId = GOOGLE_CLIENT_ID;
  }

  return api;
};

export const renderGoogleSignInButton = async (element, { callback, width } = {}) => {
  if (!element) {
    throw new Error("Google Sign-In button target is missing.");
  }

  const api = await configureGoogleIdentity(callback);
  element.replaceChildren();
  api.renderButton(element, {
    theme: "outline",
    size: "large",
    text: "continue_with",
    shape: "pill",
    width: Math.max(220, Number(width) || element.clientWidth || 240)
  });
};
