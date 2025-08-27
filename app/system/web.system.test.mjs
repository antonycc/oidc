/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadHtmlAndScripts(filePath) {
  const html = readFileSync(filePath, "utf8");
  // Set document HTML without executing scripts automatically
  document.documentElement.innerHTML = html;
  // Extract inline <script> tags and evaluate their content in this context
  const scripts = Array.from(document.querySelectorAll("script"));
  for (const s of scripts) {
    if (s.src) continue; // not loading external
    const code = s.textContent || "";
    if (code.trim()) {
      // Execute script in window context
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
      JSON.stringify({ access_token: "t", id_token: "i", expires_at: future, userinfo: { name: "Test User" } })
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
});
