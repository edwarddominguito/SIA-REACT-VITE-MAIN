// Extracted from server monolith to keep route contracts unchanged.
export const registerHealthRoutes = (api) => {
api.get("/health", (req, res) => {
  res.json({ ok: true, service: "api", time: new Date().toISOString() });
});

};