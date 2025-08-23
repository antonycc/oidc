import crypto from 'node:crypto';
import { get, del, put, tables } from './db.mjs';
import { signJwt } from './crypto.mjs';
const log = (...a) => console.log(JSON.stringify({ level:'info', ts:new Date().toISOString(), msg:a.join(' ') }));

export const handler = async (event) => {
  try {
    if (event.requestContext.http.method !== 'POST')
      return json(405, { error: 'method_not_allowed' });

    const body = new URLSearchParams(event.body || '');
    const grant = body.get('grant_type');
    if (grant !== 'authorization_code') return json(400, { error: 'unsupported_grant_type' });

    const code = body.get('code');
    const verifier = body.get('code_verifier') || '';
    if (!code || !verifier) return json(400, { error: 'invalid_request' });

    const row = await get(tables.codes, { code });
    if (!row.Item) return json(400, { error: 'invalid_grant' });

    const expect = crypto.createHash('sha256').update(verifier).digest('base64url');
    if (expect !== row.Item.ch) return json(400, { error: 'invalid_grant' });

    await del(tables.codes, { code });

    const now = Math.floor(Date.now()/1000);
    const iss = process.env.ISSUER;
    const aud = row.Item.client;
    const sub = row.Item.sub;

    const id_token = await signJwt({ iss, sub, aud, iat: now, exp: now+300, nonce: row.Item.nonce });
    const access_token = await signJwt({ iss, sub, aud, iat: now, exp: now+300, scope: row.Item.scope });

    const rt = crypto.randomBytes(32).toString('base64url');
    await put(tables.refresh, { rt, sub, ttl: now + 86400 });

    log('token_issued', sub);
    return json(200, { id_token, access_token, token_type: 'Bearer', expires_in: 300, refresh_token: rt });
  } catch (e) {
    console.error('token_error', e);
    return json(500, { error: 'server_error' });
  }
};

const json = (s,obj)=>({ statusCode:s, headers:{ 'content-type':'application/json', 'cache-control':'no-store' }, body: JSON.stringify(obj) });