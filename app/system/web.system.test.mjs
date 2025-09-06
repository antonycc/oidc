/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadHtmlAndScripts(filePath) {
  const html = readFileSync(filePath, "utf8");
  // Set document HTML without executing scripts automatically
  document.documentElement.innerHTML = html;
  // Extract <script> tags and evaluate them (including external src)
  const scripts = Array.from(document.querySelectorAll("script"));
  for (const s of scripts) {
    let code = s.textContent || "";
    if (s.src) {
      // Resolve relative to the HTML file's directory without require (ESM-safe)
      const baseDir = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : process.cwd();
      const srcAttr = s.getAttribute("src") || "";
      const isAbsolute = srcAttr.startsWith("/") || /^[a-zA-Z]:\\\\/.test(srcAttr);
      const resolved = isAbsolute ? srcAttr : baseDir + "/" + srcAttr.replace(/^\.\//, "");
      try {
        code = readFileSync(resolved, "utf8");
      } catch (e) {
        // If file cannot be read, skip
        continue;
      }
    }
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
});
