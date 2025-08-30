/**
 * Test to validate post-auth login status update behavior
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Post-auth login status update', () => {
  let mockLocalStorage;
  let mockElement;
  let refreshLoginStatusText;
  
  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {
      store: {},
      getItem: vi.fn((key) => mockLocalStorage.store[key] || null),
      setItem: vi.fn((key, value) => { mockLocalStorage.store[key] = value; }),
      removeItem: vi.fn((key) => { delete mockLocalStorage.store[key]; })
    };
    global.localStorage = mockLocalStorage;
    
    // Mock DOM element
    mockElement = {
      textContent: 'Initial status'
    };
    global.document = {
      querySelector: vi.fn(() => mockElement)
    };
    
    // Mock console.warn
    global.console.warn = vi.fn();
    
    // Create the functions as they exist in oidc.js
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

    refreshLoginStatusText = function() {
      const loginStatus = checkLoginStatus();
      const loginElement = document.querySelector('.login-status');
      if (loginElement) loginElement.textContent = loginStatus.status;
    };
  });
  
  it('should update status to show username when refreshLoginStatusText is called', () => {
    // Store sample token data with userinfo
    const tokenData = {
      access_token: 'test-token',
      id_token: 'test-id-token',
      expires_at: Date.now() + 300000, // 5 minutes from now
      claims: { sub: 'test-user' },
      userinfo: { name: 'Test User', sub: 'test-user', email: 'test@example.com' }
    };
    
    mockLocalStorage.store['oidc_tokens'] = JSON.stringify(tokenData);
    
    // Call the refresh function
    refreshLoginStatusText();
    
    // Verify it shows the proper user display
    expect(global.document.querySelector).toHaveBeenCalledWith('.login-status');
    expect(mockElement.textContent).toBe('Logged in as Test User');
  });
  
  it('should fallback to sub when no name is available', () => {
    // Store token data without userinfo name
    const tokenData = {
      access_token: 'test-token',
      id_token: 'test-id-token',
      expires_at: Date.now() + 300000,
      claims: { sub: 'test-user' },
      userinfo: { sub: 'test-user', email: 'test@example.com' } // No name field
    };
    
    mockLocalStorage.store['oidc_tokens'] = JSON.stringify(tokenData);
    
    refreshLoginStatusText();
    
    expect(mockElement.textContent).toBe('Logged in as test-user');
  });
  
  it('should show "Not logged in" when no tokens exist', () => {
    // No tokens in localStorage
    refreshLoginStatusText();
    
    expect(mockElement.textContent).toBe('Not logged in');
  });
});