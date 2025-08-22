const log = (...a) => console.log(JSON.stringify({ level:'info', ts:new Date().toISOString(), msg:a.join(' ') }));

export const handler = async () => {
  log('userinfo');
  return {
    statusCode: 200,
    headers: { 'content-type':'application/json', 'cache-control':'no-store' },
    body: JSON.stringify({ sub: 'test-user', email: 'test@antonycc.com', email_verified: true, name: 'Test User' })
  };
};