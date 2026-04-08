const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const SUPABASE_POOLER_HINT =
  "Supabase Dashboard -> Project Settings -> Database -> Connection string -> Transaction pooler";

const createStartupConfigError = (message, hint = "") => {
  const error = new Error(message);
  error.name = "StartupConfigError";
  error.startupPhase = "config validation";
  error.isUserFacing = true;
  if (hint) {
    error.hint = hint;
  }
  return error;
};

const parsePostgresUri = (value) => {
  try {
    const parsed = new URL(value);
    return parsed;
  } catch {
    return null;
  }
};

const inferredDbClient = String(
  process.env.DB_CLIENT || (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL ? "postgres" : "mysql")
).trim().toLowerCase();
const dbClient = inferredDbClient === "postgres" ? "postgres" : "mysql";
const dbConnectionString = String(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "").trim();

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  port: toNumber(process.env.PORT, 3000),
  requestSizeLimit: process.env.REQUEST_SIZE_LIMIT || "200kb",
  idempotencyTtlMs: toNumber(process.env.IDEMPOTENCY_TTL_MS, 30000),
  db: {
    client: dbClient,
    connectionString: dbConnectionString,
    host: process.env.DB_HOST || "127.0.0.1",
    port: toNumber(process.env.DB_PORT, dbClient === "postgres" ? 5432 : 3306),
    user: process.env.DB_USER || (dbClient === "postgres" ? "postgres" : "root"),
    password: process.env.DB_PASSWORD || "",
    name: process.env.DB_NAME || (dbClient === "postgres" ? "postgres" : "sia_realestate"),
    connectionLimit: toNumber(process.env.DB_CONNECTION_LIMIT, 10),
    ssl: toBoolean(process.env.DB_SSL, dbClient === "postgres")
  },
  googleCalendar: {
    enabled: toBoolean(process.env.GOOGLE_CALENDAR_SYNC_ENABLED),
    clientId: String(process.env.GOOGLE_CALENDAR_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "").trim(),
    refreshToken: String(process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || "").trim(),
    calendarId: String(process.env.GOOGLE_CALENDAR_ID || "primary").trim() || "primary",
    timeZone: String(process.env.GOOGLE_CALENDAR_TIME_ZONE || process.env.TZ || "Asia/Singapore").trim() || "UTC",
    timeoutMs: Math.max(1500, toNumber(process.env.GOOGLE_CALENDAR_SYNC_TIMEOUT_MS, 8000)),
    sendUpdates: String(process.env.GOOGLE_CALENDAR_SEND_UPDATES || "none").trim() || "none",
    appointmentDurationMinutes: Math.max(15, toNumber(process.env.GOOGLE_CALENDAR_APPOINTMENT_DURATION_MINUTES, 60)),
    meetingDurationMinutes: Math.max(15, toNumber(process.env.GOOGLE_CALENDAR_MEETING_DURATION_MINUTES, 60)),
    tripDurationMinutes: Math.max(15, toNumber(process.env.GOOGLE_CALENDAR_TRIP_DURATION_MINUTES, 120))
  },
  httpsms: {
    enabled: toBoolean(process.env.HTTPSMS_ENABLED),
    apiBaseUrl: String(process.env.HTTPSMS_API_BASE_URL || "https://api.httpsms.com").replace(/\/+$/, ""),
    apiKey: String(process.env.HTTPSMS_API_KEY || "").trim(),
    from: String(process.env.HTTPSMS_FROM || "").trim(),
    defaultCountryCode: String(process.env.HTTPSMS_DEFAULT_COUNTRY_CODE || "63").replace(/\D/g, ""),
    timeoutMs: Math.max(1500, toNumber(process.env.HTTPSMS_TIMEOUT_MS, 8000)),
    webhookSigningSecret: String(process.env.HTTPSMS_WEBHOOK_SIGNING_SECRET || "").trim()
  }
});

export const validateDbConfigOrThrow = () => {
  if (env.db.client !== "postgres") return;

  const rawConnectionString = String(env.db.connectionString || "").trim();
  if (!rawConnectionString) {
    throw createStartupConfigError(
      "DATABASE_URL is required when DB_CLIENT=postgres.",
      `Set DATABASE_URL to your Supabase transaction pooler URI (${SUPABASE_POOLER_HINT}).`
    );
  }

  const normalized = rawConnectionString.toLowerCase();
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    throw createStartupConfigError(
      "DATABASE_URL is invalid. Use a Postgres URI, not an HTTP URL.",
      "Expected format: postgresql://<user>:<password>@<host>:<port>/<database>"
    );
  }

  if (!normalized.startsWith("postgres://") && !normalized.startsWith("postgresql://")) {
    throw createStartupConfigError(
      "DATABASE_URL must start with postgres:// or postgresql://.",
      "Expected format: postgresql://<user>:<password>@<host>:<port>/<database>"
    );
  }

  const parsed = parsePostgresUri(rawConnectionString);
  if (!parsed || !parsed.hostname) {
    throw createStartupConfigError(
      "DATABASE_URL is not a valid Postgres connection string.",
      "Re-copy the URI from Supabase Transaction pooler settings and paste it exactly."
    );
  }
};
