// Configuration for OIDC Provider web pages
// This file can be updated during deployment with actual values
window.OidcConfig = {
  // Cognito configuration - will be updated during deployment
  cognitoDomain: null, // e.g., 'auth.oidc.antonycc.com'
  cognitoClientId: null, // e.g., from CognitoStack outputs
  
  // Environment detection
  environment: 'development', // 'development', 'ci', 'production'
  
  // Auto-detect configuration based on current domain
  autoDetect: function() {
    const currentDomain = window.location.hostname;
    
    // Production configuration
    if (currentDomain === 'oidc.antonycc.com') {
      this.environment = 'production';
      this.cognitoDomain = 'auth.oidc.antonycc.com';
      // cognitoClientId should be set during deployment
    }
    
    // CI configuration  
    else if (currentDomain === 'ci.oidc.antonycc.com') {
      this.environment = 'ci';
      this.cognitoDomain = 'ci.auth.oidc.antonycc.com';
      // cognitoClientId should be set during deployment
    }
    
    // Branch-specific CI configuration
    else if (currentDomain.match(/^ci-.+\.oidc\.antonycc\.com$/)) {
      this.environment = 'ci-branch';
      this.cognitoDomain = currentDomain.replace('oidc.', 'auth.oidc.');
      // cognitoClientId should be set during deployment
    }
    
    // Development/localhost
    else if (currentDomain.includes('localhost') || currentDomain.includes('127.0.0.1')) {
      this.environment = 'development';
      this.cognitoDomain = 'YOUR_COGNITO_DOMAIN.auth.us-east-1.amazoncognito.com';
      this.cognitoClientId = 'YOUR_CLIENT_ID';
    }
    
    // Generic fallback - try to infer
    else {
      this.environment = 'unknown';
      const parts = currentDomain.split('.');
      if (parts.length >= 3) {
        // Replace 'oidc' with 'auth' in subdomain
        const authParts = [...parts];
        authParts[0] = authParts[0].replace('oidc', 'auth');
        this.cognitoDomain = authParts.join('.');
      }
    }
    
    return this;
  },
  
  // Get Cognito authorization URL
  getCognitoAuthUrl: function(redirectUri = null) {
    if (!this.cognitoDomain || !this.cognitoClientId) {
      return null;
    }
    
    if (!redirectUri) {
      redirectUri = window.location.origin + '/post-auth.html';
    }
    
    const params = new URLSearchParams({
      client_id: this.cognitoClientId,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: redirectUri
    });
    
    return `https://${this.cognitoDomain}/oauth2/authorize?${params.toString()}`;
  },
  
  // Check if Cognito is properly configured
  isConfigured: function() {
    return this.cognitoDomain && 
           this.cognitoDomain !== 'YOUR_COGNITO_DOMAIN.auth.us-east-1.amazoncognito.com' &&
           this.cognitoClientId && 
           this.cognitoClientId !== 'YOUR_CLIENT_ID';
  }
};

// Auto-detect configuration on load
window.OidcConfig.autoDetect();