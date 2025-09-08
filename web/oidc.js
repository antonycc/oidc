(() => {
  "use strict";

  // -------- Auth status helpers --------
  function checkLoginStatus() {
    try {
      // Check for direct OIDC tokens
      const tokenData = localStorage.getItem("oidc_tokens");
      if (tokenData) {
        const tokens = JSON.parse(tokenData);
        if (tokens.expires_at && Date.now() < tokens.expires_at) {
          const userDisplay = tokens.userinfo?.name || tokens.claims?.sub || "User";
          return { isLoggedIn: true, status: `Logged in as ${userDisplay}`, tokens, method: "direct" };
        } else {
          localStorage.removeItem("oidc_tokens");
        }
      }

      return { isLoggedIn: false, status: "Not logged in" };
    } catch (e) {
      console.warn("Error checking login status:", e);
      localStorage.removeItem("oidc_tokens");
      return { isLoggedIn: false, status: "Not logged in" };
    }
  }

  function refreshLoginStatusText() {
    const loginStatus = checkLoginStatus();
    const loginElement = document.querySelector(".login-status");
    const loginLinksElement = document.querySelector(".login-links");

    if (loginElement) {
      loginElement.textContent = loginStatus.status;
    }

    // Show/hide login links based on authentication status
    if (loginLinksElement) {
      if (loginStatus.isLoggedIn) {
        loginLinksElement.style.display = "none";
      } else {
        loginLinksElement.style.display = "block";
      }
    }
  }

  // Make refreshLoginStatusText globally available
  window.refreshLoginStatusText = refreshLoginStatusText;

  function initAuthStatus() {
    const loginStatus = checkLoginStatus();
    const loginElement = document.querySelector(".login-status");
    const loginLinksElement = document.querySelector(".login-links");

    if (loginElement) {
      loginElement.textContent = loginStatus.status;
    }

    if (loginStatus.isLoggedIn) {
      // Hide login links when authenticated
      if (loginLinksElement) {
        loginLinksElement.style.display = "none";
      }

      // Add logout button if not already present
      const authSection = document.querySelector(".auth-section");
      if (authSection && !authSection.querySelector(".logout-btn")) {
        const logoutBtn = document.createElement("button");
        logoutBtn.textContent = "Logout";
        logoutBtn.className = "logout-btn nav";
        logoutBtn.style.marginLeft = "10px";
        logoutBtn.addEventListener("click", () => {
          // Clear OIDC authentication
          localStorage.removeItem("oidc_tokens");
          location.reload();
        });
        authSection.appendChild(logoutBtn);
      }
    } else {
      const authSection = document.querySelector(".auth-section");
      if (authSection && !authSection.querySelector(".login-btn")) {
        const loginBtn = document.createElement("button");
        loginBtn.textContent = "Login";
        loginBtn.className = "login-btn nav";
        loginBtn.style.marginLeft = "10px";
        loginBtn.addEventListener("click", () => {
          window.location.href = "./login.html";
        });
        authSection.appendChild(loginBtn);
      }
    }
  }

  // -------- Hamburger menu helpers --------
  function closeAllMenus(except) {
    document.querySelectorAll(".hamburger-menu").forEach((menu) => {
      if (menu !== except) {
        menu.classList.remove("open");
        const btn = menu.querySelector(".hamburger-btn");
        const dropdown = menu.querySelector(".menu-dropdown");
        if (btn) btn.setAttribute("aria-expanded", "false");
        if (dropdown) dropdown.setAttribute("aria-hidden", "true");
      }
    });
  }

  function toggleMenu(menu, open) {
    const isOpen = open ?? !menu.classList.contains("open");
    const btn = menu.querySelector(".hamburger-btn");
    const dropdown = menu.querySelector(".menu-dropdown");
    if (isOpen) {
      menu.classList.add("open");
      if (btn) btn.setAttribute("aria-expanded", "true");
      if (dropdown) dropdown.setAttribute("aria-hidden", "false");
      if (dropdown) {
        const rect = dropdown.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
          dropdown.style.left = "auto";
          dropdown.style.right = "0";
        }
      }
    } else {
      menu.classList.remove("open");
      if (btn) btn.setAttribute("aria-expanded", "false");
      if (dropdown) dropdown.setAttribute("aria-hidden", "true");
    }
  }

  function ensureMenuUtilityItems(dropdown) {
    // Avoid duplicate injection
    if (dropdown.querySelector('[data-action="view-source"]')) return;

    // Prefer explicit target container if present
    const target = dropdown.querySelector("[data-utils-target]") || dropdown;

    // Divider
    const hr = document.createElement("div");
    hr.className = "menu-divider";

    const viewLS = document.createElement("a");
    viewLS.href = "#";
    viewLS.textContent = "View local storage";
    viewLS.setAttribute("data-action", "view-local-storage");

    const clearLS = document.createElement("a");
    clearLS.href = "#";
    clearLS.textContent = "Clear local storage";
    clearLS.setAttribute("data-action", "clear-local-storage");

    target.appendChild(hr);
    target.appendChild(viewLS);
    target.appendChild(clearLS);
  }

  function initHamburgers() {
    const menus = document.querySelectorAll(".hamburger-menu");
    menus.forEach((menu) => {
      const btn = menu.querySelector(".hamburger-btn");
      const dropdown = menu.querySelector(".menu-dropdown");
      if (!btn || !dropdown) return;
      btn.setAttribute("aria-haspopup", "true");
      btn.setAttribute("aria-expanded", "false");
      dropdown.setAttribute("aria-hidden", "true");

      // Inject utility items
      ensureMenuUtilityItems(dropdown);

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const willOpen = !menu.classList.contains("open");
        closeAllMenus(menu);
        toggleMenu(menu, willOpen);
      });

      dropdown.addEventListener("click", (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const action = target.getAttribute("data-action");
        if (!action) return; // allow normal links to bubble/close
        e.preventDefault();
        e.stopPropagation();
        if (action === "view-source") showViewSourceModal();
        if (action === "view-local-storage") showLocalStorageModal();
        if (action === "clear-local-storage") clearLocalStorageAction();
        // keep menu open while modal is open, otherwise close
        closeAllMenus();
      });
    });

    document.addEventListener("click", () => closeAllMenus());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllMenus();
    });
  }

  // -------- Modal helpers --------
  function ensureModalRoot() {
    let root = document.getElementById("modal-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "modal-root";
      document.body.appendChild(root);
    }
    return root;
  }

  function openModal(title, contentNode, actions = []) {
    const root = ensureModalRoot();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const modal = document.createElement("div");
    modal.className = "modal";

    const header = document.createElement("div");
    header.className = "modal-header";
    const h = document.createElement("h2");
    h.textContent = title;
    const closeBtn = document.createElement("button");
    closeBtn.className = "modal-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => root.removeChild(overlay));

    header.appendChild(h);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "modal-body";
    body.appendChild(contentNode);

    const footer = document.createElement("div");
    footer.className = "modal-footer";
    actions.forEach((a) => footer.appendChild(a));

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    root.appendChild(overlay);

    const onKey = (e) => {
      if (e.key === "Escape") {
        cleanup();
      }
    };
    const onClickAway = (e) => {
      if (e.target === overlay) {
        cleanup();
      }
    };
    function cleanup() {
      document.removeEventListener("keydown", onKey);
      overlay.removeEventListener("click", onClickAway);
      if (overlay.parentElement === root) root.removeChild(overlay);
    }
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", onClickAway);
  }

  function makeButton(text, onClick) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.addEventListener("click", onClick);
    return btn;
  }

  // -------- JWT Decoding --------
  function decodeJwtNoVerify(jwt) {
    try {
      const [, payload] = jwt.split(".");
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(paddedBase64), (c) => c.charCodeAt(0))));
    } catch {
      return null;
    }
  }

  // -------- Local Storage Viewer/Clear --------
  function getLocalStorageDump() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      try {
        const v = localStorage.getItem(k);
        try {
          out[k] = JSON.parse(v);
        } catch {
          out[k] = v;
        }
      } catch (e) {
        out[k] = "[unreadable]";
      }
    }
    return out;
  }

  function showLocalStorageModal() {
    const dump = getLocalStorageDump();
    const txt = JSON.stringify(dump, null, 2);
    const pre = document.createElement("pre");
    pre.className = "code";
    pre.style.maxHeight = "60vh";
    pre.style.overflow = "auto";
    pre.textContent = txt;

    const copyBtn = makeButton("Copy", async () => {
      try {
        await navigator.clipboard.writeText(txt);
        copyBtn.textContent = "Copied";
        setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
      } catch {}
    });

    // JWT Decoding buttons
    const decodeAccessTokenBtn = makeButton("Decode Access Token", () => {
      try {
        const tokenData = localStorage.getItem("oidc_tokens");
        if (!tokenData) {
          alert("No OIDC tokens found in localStorage");
          return;
        }
        const tokens = JSON.parse(tokenData);
        if (!tokens.access_token) {
          alert("No access_token found in OIDC tokens");
          return;
        }
        const decoded = decodeJwtNoVerify(tokens.access_token);
        if (!decoded) {
          alert("Failed to decode access token - invalid JWT format");
          return;
        }
        localStorage.setItem("access_token_json", JSON.stringify(decoded, null, 2));
        decodeAccessTokenBtn.textContent = "Decoded";
        setTimeout(() => (decodeAccessTokenBtn.textContent = "Decode Access Token"), 1500);
        
        // Refresh modal content
        setTimeout(() => {
          // Close current modal and reopen with updated content
          const overlay = pre.closest(".modal-overlay");
          if (overlay && overlay.parentElement) {
            overlay.parentElement.removeChild(overlay);
            showLocalStorageModal();
          }
        }, 100);
      } catch (error) {
        console.error("Error decoding access token:", error);
        alert("Error decoding access token: " + error.message);
      }
    });

    const decodeIdTokenBtn = makeButton("Decode ID Token", () => {
      try {
        const tokenData = localStorage.getItem("oidc_tokens");
        if (!tokenData) {
          alert("No OIDC tokens found in localStorage");
          return;
        }
        const tokens = JSON.parse(tokenData);
        if (!tokens.id_token) {
          alert("No id_token found in OIDC tokens");
          return;
        }
        const decoded = decodeJwtNoVerify(tokens.id_token);
        if (!decoded) {
          alert("Failed to decode ID token - invalid JWT format");
          return;
        }
        localStorage.setItem("id_token_json", JSON.stringify(decoded, null, 2));
        decodeIdTokenBtn.textContent = "Decoded";
        setTimeout(() => (decodeIdTokenBtn.textContent = "Decode ID Token"), 1500);
        
        // Refresh modal content
        setTimeout(() => {
          // Close current modal and reopen with updated content
          const overlay = pre.closest(".modal-overlay");
          if (overlay && overlay.parentElement) {
            overlay.parentElement.removeChild(overlay);
            showLocalStorageModal();
          }
        }, 100);
      } catch (error) {
        console.error("Error decoding ID token:", error);
        alert("Error decoding ID token: " + error.message);
      }
    });

    openModal("Local storage", pre, [copyBtn, decodeAccessTokenBtn, decodeIdTokenBtn]);
  }

  function clearLocalStorageAction() {
    const content = document.createElement("div");
    content.innerHTML = "<p>Are you sure you want to clear local storage?</p>";

    const cancelBtn = makeButton("Cancel", () => {
      const overlay = content.closest(".modal-overlay");
      if (overlay && overlay.parentElement) overlay.parentElement.removeChild(overlay);
    });
    const clearBtn = makeButton("Clear", () => {
      try {
        localStorage.clear();
      } finally {
        refreshLoginStatusText();
        location.reload();
      }
    });

    openModal("Confirm", content, [cancelBtn, clearBtn]);
  }

  // -------- OIDC Discovery Terminal --------
  let terminalStartTime = null;
  
  function getElapsedTime() {
    if (!terminalStartTime) return "0.000s";
    const elapsed = (Date.now() - terminalStartTime) / 1000;
    return elapsed.toFixed(3) + "s";
  }
  
  function addTerminalLine(text, className = "") {
    const terminalContent = document.getElementById("terminal-output");
    if (!terminalContent) return;
    
    const line = document.createElement("div");
    line.className = `terminal-line ${className}`;
    line.textContent = text;
    terminalContent.appendChild(line);
    
    // Auto-scroll to bottom
    terminalContent.scrollTop = terminalContent.scrollHeight;
  }
  
  function addTimestampLine(text) {
    addTerminalLine(`[${getElapsedTime()}] ${text}`, "timestamp");
  }
  
  function formatJson(obj, maxLength = 100) {
    const str = JSON.stringify(obj, null, 2);
    if (str.length > maxLength) {
      return JSON.stringify(obj);
    }
    return str;
  }
  
  async function performOidcDiscovery() {
    if (!document.getElementById("terminal-output")) return; // Only run on home page
    
    // Skip OIDC discovery in test environments (JSDOM)
    if (typeof window.navigator?.userAgent === 'string' && window.navigator.userAgent.includes('jsdom')) {
      addTimestampLine("Skipping OIDC discovery in test environment");
      return;
    }
    
    terminalStartTime = Date.now();
    // Use configurable OIDC provider base URL for discovery demo.
    // Set window.OIDC_BASE_URL in your HTML or build config for development.
    const baseUrl = window.OIDC_BASE_URL || window.location.origin;
    
    try {
      addTimestampLine("Starting OIDC Discovery Process");
      addTerminalLine("");
      
      // Step 1: Fetch well-known configuration
      addTimestampLine("Step 1: Fetching OIDC Discovery Document");
      const wellKnownUrl = `${baseUrl}/.well-known/openid-configuration`;
      addTerminalLine(`GET ${wellKnownUrl}`, "url");
      
      const configResponse = await fetch(wellKnownUrl);
      addTimestampLine(`Response: ${configResponse.status} ${configResponse.statusText}`);
      
      // Show response headers
      addTerminalLine("Response Headers:", "header");
      for (const [key, value] of configResponse.headers.entries()) {
        addTerminalLine(`  ${key}: ${value}`, "header");
      }
      addTerminalLine("");
      
      if (!configResponse.ok) {
        addTerminalLine(`Error: ${configResponse.status}`, "error");
        return;
      }
      
      const config = await configResponse.json();
      addTerminalLine("Discovery Document Payload:", "success");
      addTerminalLine(formatJson(config), "payload");
      addTerminalLine("");
      
      // Step 2: Extract and display key information
      addTimestampLine("Step 2: Parsing Discovery Document");
      addTerminalLine("Key Configuration:", "decoded");
      addTerminalLine(`  Issuer: ${config.issuer}`, "decoded");
      addTerminalLine(`  Authorization Endpoint: ${config.authorization_endpoint}`, "decoded");
      addTerminalLine(`  Token Endpoint: ${config.token_endpoint}`, "decoded");
      addTerminalLine(`  UserInfo Endpoint: ${config.userinfo_endpoint}`, "decoded");
      addTerminalLine(`  JWKS URI: ${config.jwks_uri}`, "decoded");
      addTerminalLine(`  Supported Scopes: ${config.scopes_supported?.join(", ")}`, "decoded");
      addTerminalLine(`  Supported Response Types: ${config.response_types_supported?.join(", ")}`, "decoded");
      addTerminalLine("");
      
      // Step 3: Fetch JWKS
      if (config.jwks_uri) {
        addTimestampLine("Step 3: Fetching JSON Web Key Set (JWKS)");
        addTerminalLine(`GET ${config.jwks_uri}`, "url");
        
        const jwksResponse = await fetch(config.jwks_uri);
        addTimestampLine(`Response: ${jwksResponse.status} ${jwksResponse.statusText}`);
        
        // Show response headers
        addTerminalLine("Response Headers:", "header");
        for (const [key, value] of jwksResponse.headers.entries()) {
          addTerminalLine(`  ${key}: ${value}`, "header");
        }
        addTerminalLine("");
        
        if (jwksResponse.ok) {
          const jwks = await jwksResponse.json();
          addTerminalLine("JWKS Payload:", "success");
          addTerminalLine(formatJson(jwks), "payload");
          addTerminalLine("");
          
          // Step 4: Decode JWKS
          addTimestampLine("Step 4: Decoding JWKS Components");
          if (jwks.keys && jwks.keys.length > 0) {
            jwks.keys.forEach((key, index) => {
              addTerminalLine(`Key ${index + 1} Analysis:`, "decoded");
              addTerminalLine(`  Key Type (kty): ${key.kty} - ${key.kty === 'RSA' ? 'RSA Public Key' : 'Unknown key type'}`, "decoded");
              addTerminalLine(`  Usage (use): ${key.use} - ${key.use === 'sig' ? 'Digital Signature' : 'Unknown usage'}`, "decoded");
              addTerminalLine(`  Algorithm (alg): ${key.alg} - ${key.alg === 'RS256' ? 'RSA Signature with SHA-256' : 'Unknown algorithm'}`, "decoded");
              addTerminalLine(`  Key ID (kid): ${key.kid} - Unique identifier for this key`, "decoded");
              
              if (key.n) {
                const nLength = key.n.length;
                addTerminalLine(`  Modulus (n): ${nLength} chars - RSA public key modulus (${Math.floor((nLength * 3 / 4) * 8)} bits approx)`, "decoded");
              }
              if (key.e) {
                addTerminalLine(`  Exponent (e): ${key.e} - RSA public key exponent (typically 65537 in base64url: AQAB)`, "decoded");
              }
              addTerminalLine("", "decoded");
            });
          } else {
            addTerminalLine("No keys found in JWKS", "error");
          }
        } else {
          addTerminalLine(`Error fetching JWKS: ${jwksResponse.status}`, "error");
        }
      }
      
      addTimestampLine("OIDC Discovery Process Complete");
      addTerminalLine("", "success");
      addTerminalLine("Summary: Successfully discovered OIDC provider configuration", "success");
      addTerminalLine("This information can be used by OIDC clients to authenticate users", "success");
      
    } catch (error) {
      addTerminalLine(`Error: ${error.message}`, "error");
      console.error("OIDC Discovery error:", error);
    }
  }

  // -------- Init --------
  function waitForTerminalOutput(callback) {
    function check() {
      if (document.getElementById("terminal-output")) {
        callback();
      } else {
        requestAnimationFrame(check);
      }
    }
    check();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initHamburgers();
    initAuthStatus();
    
    // Start OIDC discovery process on home page when terminal-output is ready
    waitForTerminalOutput(() => {
      performOidcDiscovery();
    });
  });
})();
