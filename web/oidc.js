(() => {
  'use strict';

  function checkLoginStatus() {
    try {
      const tokenData = localStorage.getItem('oidc_tokens');
      if (!tokenData) {
        return { isLoggedIn: false, status: 'Not logged in' };
      }
      const tokens = JSON.parse(tokenData);
      if (!tokens.expires_at || Date.now() >= tokens.expires_at) {
        localStorage.removeItem('oidc_tokens');
        return { isLoggedIn: false, status: 'Not logged in' };
      }
      const userDisplay = tokens.userinfo?.name || tokens.claims?.sub || 'User';
      return { isLoggedIn: true, status: `Logged in as ${userDisplay}`, tokens };
    } catch (e) {
      console.warn('Error checking login status:', e);
      localStorage.removeItem('oidc_tokens');
      return { isLoggedIn: false, status: 'Not logged in' };
    }
  }

  function initAuthStatus() {
    const loginStatus = checkLoginStatus();
    const loginElement = document.querySelector('.login-status');
    if (loginElement) loginElement.textContent = loginStatus.status;

    if (loginStatus.isLoggedIn) {
      const authSection = document.querySelector('.auth-section');
      if (authSection && !authSection.querySelector('.logout-btn')) {
        const logoutBtn = document.createElement('button');
        logoutBtn.textContent = 'Logout';
        logoutBtn.className = 'logout-btn nav';
        logoutBtn.style.marginLeft = '10px';
        logoutBtn.addEventListener('click', () => {
          localStorage.removeItem('oidc_tokens');
          location.reload();
        });
        authSection.appendChild(logoutBtn);
      }
    }
  }

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
      // Position safety: ensure within viewport (basic)
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

  function initHamburgers() {
    const menus = document.querySelectorAll('.hamburger-menu');
    menus.forEach((menu) => {
      const btn = menu.querySelector('.hamburger-btn');
      const dropdown = menu.querySelector('.menu-dropdown');
      if (!btn || !dropdown) return;
      btn.setAttribute('aria-haspopup', 'true');
      btn.setAttribute('aria-expanded', 'false');
      dropdown.setAttribute('aria-hidden', 'true');

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !menu.classList.contains('open');
        closeAllMenus(menu);
        toggleMenu(menu, willOpen);
      });

      // Prevent clicks inside dropdown from closing it immediately
      dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });

    // Click-away
    document.addEventListener('click', () => closeAllMenus());

    // Escape key closes any open menu
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllMenus();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHamburgers();
    initAuthStatus();
  });
})();