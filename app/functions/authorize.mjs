import { ulid } from "ulid";
import { put, get, tables } from "../lib/db.mjs";
import bcrypt from "bcryptjs";
import { getClient, isScopeSubset, isValidRedirectUri, validateRedirectUri, validateScopes, isPkceRequired } from "../lib/clients.mjs";

// Very verbose logging by design
const log = (...a) => console.log(JSON.stringify({ level: "info", ts: new Date().toISOString(), msg: a.join(" ") }));

export const handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || "GET";
    const url = new URL(event.rawPath + (event.rawQueryString ? "?" + event.rawQueryString : ""), "https://issuer");
    const qp = Object.fromEntries(url.searchParams.entries());
    // TODO: Remove support for GET and whatever calls it
    if (method === "GET" && !qp.username) {
      return html(200, loginFormHtml(qp));
    }
    if (method === "POST") {
      const body = new URLSearchParams(event.body || "");
      for (const [k, v] of body.entries()) qp[k] = v;
    }
    log("authorize", method, JSON.stringify(qp));

    const req = [
      "client_id",
      "redirect_uri",
      "response_type",
      "scope",
      "state",
      "nonce",
      "code_challenge",
      "code_challenge_method",
    ];
    for (const k of req) if (!qp[k]) return bad(400, "missing " + k);
    if (qp.response_type !== "code") return bad(400, "unsupported_response_type");
    if (qp.code_challenge_method !== "S256") return bad(400, "invalid_request");

    // Client registry validation
    const client = getClient(qp.client_id);
    if (!client) return bad(400, "invalid_client");
    if (client.pkceRequired && !qp.code_challenge) return bad(400, "invalid_request");
    if (!isValidRedirectUri(client, qp.redirect_uri)) return bad(400, "invalid_request");
    if (!isScopeSubset(client, qp.scope)) return bad(400, "invalid_scope");

    // Validate redirect URI is allowed for this client
    if (!validateRedirectUri(qp.client_id, qp.redirect_uri)) {
      return bad(400, "invalid_redirect_uri");
    }

    // Validate scopes are allowed for this client
    if (!validateScopes(qp.client_id, qp.scope)) {
      return bad(400, "invalid_scope");
    }

    // Validate PKCE if required
    if (isPkceRequired(qp.client_id) && (!qp.code_challenge || !qp.code_challenge_method)) {
      return bad(400, "pkce_required");
    }

    const username = qp.username || "test-user";
    if (process.env.USERS_TABLE && method === "POST") {
      const got = await get(tables.users, { username });
      // Use a dummy hash if user not found to mitigate timing attacks
      const hash = got.Item?.passwordHash || "$2a$10$zCwQ6QJkQ6QJkQ6QJkQ6QOeQ6QJkQ6QJkQ6QJkQ6QJkQ6QJkQ6QJk"; // bcrypt hash for "dummy"
      const ok = !!qp.password && bcrypt.compareSync(qp.password, hash);
      if (!ok || !got.Item?.passwordHash) {
        return html(401, loginFormHtml(qp, "Invalid username or password"));
      }
    } else if (process.env.USERS_TABLE && method !== "POST") {
      // If users table exists and it's not a POST yet, render the form (guards accidental GET username bypass)
      return html(200, loginFormHtml(qp));
    }

    const code = ulid();
    const ttl = Math.floor(Date.now() / 1000) + 180;
    await put(tables.codes, {
      code,
      ttl,
      client: qp.client_id,
      redirect: qp.redirect_uri,
      scope: qp.scope,
      nonce: qp.nonce,
      ch: qp.code_challenge,
      ccm: qp.code_challenge_method,
      used: false,
      sub: username,
    });
    const location = `${qp.redirect_uri}?code=${code}&state=${encodeURIComponent(qp.state)}`;
    log("redirect", location);
    return { statusCode: 302, headers: { Location: location }, body: "" };
  } catch (e) {
    console.error("authorize_error", e);
    return bad(500, "server_error");
  }
};

const bad = (s, m) => ({
  statusCode: s,
  headers: { "content-type": "text/plain", "cache-control": "no-store" },
  body: m,
});

const html = (s, b) => ({
  statusCode: s,
  headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  body: b,
});

function loginFormHtml(qp, errorMsg) {
  const hidden = Object.entries(qp)
    .filter(([k]) => k !== "username" && k !== "password")
    .map(([k, v]) => `<input type='hidden' name='${k}' value='${escapeHtml(v)}'>`)
    .join("");
  const errorHtml = errorMsg ? `<div class='error'>${escapeHtml(errorMsg)}</div>` : "";
  return `<!doctype html><html lang='en'>
<head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><link rel='stylesheet' href='/oidc.css'><title>Sign in</title></head>
<body>
<header>
  <div class='header-nav'>
    <div class='hamburger-menu'><button class='hamburger-btn'>☰</button><div class='menu-dropdown'><a href='/'>Home</a></div></div>
    <div class='auth-section'><span class='login-status'>Not logged in</span></div>
  </div>
</header>
<main class='container'>
  <h1>Sign in</h1>
  ${errorHtml}
  <form method='post' action='/authorize' class='form-card'>
    ${hidden}
    <label>Username <input type='text' name='username' required></label>
    <label>Password <input type='password' name='password' required></label>
    <button type='submit'>Continue</button>
  </form>
</main>
<footer><small>© 2025 OIDC Provider</small></footer></body></html>`;
}

function escapeHtml(s = "") {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
}
