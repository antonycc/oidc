(() => {
  'use strict';

  // -------- Auth status helpers --------
  function checkLoginStatus() {
    try {
      // Check for direct OIDC tokens
      const tokenData = localStorage.getItem('oidc_tokens');
      if (tokenData) {
        const tokens = JSON.parse(tokenData);
        if (tokens.expires_at && Date.now() < tokens.expires_at) {
          const userDisplay = tokens.userinfo?.name || tokens.claims?.sub || 'User';
          return { isLoggedIn: true, status: `Logged in as ${userDisplay}`, tokens, method: 'direct' };
        } else {
          localStorage.removeItem('oidc_tokens');
        }
      }
      
      // Check for Cognito authentication
      const cognitoAuth = localStorage.getItem('cognito_auth');
      if (cognitoAuth) {
        const cognitoData = JSON.parse(cognitoAuth);
        // Cognito auth is considered valid for a session (could add timestamp check here)
        if (cognitoData.code && cognitoData.flow === 'cognito') {
          return { isLoggedIn: true, status: 'Logged in (via Cognito)', cognitoData, method: 'cognito' };
        } else {
          localStorage.removeItem('cognito_auth');
        }
      }
      
      return { isLoggedIn: false, status: 'Not logged in' };
    } catch (e) {
      console.warn('Error checking login status:', e);
      localStorage.removeItem('oidc_tokens');
      localStorage.removeItem('cognito_auth');
      return { isLoggedIn: false, status: 'Not logged in' };
    }
  }

  function refreshLoginStatusText() {
    const loginStatus = checkLoginStatus();
    const loginElement = document.querySelector('.login-status');
    const loginLinksElement = document.querySelector('.login-links');
    
    if (loginElement) {
      loginElement.textContent = loginStatus.status;
    }
    
    // Show/hide login links based on authentication status
    if (loginLinksElement) {
      if (loginStatus.isLoggedIn) {
        loginLinksElement.style.display = 'none';
      } else {
        loginLinksElement.style.display = 'block';
      }
    }
  }

  function initAuthStatus() {
    const loginStatus = checkLoginStatus();
    const loginElement = document.querySelector('.login-status');
    const loginLinksElement = document.querySelector('.login-links');
    
    if (loginElement) {
      loginElement.textContent = loginStatus.status;
    }

    if (loginStatus.isLoggedIn) {
      // Hide login links when authenticated
      if (loginLinksElement) {
        loginLinksElement.style.display = 'none';
      }
      
      // Add logout button if not already present
      const authSection = document.querySelector('.auth-section');
      if (authSection && !authSection.querySelector('.logout-btn')) {
        const logoutBtn = document.createElement('button');
        logoutBtn.textContent = 'Logout';
        logoutBtn.className = 'logout-btn nav';
        logoutBtn.style.marginLeft = '10px';
        logoutBtn.addEventListener('click', () => {
          // Clear both types of authentication
          localStorage.removeItem('oidc_tokens');
          localStorage.removeItem('cognito_auth');
          location.reload();
        });
        authSection.appendChild(logoutBtn);
      }
    } else {
      const authSection = document.querySelector('.auth-section');
      if (authSection && !authSection.querySelector('.login-btn')) {
        const loginBtn = document.createElement('button');
        loginBtn.textContent = 'Login';
        loginBtn.className = 'login-btn nav';
        loginBtn.style.marginLeft = '10px';
        loginBtn.addEventListener('click', () => {
          window.location.href = './login.html';
        });
        authSection.appendChild(loginBtn);
      }
    }
  }

  // -------- Hamburger menu helpers --------
  function closeAllMenus(except) {
    document.querySelectorAll('.hamburger-menu').forEach((menu) => {
      if (menu !== except) {
        menu.classList.remove('open');
        const btn = menu.querySelector('.hamburger-btn');
        const dropdown = menu.querySelector('.menu-dropdown');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        if (dropdown) dropdown.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function toggleMenu(menu, open) {
    const isOpen = open ?? !menu.classList.contains('open');
    const btn = menu.querySelector('.hamburger-btn');
    const dropdown = menu.querySelector('.menu-dropdown');
    if (isOpen) {
      menu.classList.add('open');
      if (btn) btn.setAttribute('aria-expanded', 'true');
      if (dropdown) dropdown.setAttribute('aria-hidden', 'false');
      if (dropdown) {
        const rect = dropdown.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
          dropdown.style.left = 'auto';
          dropdown.style.right = '0';
        }
      }
    } else {
      menu.classList.remove('open');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      if (dropdown) dropdown.setAttribute('aria-hidden', 'true');
    }
  }

  function ensureMenuUtilityItems(dropdown) {
    // Avoid duplicate injection
    if (dropdown.querySelector('[data-action="view-source"]')) return;

    // Prefer explicit target container if present
    const target = dropdown.querySelector('[data-utils-target]') || dropdown;

    // Divider
    const hr = document.createElement('div');
    hr.className = 'menu-divider';

    const viewLS = document.createElement('a');
    viewLS.href = '#';
    viewLS.textContent = 'View local storage';
    viewLS.setAttribute('data-action', 'view-local-storage');

    const clearLS = document.createElement('a');
    clearLS.href = '#';
    clearLS.textContent = 'Clear local storage';
    clearLS.setAttribute('data-action', 'clear-local-storage');

    target.appendChild(hr);
    target.appendChild(viewLS);
    target.appendChild(clearLS);
  }

  function initHamburgers() {
    const menus = document.querySelectorAll('.hamburger-menu');
    menus.forEach((menu) => {
      const btn = menu.querySelector('.hamburger-btn');
      const dropdown = menu.querySelector('.menu-dropdown');
      if (!btn || !dropdown) return;
      btn.setAttribute('aria-haspopup', 'true');
      btn.setAttribute('aria-expanded', 'false');
      dropdown.setAttribute('aria-hidden', 'true');

      // Inject utility items
      ensureMenuUtilityItems(dropdown);

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !menu.classList.contains('open');
        closeAllMenus(menu);
        toggleMenu(menu, willOpen);
      });

      dropdown.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const action = target.getAttribute('data-action');
        if (!action) return; // allow normal links to bubble/close
        e.preventDefault();
        e.stopPropagation();
        if (action === 'view-source') showViewSourceModal();
        if (action === 'view-local-storage') showLocalStorageModal();
        if (action === 'clear-local-storage') clearLocalStorageAction();
        // keep menu open while modal is open, otherwise close
        closeAllMenus();
      });
    });

    document.addEventListener('click', () => closeAllMenus());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllMenus();
    });
  }

  // -------- Modal helpers --------
  function ensureModalRoot() {
    let root = document.getElementById('modal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'modal-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function openModal(title, contentNode, actions = []) {
    const root = ensureModalRoot();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const h = document.createElement('h2');
    h.textContent = title;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => root.removeChild(overlay));

    header.appendChild(h);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.appendChild(contentNode);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    actions.forEach((a) => footer.appendChild(a));

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    root.appendChild(overlay);

    const onKey = (e) => { if (e.key === 'Escape') { cleanup(); } };
    const onClickAway = (e) => { if (e.target === overlay) { cleanup(); } };
    function cleanup() {
      document.removeEventListener('keydown', onKey);
      overlay.removeEventListener('click', onClickAway);
      if (overlay.parentElement === root) root.removeChild(overlay);
    }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', onClickAway);
  }

  function makeButton(text, onClick) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // -------- Local Storage Viewer/Clear --------
  function getLocalStorageDump() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      try {
        const v = localStorage.getItem(k);
        try { out[k] = JSON.parse(v); } catch { out[k] = v; }
      } catch (e) {
        out[k] = '[unreadable]';
      }
    }
    return out;
  }

  function showLocalStorageModal() {
    const dump = getLocalStorageDump();
    const txt = JSON.stringify(dump, null, 2);
    const pre = document.createElement('pre');
    pre.className = 'code';
    pre.style.maxHeight = '60vh';
    pre.style.overflow = 'auto';
    pre.textContent = txt;

    const copyBtn = makeButton('Copy', async () => {
      try { await navigator.clipboard.writeText(txt); copyBtn.textContent = 'Copied'; setTimeout(() => copyBtn.textContent = 'Copy', 1500); } catch {}
    });

    openModal('Local storage', pre, [copyBtn]);
  }

  function clearLocalStorageAction() {
    const content = document.createElement('div');
    content.innerHTML = '<p>Are you sure you want to clear local storage?</p>';

    const cancelBtn = makeButton('Cancel', () => {
      const overlay = content.closest('.modal-overlay');
      if (overlay && overlay.parentElement) overlay.parentElement.removeChild(overlay);
    });
    const clearBtn = makeButton('Clear', () => {
      try {
        localStorage.clear();
      } finally {
        refreshLoginStatusText();
        location.reload();
      }
    });

    openModal('Confirm', content, [cancelBtn, clearBtn]);
  }

  // -------- Init --------
  document.addEventListener('DOMContentLoaded', () => {
    initHamburgers();
    initAuthStatus();
  });
})();