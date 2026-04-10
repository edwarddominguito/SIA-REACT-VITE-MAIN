import mysql from "mysql2/promise";
import pg from "pg";
import { env } from "../config/env.js";

const { Pool: PgPool } = pg;
const DB_CLIENT = String(env.db.client || "mysql").toLowerCase();
const PG_SSL_QUERY_KEYS = ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslcrl", "sslaccept"];

const convertMysqlPlaceholdersToPg = (sql) => {
  let out = "";
  let placeholderIndex = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      out += ch;
      if (ch === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      out += ch;
      if (ch === "*" && next === "/") {
        out += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (inSingleQuote) {
      out += ch;
      if (ch === "'" && next === "'") {
        out += next;
        i += 1;
        continue;
      }
      if (ch === "'") inSingleQuote = false;
      continue;
    }

    if (inDoubleQuote) {
      out += ch;
      if (ch === "\"" && next === "\"") {
        out += next;
        i += 1;
        continue;
      }
      if (ch === "\"") inDoubleQuote = false;
      continue;
    }

    if (ch === "-" && next === "-") {
      out += ch + next;
      i += 1;
      inLineComment = true;
      continue;
    }

    if (ch === "/" && next === "*") {
      out += ch + next;
      i += 1;
      inBlockComment = true;
      continue;
    }

    if (ch === "'") {
      out += ch;
      inSingleQuote = true;
      continue;
    }

    if (ch === "\"") {
      out += ch;
      inDoubleQuote = true;
      continue;
    }

    if (ch === "?") {
      placeholderIndex += 1;
      out += `$${placeholderIndex}`;
      continue;
    }

    out += ch;
  }

  return out;
};

const toParamArray = (params) => (Array.isArray(params) ? params : []);

const normalizePgResult = (result) => [Array.isArray(result?.rows) ? result.rows : []];

const parsePgConnectionString = (connectionString) => {
  try {
    return new URL(connectionString);
  } catch {
    return null;
  }
};

const stripPgSslQueryParams = (connectionString) => {
  const parsed = parsePgConnectionString(connectionString);
  if (!parsed) {
    return { connectionString, removedKeys: [], host: "", port: "" };
  }

  const removedKeys = [];
  for (const key of PG_SSL_QUERY_KEYS) {
    if (parsed.searchParams.has(key)) {
      parsed.searchParams.delete(key);
      removedKeys.push(key);
    }
  }

  return {
    connectionString: parsed.toString(),
    removedKeys,
    host: parsed.hostname || "",
    port: parsed.port || ""
  };
};

const buildPgDiagnostics = ({ hasConnectionString, host, port }) => ({
  source: hasConnectionString ? "DATABASE_URL" : "DB_HOST/DB_PORT",
  endpoint: `${host || "unknown"}:${port || "unknown"}`,
  ssl: env.db.ssl ? "on" : "off"
});

const getPgErrorMessages = (error) => {
  const directMessage = String(error?.message || "").trim();
  const nestedMessages = Array.isArray(error?.errors)
    ? error.errors.map((entry) => String(entry?.message || "").trim()).filter(Boolean)
    : [];
  return [directMessage, ...nestedMessages].filter(Boolean);
};

const getPrimaryPgErrorMessage = (error) => getPgErrorMessages(error)[0] || "";

const isPgConnectivityError = (error) => {
  const code = String(error?.code || "").toUpperCase();
  const message = getPgErrorMessages(error).join(" | ");
  if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ECONNRESET", "EACCES"].includes(code)) return true;
  return /(ssl|certificate|connect|timeout|network|lookup|handshake)/i.test(message);
};

const buildPgConnectivityMessage = (error) => {
  const message = getPgErrorMessages(error).join(" | ");
  if (/ssl|certificate|handshake/i.test(message)) {
    return "Postgres connection failed during SSL negotiation.";
  }
  if (/ECONNREFUSED|connect ECONNREFUSED/i.test(message)) {
    return "Postgres connection was refused by the target host.";
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    return "Postgres host lookup failed.";
  }
  if (/timeout|ETIMEDOUT/i.test(message)) {
    return "Postgres connection timed out.";
  }
  if (/EACCES|connect EACCES/i.test(message)) {
    return "Postgres connection was blocked before the socket could be opened.";
  }
  return "Postgres connection failed.";
};

const wrapPgConnectivityError = (error, diagnostics) => {
  if (!isPgConnectivityError(error)) return error;

  const wrapped = new Error(buildPgConnectivityMessage(error));
  wrapped.name = "DatabaseConnectionError";
  wrapped.startupPhase = "db connect";
  wrapped.isUserFacing = true;
  wrapped.hint =
    "Check DATABASE_URL points to your Supabase Transaction Pooler and confirm DB_SSL is set correctly.";
  wrapped.cause = error;
  wrapped.details = {
    ...diagnostics,
    code: String(error?.code || "").toUpperCase() || "UNKNOWN",
    cause: getPrimaryPgErrorMessage(error) || "No lower-level error message was provided."
  };
  return wrapped;
};

const createPostgresPoolAdapter = () => {
  const hasConnectionString = Boolean(env.db.connectionString);
  const normalized = hasConnectionString
    ? stripPgSslQueryParams(env.db.connectionString)
    : { connectionString: "", removedKeys: [], host: env.db.host, port: String(env.db.port || "") };

  if (hasConnectionString && normalized.removedKeys.length > 0) {
    console.warn(
      `[db] Ignoring SSL query params from DATABASE_URL (${normalized.removedKeys.join(", ")}). DB_SSL=${env.db.ssl}`
    );
  }

  const diagnostics = buildPgDiagnostics({
    hasConnectionString,
    host: hasConnectionString ? normalized.host : env.db.host,
    port: hasConnectionString ? normalized.port : String(env.db.port || "")
  });
  let hasLoggedDiagnostics = false;
  const logDiagnosticsOnce = () => {
    if (hasLoggedDiagnostics) return;
    hasLoggedDiagnostics = true;
    console.log(
      `[db] Postgres mode using ${diagnostics.source} endpoint=${diagnostics.endpoint} ssl=${diagnostics.ssl}`
    );
  };

  const baseConfig = hasConnectionString
    ? {
        connectionString: normalized.connectionString,
        max: env.db.connectionLimit
      }
    : {
        host: env.db.host,
        port: env.db.port,
        user: env.db.user,
        password: env.db.password,
        database: env.db.name,
        max: env.db.connectionLimit
      };

  const pgPool = new PgPool({
    ...baseConfig,
    ssl: env.db.ssl ? { rejectUnauthorized: false } : false
  });

  const runQuery = async (target, sql, params = []) => {
    try {
      logDiagnosticsOnce();
      const paramList = toParamArray(params);
      const text = paramList.length ? convertMysqlPlaceholdersToPg(String(sql || "")) : String(sql || "");
      const result = await target.query(text, paramList);
      return normalizePgResult(result);
    } catch (error) {
      throw wrapPgConnectivityError(error, diagnostics);
    }
  };

  return {
    query(sql, params = []) {
      return runQuery(pgPool, sql, params);
    },
    async getConnection() {
      let client;
      try {
        logDiagnosticsOnce();
        client = await pgPool.connect();
      } catch (error) {
        throw wrapPgConnectivityError(error, diagnostics);
      }
      return {
        query(sql, params = []) {
          return runQuery(client, sql, params);
        },
        beginTransaction() {
          return client.query("BEGIN");
        },
        commit() {
          return client.query("COMMIT");
        },
        rollback() {
          return client.query("ROLLBACK");
        },
        release() {
          client.release();
        }
      };
    },
    end() {
      return pgPool.end();
    }
  };
};

const createMySqlPoolAdapter = () =>
  mysql.createPool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    dateStrings: ["DATE"],
    waitForConnections: true,
    connectionLimit: env.db.connectionLimit,
    queueLimit: 0
  });

export const dbPool = DB_CLIENT === "postgres" ? createPostgresPoolAdapter() : createMySqlPoolAdapter();

export default dbPool;
