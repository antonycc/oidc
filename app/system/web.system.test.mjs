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

  it("index.html shows login status", async () => {
    const filePath = join(process.cwd(), "web", "index.html");

    loadHtmlAndScripts(filePath);

    // Fire DOMContentLoaded to trigger page logic
    document.dispatchEvent(new Event("DOMContentLoaded"));

    const status = document.querySelector(".login-status");
    expect(status?.textContent || "").toContain("Not logged in");
  });
});
