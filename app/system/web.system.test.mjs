/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadHtmlAndScripts(filePath) {
  const html = readFileSync(filePath, "utf8");
  document.documentElement.innerHTML = html;

  const scripts = Array.from(document.querySelectorAll("script"));
  for (const script of scripts) {
    let code = script.textContent || "";

    // Load external scripts relative to the HTML file
    if (script.src && !code) {
      const htmlDir = filePath.substring(0, filePath.lastIndexOf("/"));

      // Handle relative paths properly - JSDOM converts to absolute URLs
      let relativeUrl = script.src;
      if (script.src.startsWith("http://") || script.src.startsWith("https://")) {
        // Extract just the filename if it's been converted to absolute URL
        relativeUrl = script.src.split("/").pop();
      }

      const scriptPath = join(htmlDir, relativeUrl.replace(/^\.\//, ""));
      try {
        code = readFileSync(scriptPath, "utf8");
      } catch (e) {
        continue; // Skip if script file not found
      }
    }

    if (code.trim()) {
      // eslint-disable-next-line no-new-func
      const fn = new Function(code);
      fn.call(window);
    }
  }
}

describe("system(jsdom): web UI basics without Playwright", () => {
  beforeEach(() => {
    // Reset DOM
    document.documentElement.innerHTML = "<html><head></head><body></body></html>";
    // Clear storage
    localStorage.clear();
    sessionStorage.clear();
  });

  it("index.html shows login status and adds logout when logged in; clicking logout clears tokens and reloads", async () => {
    const filePath = join(process.cwd(), "web", "index.html");

    // Seed a valid token with future expiry and userinfo
    const future = Date.now() + 60_000;
    localStorage.setItem(
      "oidc_tokens",
      JSON.stringify({ access_token: "t", id_token: "i", expires_at: future, userinfo: { name: "Test User" } }),
    );

    loadHtmlAndScripts(filePath);

    // Fire DOMContentLoaded to trigger page logic
    document.dispatchEvent(new Event("DOMContentLoaded"));

    const status = document.querySelector(".login-status");
    expect(status?.textContent || "").toContain("Logged in as Test User");

    const logoutBtn = document.querySelector(".logout-btn");
    expect(logoutBtn).toBeTruthy();

    // Click logout and verify side effects
    try {
      logoutBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    } catch (e) {
      // jsdom doesn't implement navigation; ignore reload error
    }
    expect(localStorage.getItem("oidc_tokens")).toBeNull();
  });

  it("post-auth.html shows login status and button state changes when user becomes logged in", async () => {
    const filePath = join(process.cwd(), "web", "post-auth.html");

    // Initial state: not logged in
    loadHtmlAndScripts(filePath);
    document.dispatchEvent(new Event("DOMContentLoaded"));

    const status = document.querySelector(".login-status");
    // After DOMContentLoaded, initAuthStatus() runs and sets status to "Not logged in"
    expect(status?.textContent || "").toBe("Not logged in");

    // Should have a login button initially (created by initAuthStatus)
    let loginBtn = document.querySelector(".login-btn");
    let logoutBtn = document.querySelector(".logout-btn");
    expect(loginBtn).toBeTruthy();
    expect(logoutBtn).toBeFalsy();

    // Simulate successful authentication by setting tokens
    const future = Date.now() + 60_000;
    localStorage.setItem(
      "oidc_tokens",
      JSON.stringify({
        access_token: "access_token_value",
        id_token: "id_token_value",
        expires_at: future,
        userinfo: { name: "Test User" },
      }),
    );

    // Call refreshLoginStatusText (this simulates what happens after successful auth)
    if (typeof window.refreshLoginStatusText === "function") {
      window.refreshLoginStatusText();
    }

    // Check that status text is updated
    expect(status?.textContent || "").toContain("Logged in as Test User");

    // Check that button state has changed: login button removed, logout button added
    loginBtn = document.querySelector(".login-btn");
    logoutBtn = document.querySelector(".logout-btn");
    expect(loginBtn).toBeFalsy();
    expect(logoutBtn).toBeTruthy();
    expect(logoutBtn?.textContent).toBe("Logout");
  });
});
