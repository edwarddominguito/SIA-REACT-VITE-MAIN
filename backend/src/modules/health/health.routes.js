// Extracted from server monolith to keep route contracts unchanged.
export const registerHealthRoutes = (api, buildHealthPayload = null) => {
  api.get("/health", (req, res) => {
    const payload = typeof buildHealthPayload === "function"
      ? buildHealthPayload({ scope: "api" })
      : { ok: true, service: "api", time: new Date().toISOString() };
    res.json(payload);
  });
};
