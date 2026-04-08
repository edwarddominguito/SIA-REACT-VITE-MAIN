export const registerStateServiceRoutes = (api, model) => {
  const deps = model.getDeps();
  const {
    asyncHandler,
    loadDb,
    scopeStateForContext,
    getRequestUserContext
  } = deps;

api.get("/state", asyncHandler(async (req, res) => {
  const db = await loadDb();
  return res.json({ ok: true, data: scopeStateForContext(db, getRequestUserContext(req)) });
}));

api.put("/state", asyncHandler(async (req, res) => {
  return res.status(405).json({
    ok: false,
    message: "Server-side state sync is disabled. Use the module-specific API routes instead."
  });
}));

};