import { describe, it, expect } from 'vitest';
import { handler as authorize } from '../src/authorize.mjs';

const baseEvent = () => ({
  rawPath: '/authorize', rawQueryString: '',
  requestContext: { http: { method: 'GET' } }
});

describe('authorize', () => {
  it('renders login form when missing username', async () => {
    const e = { ...baseEvent(), rawQueryString: 'client_id=x&redirect_uri=https://example.com/cb&response_type=code&scope=openid&state=st&nonce=n&code_challenge=abc&code_challenge_method=S256' };
    const r = await authorize(e);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
  });
});