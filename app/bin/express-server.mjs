import express from "express";

// Build an AWS Lambda Function URL style HTTP event from Express request
function toEvent(req) {
  const url = new URL(req.originalUrl || req.url, `http://localhost:${req.socket.localPort || 0}`);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) headers[k.toLowerCase()] = v;

  // Rebuild raw body string based on content type
  const ct = (headers["content-type"] || "").toString().toLowerCase();
  let body = "";
  if (typeof req.body === "string") {
    body = req.body;
  } else if (ct.includes("application/x-www-form-urlencoded") && req.body && typeof req.body === "object") {
    body = new URLSearchParams(req.body).toString();
  } else if (ct.includes("application/json") && req.body && typeof req.body === "object") {
    body = JSON.stringify(req.body);
  } else if (req.rawBody && typeof req.rawBody === "string") {
    body = req.rawBody;
  }

  // Cookies array (Lambda URLs expose cookies separately)
  const cookies = [];
  const cookieHeader = headers["cookie"];
  if (cookieHeader && typeof cookieHeader === "string") {
    for (const c of cookieHeader.split(";")) {
      const trimmed = c.trim();
      if (trimmed) cookies.push(trimmed);
    }
  }

  // Query string parameters map (optional but common in events)
  const rawQueryString = url.search ? url.search.slice(1) : "";
  const query = rawQueryString ? Object.fromEntries(new URLSearchParams(rawQueryString).entries()) : null;

  // requestContext additions for Lambda Function URL parity
  const host = (headers["x-forwarded-host"] || headers["host"] || "localhost").toString();
  const hostname = host.split(",")[0].trim();
  const domainName = hostname;
  const domainPrefix = domainName.includes(".") ? domainName.split(".")[0] : domainName;
  const now = Date.now();

  return {
    version: "2.0",
    rawPath: url.pathname,
    rawQueryString,
    headers,
    ...(cookies.length ? { cookies } : {}),
    ...(query ? { queryStringParameters: query } : { queryStringParameters: null }),
    requestContext: {
      routeKey: "$default",
      stage: "$default",
      domainName,
      domainPrefix,
      time: new Date(now).toISOString().replace("T", " ").replace("Z", ""),
      timeEpoch: now,
      http: {
        method: req.method,
        path: url.pathname,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: headers["user-agent"] || "",
      },
    },
    isBase64Encoded: false,
    body,
  };
}

function applyResult(res, result) {
  if (!result) return res.status(500).send("server_error");
  const status = result.statusCode ?? result.status ?? 200;
  const headers = result.headers || {};
  res.status(status);
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined) res.setHeader(k, v);
  }
  // Some handlers set Location with empty body for 302
  return res.send(result.body ?? "");
}

export async function start({ port = 0, staticDir = "web", env = {} } = {}) {
  // Apply env for handlers (override to ensure deterministic test behavior)
  process.env.CODES_TABLE = env.CODES_TABLE || "mem_codes";
  // Force no USERS_TABLE by default to bypass password checks in system tests (unless explicitly provided)
  process.env.USERS_TABLE = Object.prototype.hasOwnProperty.call(env, "USERS_TABLE") ? env.USERS_TABLE : "";
  process.env.ISSUER = env.ISSUER || process.env.ISSUER || "http://127.0.0.1";
  process.env.BASE_URL = env.BASE_URL || process.env.BASE_URL || process.env.ISSUER;

  const app = express();
  // Body parsers
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(express.text({ type: ["text/*", "application/x-www-form-urlencoded"] }));

  // Static pages
  if (staticDir) app.use(express.static(staticDir));

  // Routes
  app.all("/authorize", async (req, res) => {
    try {
      const event = toEvent(req);
      const { handler } = await import("../functions/authorize.mjs");
      const result = await handler(event);
      return applyResult(res, result);
    } catch (e) {
      console.error("/authorize error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/token", async (req, res) => {
    try {
      const event = toEvent(req);
      const { handler } = await import("../functions/token.mjs");
      const result = await handler(event);
      return applyResult(res, result);
    } catch (e) {
      console.error("/token error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/userinfo", async (req, res) => {
    try {
      const event = toEvent(req);
      const { handler } = await import("../functions/userinfo.mjs");
      const result = await handler(event);
      return applyResult(res, result);
    } catch (e) {
      console.error("/userinfo error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/jwks", async (req, res) => {
    try {
      const event = toEvent(req);
      const { handler } = await import("../functions/jwks.mjs");
      const result = await handler(event);
      return applyResult(res, result);
    } catch (e) {
      console.error("/jwks error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(port, () => resolve(s));
  });
  const actualPort = server.address().port;
  const baseUrl = `http://127.0.0.1:${actualPort}`;
  // Ensure env reflects actual issuer
  process.env.ISSUER = env.ISSUER || baseUrl;
  process.env.BASE_URL = env.BASE_URL || baseUrl;

  return {
    app,
    server,
    port: actualPort,
    url: baseUrl,
    async stop() {
      await new Promise((r) => server.close(r));
    },
  };
}

// If invoked directly, start the server for manual testing
if (import.meta.url === `file://${process.argv[1]}`) {
  start({ port: process.env.PORT ? Number(process.env.PORT) : 3000 }).then(({ url }) => {
    console.log("Express OIDC server listening on", url);
  });
}
