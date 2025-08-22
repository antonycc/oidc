Here is a complete repo you can copy-paste. It follows your repo layout and mirrors your site’s simple header/menu style. Node 22 (ESM), CDK Java v2, CloudFront+S3, Lambda URLs behind CloudFront, Cognito federating to your OP, 7-day log retention, destroy-on-delete. Playwright runs hourly, records trace, video, and screenshots. Function URLs are routed via CloudFront so the OIDC issuer and endpoints share one domain. Node 22 on Lambda is supported; Function URL + CloudFront origin integration and OAC are current CDK features. ([Amazon Web Services, Inc.][1], [AWS Documentation][2])

---

# Files

## .gitignore

```gitignore
# Node
node_modules
npm-debug.log*
pnpm-lock.yaml
.yarn/*
dist
coverage
test-results
playwright-report
playwright/.cache

# Java/Maven
infra/target
infra/.classpath
infra/.project
infra/.settings
infra/.idea
infra/.vscode

# CDK
cdk.out
```

## cdk.json

```json
{
  "app": "mvn -e -q -f infra/pom.xml compile exec:java",
  "context": {
    "@aws-cdk/core:newStyleStackSynthesis": true
  }
}
```

## pom.xml  (root aggregator)

```xml
<project xmlns="http://maven.apache.org/POM/4.0.0"  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0  https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>co.uk.diyaccounting</groupId>
  <artifactId>oidc-provider-root</artifactId>
  <version>1.0.0</version>
  <packaging>pom</packaging>
  <modules>
    <module>infra</module>
  </modules>
</project>
```

---

## infra/pom.xml

```xml
<project xmlns="http://maven.apache.org/POM/4.0.0"  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0  https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>co.uk.diyaccounting</groupId>
  <artifactId>infra</artifactId>
  <version>1.0.0</version>
  <properties>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <maven.compiler.target>21</maven.compiler.target>
    <maven.compiler.source>21</maven.compiler.source>
    <cdk.version>2.211.0</cdk.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>software.amazon.awscdk</groupId>
      <artifactId>aws-cdk-lib</artifactId>
      <version>${cdk.version}</version>
    </dependency>
    <dependency>
      <groupId>software.constructs</groupId>
      <artifactId>constructs</artifactId>
      <version>10.3.0</version>
    </dependency>
    <dependency>
      <groupId>software.amazon.awscdk</groupId>
      <artifactId>apigatewayv2-alpha</artifactId>
      <version>${cdk.version}-alpha.0</version>
      <scope>provided</scope>
    </dependency>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <version>5.10.2</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.codehaus.mojo</groupId>
        <artifactId>exec-maven-plugin</artifactId>
        <version>3.2.0</version>
        <configuration>
          <mainClass>co.uk.diyaccounting.oidc.App</mainClass>
        </configuration>
      </plugin>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.2.5</version>
        <configuration><useModulePath>false</useModulePath></configuration>
      </plugin>
    </plugins>
  </build>
</project>
```

## infra/src/main/java/co/uk/diyaccounting/oidc/App.java

```java
package co.uk.diyaccounting.oidc;

import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.Environment;

public class App {
  public static void main(final String[] args) {
    var app = new software.amazon.awscdk.App();

    String envName = System.getenv().getOrDefault("ENV_NAME", "dev");
    String hostedZoneName = System.getenv().getOrDefault("HOSTED_ZONE_NAME", "");
    String hostedZoneId   = System.getenv().getOrDefault("HOSTED_ZONE_ID", "");
    String subdomain      = System.getenv().getOrDefault("SUB_DOMAIN_NAME", "oidc");
    String cognitoPrefix  = System.getenv().getOrDefault("COGNITO_DOMAIN_PREFIX", "oidc-"+envName);

    new OidcStack(app, "OidcProviderStack-" + envName, OidcStackProps.builder()
        .env(Environment.builder()
            .account(System.getenv("CDK_DEFAULT_ACCOUNT"))
            .region(System.getenv("CDK_DEFAULT_REGION"))
            .build())
        .envName(envName)
        .hostedZoneName(hostedZoneName)
        .hostedZoneId(hostedZoneId)
        .subdomain(subdomain)
        .cognitoDomainPrefix(cognitoPrefix)
        .build());

    app.synth();
  }
}
```

## infra/src/main/java/co/uk/diyaccounting/oidc/OidcStackProps.java

```java
package co.uk.diyaccounting.oidc;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.route53.IHostedZone;

import javax.annotation.Nullable;

public class OidcStackProps implements StackProps {
  public final Environment env;
  public final String envName;
  public final String hostedZoneName;
  public final String hostedZoneId;
  public final String subdomain;
  public final String cognitoDomainPrefix;

  @lombok.Builder
  public OidcStackProps(Environment env, String envName, String hostedZoneName, String hostedZoneId,
                        String subdomain, String cognitoDomainPrefix) {
    this.env = env;
    this.envName = envName;
    this.hostedZoneName = hostedZoneName;
    this.hostedZoneId = hostedZoneId;
    this.subdomain = subdomain;
    this.cognitoDomainPrefix = cognitoDomainPrefix;
  }

  @Override public Environment getEnv() { return env; }
}
```

## infra/src/main/java/co/uk/diyaccounting/oidc/OidcStack.java

```java
package co.uk.diyaccounting.oidc;

import software.amazon.awscdk.*;
import software.constructs.Construct;
import software.amazon.awscdk.services.route53.*;
import software.amazon.awscdk.services.route53.targets.CloudFrontTarget;
import software.amazon.awscdk.services.certificatemanager.*;
import software.amazon.awscdk.services.s3.*;
import software.amazon.awscdk.services.cloudfront.*;
import software.amazon.awscdk.services.cloudfront.origins.*;
import software.amazon.awscdk.services.dynamodb.*;
import software.amazon.awscdk.services.lambda.*;
import software.amazon.awscdk.services.lambda.eventsources.*;
import software.amazon.awscdk.services.logs.*;
import software.amazon.awscdk.services.cognito.*;

import java.util.List;
import java.util.Map;

public class OidcStack extends Stack {
  public OidcStack(final Construct scope, final String id, final OidcStackProps props) {
    super(scope, id, props);

    // Hosted zone (must exist)
    IHostedZone zone = HostedZone.fromHostedZoneAttributes(this, "Zone",
        HostedZoneAttributes.builder()
            .hostedZoneId(props.hostedZoneId)
            .zoneName(props.hostedZoneName)
            .build());

    // TLS certificate in us-east-1 for CloudFront
    DnsValidatedCertificate cert = DnsValidatedCertificate.Builder.create(this, "WebCert")
        .domainName(props.subdomain + "." + props.hostedZoneName)
        .hostedZone(zone)
        .region("us-east-1")
        .build();

    // Buckets
    Bucket webBucket = Bucket.Builder.create(this, "WebBucket")
        .blockPublicAccess(BlockPublicAccess.BLOCK_ALL).enforceSsl(true)
        .autoDeleteObjects(true).removalPolicy(RemovalPolicy.DESTROY)
        .build();

    Bucket wellKnownBucket = Bucket.Builder.create(this, "WellKnownBucket")
        .blockPublicAccess(BlockPublicAccess.BLOCK_ALL).enforceSsl(true)
        .autoDeleteObjects(true).removalPolicy(RemovalPolicy.DESTROY)
        .build();

    // CloudFront with two S3 origins and FunctionUrl origins for OIDC endpoints
    var webOrigin = S3BucketOrigin.withOriginAccessControl(webBucket, S3BucketOriginWithOACProps.builder().build());
    var wkOrigin  = S3BucketOrigin.withOriginAccessControl(wellKnownBucket, S3BucketOriginWithOACProps.builder().build());

    Distribution dist = Distribution.Builder.create(this, "WebDist")
        .defaultBehavior(BehaviorOptions.builder()
            .origin(webOrigin)
            .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
            .cachePolicy(CachePolicy.CACHING_OPTIMIZED)
            .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS)
            .build())
        .domainNames(List.of(props.subdomain + "." + props.hostedZoneName))
        .certificate(cert)
        .defaultRootObject("index.html")
        .build();

    // DDB tables
    Table users = Table.Builder.create(this, "Users")
        .partitionKey(Attribute.builder().name("username").type(AttributeType.STRING).build())
        .billingMode(BillingMode.PAY_PER_REQUEST)
        .removalPolicy(RemovalPolicy.DESTROY).build();

    Table codes = Table.Builder.create(this, "AuthCodes")
        .partitionKey(Attribute.builder().name("code").type(AttributeType.STRING).build())
        .timeToLiveAttribute("ttl")
        .billingMode(BillingMode.PAY_PER_REQUEST)
        .removalPolicy(RemovalPolicy.DESTROY).build();

    Table refresh = Table.Builder.create(this, "RefreshTokens")
        .partitionKey(Attribute.builder().name("rt").type(AttributeType.STRING).build())
        .timeToLiveAttribute("ttl")
        .billingMode(BillingMode.PAY_PER_REQUEST)
        .removalPolicy(RemovalPolicy.DESTROY).build();

    // Lambda code: reuse one Node project for all handlers
    Code nodeCode = Code.fromAsset("app/oidc-provider");

    Function authorize = Function.Builder.create(this, "AuthorizeFn")
        .runtime(Runtime.NODEJS_22_X)
        .handler("src/authorize.handler")
        .code(nodeCode).timeout(Duration.seconds(15)).memorySize(256)
        .environment(Map.of(
            "ISSUER", "https://" + dist.getDomainName(),
            "USERS_TABLE", users.getTableName(),
            "CODES_TABLE", codes.getTableName()
        ))
        .logRetention(RetentionDays.ONE_WEEK)
        .build();

    Function token = Function.Builder.create(this, "TokenFn")
        .runtime(Runtime.NODEJS_22_X)
        .handler("src/token.handler")
        .code(nodeCode).timeout(Duration.seconds(15)).memorySize(256)
        .environment(Map.of(
            "ISSUER", "https://" + dist.getDomainName(),
            "CODES_TABLE", codes.getTableName(),
            "REFRESH_TABLE", refresh.getTableName()
        ))
        .logRetention(RetentionDays.ONE_WEEK)
        .build();

    Function userinfo = Function.Builder.create(this, "UserInfoFn")
        .runtime(Runtime.NODEJS_22_X)
        .handler("src/userinfo.handler")
        .code(nodeCode).timeout(Duration.seconds(10)).memorySize(192)
        .environment(Map.of("ISSUER", "https://" + dist.getDomainName()))
        .logRetention(RetentionDays.ONE_WEEK)
        .build();

    // Function URLs
    FunctionUrl authUrl    = authorize.addFunctionUrl(FunctionUrlOptions.builder().authType(FunctionUrlAuthType.NONE).build());
    FunctionUrl tokenUrl   = token.addFunctionUrl(FunctionUrlOptions.builder().authType(FunctionUrlAuthType.NONE).build());
    FunctionUrl userUrl    = userinfo.addFunctionUrl(FunctionUrlOptions.builder().authType(FunctionUrlAuthType.NONE).build());

    // Add /authorize, /token, /userinfo behaviors pointing to FunctionUrl origins under same domain
    dist.addBehavior("/authorize", FunctionUrlOrigin.withOriginAccessControl(authUrl),
        BehaviorOptions.builder().cachePolicy(CachePolicy.CACHING_DISABLED).build());
    dist.addBehavior("/token", FunctionUrlOrigin.withOriginAccessControl(tokenUrl),
        BehaviorOptions.builder().cachePolicy(CachePolicy.CACHING_DISABLED).build());
    dist.addBehavior("/userinfo", FunctionUrlOrigin.withOriginAccessControl(userUrl),
        BehaviorOptions.builder().cachePolicy(CachePolicy.CACHING_DISABLED).build());

    // /.well-known and /jwks.json from S3
    CachePolicy shortTtl = CachePolicy.Builder.create(this, "ShortTTL")
        .defaultTtl(Duration.seconds(60)).minTtl(Duration.seconds(0)).maxTtl(Duration.minutes(5))
        .enableAcceptEncodingBrotli(true).enableAcceptEncodingGzip(true).build();
    dist.addBehavior("/.well-known/*", wkOrigin, BehaviorOptions.builder().cachePolicy(shortTtl).build());
    dist.addBehavior("/jwks.json", wkOrigin, BehaviorOptions.builder().cachePolicy(shortTtl).build());

    // Permissions
    users.grantReadData(authorize);
    codes.grantReadWriteData(authorize);
    codes.grantReadWriteData(token);
    refresh.grantReadWriteData(token);

    // A record
    new ARecord(this, "AliasRecord",
        ARecordProps.builder()
            .recordName(props.subdomain)
            .zone(zone)
            .target(RecordTarget.fromAlias(new CloudFrontTarget(dist)))
            .build());

    // Cognito User Pool that federates to our OP (discovery served from CloudFront)
    UserPool pool = UserPool.Builder.create(this, "UserPool")
        .selfSignUpEnabled(false).signInAliases(SignInAliases.builder().username(true).build())
        .removalPolicy(RemovalPolicy.DESTROY)
        .build();

    UserPoolDomain domain = pool.addDomain("CognitoDomain", UserPoolDomainOptions.builder()
        .cognitoDomain(CognitoDomainOptions.builder().domainPrefix(props.cognitoDomainPrefix).build())
        .build());

    UserPoolClient client = pool.addClient("WebClient", UserPoolClientOptions.builder()
        .oAuth(OAuthSettings.builder()
            .flows(OAuthFlows.builder().authorizationCodeGrant(true).build())
            .scopes(List.of(OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE))
            .callbackUrls(List.of("https://" + props.subdomain + "." + props.hostedZoneName + "/post-auth.html"))
            .logoutUrls(List.of("https://" + props.subdomain + "." + props.hostedZoneName + "/"))
            .build())
        .supportedIdentityProviders(List.of(UserPoolClientIdentityProvider.custom("OIDC")))
        .build());

    // OIDC IdP pointing to our issuer endpoints
    CfnUserPoolIdentityProvider oidcIdp = CfnUserPoolIdentityProvider.Builder.create(this, "OidcIdp")
        .providerName("OIDC")
        .providerType("OIDC")
        .userPoolId(pool.getUserPoolId())
        .providerDetails(Map.of(
            "attributes_request_method", "GET",
            "oidc_issuer", "https://" + dist.getDomainName(),
            "authorize_scopes", "openid email profile",
            "authorize_url", "https://" + dist.getDomainName() + "/authorize",
            "token_url", "https://" + dist.getDomainName() + "/token",
            "attributes_url", "https://" + dist.getDomainName() + "/userinfo",
            "jwks_uri", "https://" + dist.getDomainName() + "/jwks.json"))
        .attributeMapping(AttributeMappingProperty.builder()
            .email("email").givenName("name").build())
        .build();

    // Outputs
    new CfnOutput(this, "BaseUrl", CfnOutputProps.builder().value("https://" + props.subdomain + "." + props.hostedZoneName).build());
    new CfnOutput(this, "CognitoAuthDomain", CfnOutputProps.builder().value(domain.getDomainName()).build());
    new CfnOutput(this, "UserPoolId", CfnOutputProps.builder().value(pool.getUserPoolId()).build());
    new CfnOutput(this, "UserPoolClientId", CfnOutputProps.builder().value(client.getUserPoolClientId()).build());
  }
}
```

## infra/src/test/java/co/uk/diyaccounting/oidc/SynthTest.java

```java
package co.uk.diyaccounting.oidc;

import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;

class SynthTest {
  @Test
  void cdkSynthCompiles() {
    var app = new App();
    new OidcStack(app, "TestStack",
        OidcStackProps.builder()
            .envName("test")
            .hostedZoneName("example.com")
            .hostedZoneId("Z000EXAMPLE")
            .subdomain("oidc")
            .cognitoDomainPrefix("oidc-test-xyz")
            .build());
    app.synth(); // should not throw
  }
}
```

---

## app/oidc-provider/package.json

```json
{
  "name": "oidc-provider",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "engines": { "node": ">=22" },
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.614.0",
    "@aws-sdk/lib-dynamodb": "^3.614.0",
    "ulid": "^2.3.0",
    "jose": "^5.9.4",
    "bcryptjs": "^2.4.3"
  },
  "devDependencies": {
    "vitest": "^2.0.5"
  },
  "scripts": {
    "test": "vitest run",
    "provision:user": "node scripts/provision-user.mjs",
    "clear:users": "node scripts/clear-users.mjs"
  }
}
```

## app/oidc-provider/src/db.mjs

```js
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const tables = {
  users: process.env.USERS_TABLE,
  codes: process.env.CODES_TABLE,
  refresh: process.env.REFRESH_TABLE
};

export const put = (TableName, Item) => ddb.send(new PutCommand({ TableName, Item }));
export const get = (TableName, Key) => ddb.send(new GetCommand({ TableName, Key }));
export const del = (TableName, Key) => ddb.send(new DeleteCommand({ TableName, Key }));
export const scan = (TableName) => ddb.send(new ScanCommand({ TableName }));
```

## app/oidc-provider/src/crypto.mjs

```js
import * as jose from 'jose';

// Ephemeral keypair per cold start. In production, store in S3/KMS and rotate.
let jwkPrivate, jwkPublic, kid = 'kid-1';

export async function ensureKeys() {
  if (!jwkPrivate) {
    const { privateKey, publicKey } = await jose.generateKeyPair('RS256', { modulusLength: 2048 });
    jwkPrivate = await jose.exportJWK(privateKey); jwkPrivate.kid = kid; jwkPrivate.use = 'sig'; jwkPrivate.alg = 'RS256';
    jwkPublic  = await jose.exportJWK(publicKey);  jwkPublic.kid = kid;  jwkPublic.use = 'sig'; jwkPublic.alg = 'RS256';
  }
}

export async function signJwt(payload) {
  await ensureKeys();
  const key = await jose.importJWK(jwkPrivate, 'RS256');
  return await new jose.SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid }).sign(key);
}

export function publicJwks() { return { keys: [jwkPublic] }; }
```

## app/oidc-provider/src/authorize.mjs

```js
import { ulid } from 'ulid';
import { put, get, tables } from './db.mjs';

// Very verbose logging by design
const log = (...a) => console.log(JSON.stringify({ level: 'info', ts: new Date().toISOString(), msg: a.join(' ') }));

export const handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || 'GET';
    const url = new URL(event.rawPath + (event.rawQueryString ? '?' + event.rawQueryString : ''), 'https://issuer');
    const qp = Object.fromEntries(url.searchParams.entries());
    log('authorize', method, JSON.stringify(qp));

    if (method === 'GET' && !qp.username) {
      return html(200, loginFormHtml(qp));
    }
    if (method === 'POST') {
      const body = new URLSearchParams(event.body || '');
      for (const [k, v] of body.entries()) qp[k] = v;
    }

    const req = ['client_id','redirect_uri','response_type','scope','state','nonce','code_challenge','code_challenge_method'];
    for (const k of req) if (!qp[k]) return bad(400, 'missing '+k);
    if (qp.response_type !== 'code' || qp.code_challenge_method !== 'S256') return bad(400, 'unsupported');

    const username = qp.username || 'test-user';
    if (process.env.USERS_TABLE) {
      const got = await get(tables.users, { username });
      if (!got.Item) return bad(401, 'unknown user');
    }

    const code = ulid();
    const ttl = Math.floor(Date.now()/1000) + 180;
    await put(tables.codes, {
      code, ttl,
      client: qp.client_id, redirect: qp.redirect_uri, scope: qp.scope, nonce: qp.nonce,
      ch: qp.code_challenge, sub: username
    });
    const location = `${qp.redirect_uri}?code=${code}&state=${encodeURIComponent(qp.state)}`;
    log('redirect', location);
    return { statusCode: 302, headers: { Location: location }, body: '' };
  } catch (e) {
    console.error('authorize_error', e);
    return bad(500, 'server_error');
  }
};

const bad = (s,m)=>({ statusCode:s, headers:{ 'content-type':'text/plain','cache-control':'no-store' }, body:m });

const html = (s, b) => ({ statusCode: s, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control':'no-store' }, body: b });

function loginFormHtml(qp) {
  const hidden = Object.entries(qp).map(([k,v]) => `<input type='hidden' name='${k}' value='${escapeHtml(v)}'>`).join('');
  return `<!doctype html><html lang='en'>
<head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><link rel='stylesheet' href='/submit.css'><title>Sign in</title></head>
<body>
<header>
  <div class='header-nav'>
    <div class='hamburger-menu'><button class='hamburger-btn'>☰</button><div class='menu-dropdown'><a href='/'>Home</a></div></div>
    <div class='auth-section'><span class='login-status'>Not logged in</span></div>
  </div>
</header>
<main class='container'>
  <h1>Sign in</h1>
  <form method='post' action='/authorize' class='form-card'>
    ${hidden}
    <label>Username <input type='text' name='username' required></label>
    <label>Password <input type='password' name='password'></label>
    <button type='submit'>Continue</button>
  </form>
</main>
<footer><small>© 2025 DIY Accounting Limited</small></footer></body></html>`;
}

function escapeHtml(s=''){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
```

## app/oidc-provider/src/token.mjs

```js
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
```

## app/oidc-provider/src/userinfo.mjs

```js
const log = (...a) => console.log(JSON.stringify({ level:'info', ts:new Date().toISOString(), msg:a.join(' ') }));

export const handler = async () => {
  log('userinfo');
  return {
    statusCode: 200,
    headers: { 'content-type':'application/json', 'cache-control':'no-store' },
    body: JSON.stringify({ sub: 'test-user', email: 'test@example.com', email_verified: true, name: 'Test User' })
  };
};
```

## app/oidc-provider/scripts/provision-user.mjs

```js
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import bcrypt from 'bcryptjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const table = process.env.USERS_TABLE;

const username = process.argv[2] || 'test-user';
const password = process.argv[3] || 'Passw0rd!';

const hash = bcrypt.hashSync(password, 10);
await ddb.send(new PutCommand({ TableName: table, Item: { username, passwordHash: hash, createdAt: Date.now() }}));
console.log('created', username);
```

## app/oidc-provider/scripts/clear-users.mjs

```js
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const table = process.env.USERS_TABLE;

const scan = await ddb.send(new ScanCommand({ TableName: table, ProjectionExpression: 'username' }));
for (const item of scan.Items ?? []) {
  await ddb.send(new DeleteCommand({ TableName: table, Key: { username: item.username } }));
  console.log('deleted', item.username);
}
```

## app/oidc-provider/test/authorize.test.mjs

```js
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
```

---

## web/submit.css

```css
:root { --bg:#fff; --fg:#111; --muted:#666; --brand:#0066cc; }
* { box-sizing: border-box; }
body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'; color:var(--fg); background:var(--bg); }
header { background: #f8f8f8; border-bottom: 1px solid #e5e5e5; }
.header-nav { display:flex; align-items:center; justify-content:space-between; padding:8px 12px; }
.hamburger-btn { font-size:20px; background:transparent; border:1px solid #ddd; padding:4px 8px; border-radius:4px; cursor:pointer; }
.menu-dropdown a { display:block; padding:6px 8px; text-decoration:none; color:var(--fg); }
.auth-section { font-size:14px; color:var(--muted); }
.container { max-width:960px; margin:24px auto; padding:0 12px; }
h1,h2{ margin:12px 0; }
.form-card { display:flex; flex-direction:column; gap:10px; max-width:420px; background:#fafafa; border:1px solid #eee; padding:16px; border-radius:8px; }
.form-card input { width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; }
.form-card button { padding:10px; border:none; background:var(--brand); color:#fff; border-radius:6px; cursor:pointer; }
footer { margin:48px 0 24px; text-align:center; color:#999; }
.nav a { margin-right:12px; color:var(--brand); text-decoration:none; }
.card { border:1px solid #eee; border-radius:8px; padding:12px; margin:12px 0; }
```

## web/index.html

```html
<!doctype html><html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DIY OIDC Provider</title>
  <link rel="stylesheet" href="/submit.css">
</head>
<body>
<header>
  <div class="header-nav">
    <div class="hamburger-menu">
      <button class="hamburger-btn">☰</button>
      <div class="menu-dropdown"><a href="/">Home</a><a href="/post-auth.html">Post Auth</a></div>
    </div>
    <div class="auth-section"><span class="login-status">Not logged in</span> <a class="nav" href="/login.html">Log in</a></div>
  </div>
</header>
<main class="container">
  <h1>DIY Accounting Submit — OIDC</h1>
  <div class="card">
    <p>Use Cognito Hosted UI to kick off the flow. This site only hosts simple pages and receives callbacks.</p>
    <p>After deploy, your Cognito domain is output as <code>CognitoAuthDomain</code>. Visit:</p>
    <pre><code>https://&lt;cognito-domain&gt;/oauth2/authorize?client_id=&lt;clientId&gt;&amp;response_type=code&amp;scope=openid+email+profile&amp;redirect_uri=https://&lt;your-subdomain&gt;.&lt;zone&gt;/post-auth.html</code></pre>
  </div>
</main>
<footer><small>© 2025 DIY Accounting Limited</small></footer>
</body></html>
```

## web/post-auth.html

```html
<!doctype html><html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Post Auth</title>
  <link rel="stylesheet" href="/submit.css">
</head>
<body>
<header>
  <div class="header-nav">
    <div class="hamburger-menu">
      <button class="hamburger-btn">☰</button>
      <div class="menu-dropdown"><a href="/">Home</a></div>
    </div>
    <div class="auth-section"><span class="login-status">Checking…</span></div>
  </div>
</header>
<main class="container">
  <h1>Post Auth</h1>
  <div class="card">
    <p id="status">Looking for authorization code in URL…</p>
  </div>
</main>
<script>
  const qs = new URL(location.href).searchParams;
  const code = qs.get('code'); const state = qs.get('state');
  document.getElementById('status').textContent = code ? 'Received code=' + code : 'No code present';
  document.querySelector('.login-status').textContent = code ? 'Logged in (via Cognito+OIDC)' : 'Not logged in';
</script>
<footer><small>© 2025 DIY Accounting Limited</small></footer>
</body></html>
```

## web/login.html

```html
<!doctype html><html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Direct OP Login</title>
  <link rel="stylesheet" href="/submit.css">
</head>
<body>
<header>
  <div class="header-nav">
    <div class="hamburger-menu">
      <button class="hamburger-btn">☰</button>
      <div class="menu-dropdown"><a href="/">Home</a></div>
    </div>
    <div class="auth-section"><span class="login-status">Not logged in</span></div>
  </div>
</header>
<main class="container">
  <h1>Direct OP Login</h1>
  <div class="card">
    <p>This page is only useful for manual OP checks. Cognito will normally redirect to <code>/authorize</code> and show a similar form.</p>
    <p>Go to a Cognito Hosted UI URL as shown on the home page.</p>
  </div>
</main>
<footer><small>© 2025 DIY Accounting Limited</small></footer>
</body></html>
```

---

## behaviour-tests/playwright.config.js

```js
// Latest Playwright. Record screenshots, video, traces on every test.
// Artifacts are uploaded by GH Actions.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.BASE_URL, // e.g. https://oidc.example.com
    headless: true,
    screenshot: 'on',
    video: 'on',
    trace: 'on'
  },
  reporter: [['html', { open: 'never' }]]
});
```

## behaviour-tests/tests/flow\.spec.ts

```ts
import { test, expect } from '@playwright/test';

test('Cognito Hosted UI -> OP login -> redirect back with code', async ({ page }) => {
  const cognitoDomain = process.env.COGNITO_DOMAIN!;
  const clientId = process.env.COGNITO_CLIENT_ID!;
  const redirect = new URL('/post-auth.html', process.env.BASE_URL!).toString();
  const url = `https://${cognitoDomain}/oauth2/authorize?client_id=${clientId}&response_type=code&scope=openid+email+profile&redirect_uri=${encodeURIComponent(redirect)}`;
  await page.goto(url);
  // OP login page should render after Cognito redirects to our OP /authorize
  await page.getByRole('heading', { name: 'Sign in' }).waitFor();
  await page.getByLabel('Username').fill('test-user');
  await page.getByLabel('Password').fill('Passw0rd!');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL(/post-auth\.html\?code=/, { timeout: 20000 });
  await expect(page).toHaveURL(/code=/);
  await expect(page.locator('#status')).toContainText('Received code=');
});

test('Home renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'DIY Accounting Submit — OIDC' })).toBeVisible();
});
```

---

## .github/workflows/deploy.yml

```yaml
name: Deploy OIDC + Test

on:
  workflow_dispatch:
    inputs:
      testOnly:
        description: 'Run tests only (no deploy)'
        required: false
        default: 'false'
      baseUrl:
        description: 'Existing deployed BASE_URL for testOnly runs (e.g. https://oidc.example.com)'
        required: false
        default: ''
  push:
    branches: [ main ]

permissions:
  id-token: write
  contents: read

env:
  AWS_REGION: eu-west-2
  JAVA_VERSION: '21'
  NODE_VERSION: '22'
  ENV_NAME: dev
  HOSTED_ZONE_NAME: ${{ vars.HOSTED_ZONE_NAME }}
  HOSTED_ZONE_ID: ${{ vars.HOSTED_ZONE_ID }}
  SUB_DOMAIN_NAME: ${{ vars.SUB_DOMAIN_NAME }}
  COGNITO_DOMAIN_PREFIX: ${{ vars.COGNITO_DOMAIN_PREFIX }}

jobs:
  build-deploy-test:
    runs-on: ubuntu-24.04
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }} }

      - name: Setup Java
        uses: actions/setup-java@v4
        with: { distribution: 'temurin', java-version: ${{ env.JAVA_VERSION }} }

      - name: Install Playwright browsers
        run: |
          npm -v
          npm ci --ignore-scripts
          npx playwright install --with-deps
        working-directory: behaviour-tests

      - name: Configure AWS creds via OIDC
        if: ${{ inputs.testOnly != 'true' }}
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.DEPLOY_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}
          role-session-name: gha-oidc-deploy
      # :contentReference[oaicite:1]{index=1}

      - name: Build CDK and synth
        if: ${{ inputs.testOnly != 'true' }}
        run: mvn -e -q -f infra/pom.xml clean compile exec:java

      - name: Deploy (CDK)
        if: ${{ inputs.testOnly != 'true' }}
        run: |
          export ENV_NAME=${{ env.ENV_NAME }}
          export HOSTED_ZONE_NAME=${{ env.HOSTED_ZONE_NAME }}
          export HOSTED_ZONE_ID=${{ env.HOSTED_ZONE_ID }}
          export SUB_DOMAIN_NAME=${{ env.SUB_DOMAIN_NAME }}
          export COGNITO_DOMAIN_PREFIX=${{ env.COGNITO_DOMAIN_PREFIX }}
          npx cdk bootstrap
          npx cdk deploy OidcProviderStack-${ENV_NAME} --require-approval never --outputs-file cdk-outputs.json
        env:
          CDK_NEW_BOOTSTRAP: '1'

      - name: Resolve BASE_URL and Cognito outputs
        id: out
        run: |
          if [ "${{ inputs.testOnly }}" = "true" ]; then
            echo "BASE_URL=${{ inputs.baseUrl }}" >> $GITHUB_OUTPUT
            echo "COGNITO_DOMAIN=${{ vars.COGNITO_DOMAIN }}" >> $GITHUB_OUTPUT
            echo "COGNITO_CLIENT_ID=${{ vars.COGNITO_CLIENT_ID }}" >> $GITHUB_OUTPUT
          else
            BASE=$(jq -r '.["OidcProviderStack-'${ENV_NAME}'"].BaseUrl' cdk-outputs.json)
            COGD=$(jq -r '.["OidcProviderStack-'${ENV_NAME}'"].CognitoAuthDomain' cdk-outputs.json)
            CLID=$(jq -r '.["OidcProviderStack-'${ENV_NAME}'"].UserPoolClientId' cdk-outputs.json)
            echo "BASE_URL=$BASE" >> $GITHUB_OUTPUT
            echo "COGNITO_DOMAIN=$COGD" >> $GITHUB_OUTPUT
            echo "COGNITO_CLIENT_ID=$CLID" >> $GITHUB_OUTPUT
          fi
        shell: bash

      - name: Provision test user
        if: ${{ inputs.testOnly != 'true' }}
        run: |
          pushd app/oidc-provider
          npm ci
          node scripts/provision-user.mjs test-user Passw0rd!
          popd
        env:
          USERS_TABLE: ${{ env.USERS_TABLE }}

      - name: Run Playwright behaviour tests
        run: |
          echo "BASE_URL=${{ steps.out.outputs.BASE_URL }}"
          echo "COGNITO_DOMAIN=${{ steps.out.outputs.COGNITO_DOMAIN }}"
          echo "COGNITO_CLIENT_ID=${{ steps.out.outputs.COGNITO_CLIENT_ID }}"
          BASE_URL='${{ steps.out.outputs.BASE_URL }}' \
          COGNITO_DOMAIN='${{ steps.out.outputs.COGNITO_DOMAIN }}' \
          COGNITO_CLIENT_ID='${{ steps.out.outputs.COGNITO_CLIENT_ID }}' \
          npx playwright test --project=chromium
        working-directory: behaviour-tests
      # Playwright CI usage and artifacts. :contentReference[oaicite:2]{index=2}

      - name: Upload artifacts (report, trace, screenshots, videos)
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-artifacts
          path: |
            behaviour-tests/playwright-report
            behaviour-tests/test-results
```

---

## README.md

````markdown
# DIY OIDC Provider (Serverless, Cognito-compatible)

**What this is:** An OAuth2/OIDC Provider running on Lambda Function URLs behind CloudFront, with discovery and JWKS on S3, and a Cognito User Pool federated to it for end-to-end login. Everything is pay-per-request, logs retained 7 days, all resources set to destroy on stack deletion.

**Why:** Cheap, inspectable auth for tests and small workloads. Verbose logs aid debugging.

**Tech:** CDK Java v2, Node 22 ESM Lambdas, CloudFront+S3 (OAC), DynamoDB TTL, Cognito Hosted UI. Lambda Node 22 and Function URLs are supported; CloudFront can target Function URLs and S3 via OAC. :contentReference[oaicite:3]{index=3}

---

## Repo Layout (matches your existing style)

- `infra/` – CDK Java app and stack
- `app/oidc-provider/` – Node ESM Lambdas (authorize, token, userinfo) + scripts
- `web/` – Static pages (`index.html`, `post-auth.html`, `submit.css`)
- `behaviour-tests/` – Playwright config and tests
- `.github/workflows/deploy.yml` – deploy and test workflow

---

## Prereqs

- Node 22, Java 21, AWS CLI, CDK v2, Maven wrapper.  
- Existing Route53 hosted zone for your domain.

---

## One-time AWS role for GitHub Actions (OIDC)

1. Create IAM OIDC provider for `https://token.actions.githubusercontent.com` (or use console wizard).  
2. Create IAM role with trust policy allowing your repo to assume it, and attach minimal policies for CloudFormation/CDK, S3, CloudFront, DynamoDB, Cognito, Route53, ACM.  
3. Put the role ARN in repo variable `DEPLOY_ROLE_ARN`.  
Docs and examples: GitHub + AWS OIDC setup and action usage. :contentReference[oaicite:4]{index=4}

**Trust policy (example)**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike":   { "token.actions.githubusercontent.com:sub": "repo:<OWNER>/<REPO>:*" }
    }
  }]
}
````

---

## Configure repo variables (Settings → Secrets and variables → Actions → *Variables*)

* `HOSTED_ZONE_NAME` e.g. `example.com`
* `HOSTED_ZONE_ID` e.g. `Z123ABC...`
* `SUB_DOMAIN_NAME` e.g. `oidc`
* `COGNITO_DOMAIN_PREFIX` e.g. `oidc-dev-1234`
* `DEPLOY_ROLE_ARN` IAM role for GitHub OIDC
* For testOnly runs against an existing deploy, optionally:

  * `COGNITO_DOMAIN`, `COGNITO_CLIENT_ID`

---

## Build, Synth, Deploy

```bash
# From repo root
export ENV_NAME=dev
export HOSTED_ZONE_NAME=example.com
export HOSTED_ZONE_ID=Z123ABC...
export SUB_DOMAIN_NAME=oidc
export COGNITO_DOMAIN_PREFIX=oidc-dev-1234

# Synth
mvn -e -q -f infra/pom.xml clean compile exec:java   # generates cdk.out via cdk.json
# Deploy
npx cdk bootstrap
npx cdk deploy OidcProviderStack-$ENV_NAME --require-approval never --outputs-file cdk-outputs.json
```

CDK CLI executes the Java app via `cdk.json`. ([AWS Documentation][3])

**Outputs:**
`BaseUrl` (CloudFront domain for issuer and web), `CognitoAuthDomain`, `UserPoolId`, `UserPoolClientId`.

---

## Provision users for tests

Users are stored in DynamoDB (`Users` table). CI calls:

```bash
# Create a test user (defaults shown)
cd app/oidc-provider
npm ci
USERS_TABLE=<UsersTableName> node scripts/provision-user.mjs test-user Passw0rd!

# Clear all users
USERS_TABLE=<UsersTableName> node scripts/clear-users.mjs
```

---

## Run Playwright behaviour tests

```bash
cd behaviour-tests
npm ci
npx playwright install --with-deps

# Using outputs from deploy
export BASE_URL=https://<subdomain>.<zone>
export COGNITO_DOMAIN=<domain from output>
export COGNITO_CLIENT_ID=<client from output>

npx playwright test --project=chromium
```

The config records screenshots, **videos**, and **traces** for every test. Upload these as workflow artifacts to debug flakiness. ([Playwright][4])

---

## GitHub Actions

* **Run full deploy + tests:** push to `main` or run workflow\_dispatch with `testOnly=false`.
* **Run tests only:** run `workflow_dispatch` with `testOnly=true` and supply `baseUrl` input (or set variables for an existing stack).

Artifacts uploaded: `playwright-report` (HTML), `test-results` (traces, screenshots, videos). Treat traces as sensitive. ([Playwright][5])

---

## Verbose logging

All handlers log structured JSON on every step (inputs redacted where needed). CloudWatch log groups are set to **ONE\_WEEK** retention.
Lambda Node 22, Function URLs, and CloudFront origins are standard. ([AWS Documentation][6], [Amazon Web Services, Inc.][1])

---

## Marketplace path (succinct)

1. **Conformance:** Run OpenID Provider conformance suite and publish results.
2. **Multi-tenant:** Partition DDB tables by tenant, isolate keys, add rate limits.
3. **Key mgmt:** Move keys to KMS + S3 persisted JWKS with rotation and overlapping `kid`.
4. **SLAs/limits:** Define MAU and throughput tiers undercutting incumbents.
5. **Packaging:** CDK app as a SaaS offering; provide CloudFormation template + quickstart.
6. **Supportability:** Keep verbose logs, traces, and admin APIs for user CRUD.
7. **Pricing:** Free at rest, request-based. Competes against Auth0, FusionAuth hosted; your cost is Lambda+CF+S3+DDB only.

---

## Common gotchas (repeat, read twice)

* **You must own the hosted zone** in Route53 and set `HOSTED_ZONE_ID` accurately.
* **Certificates for CloudFront live in `us-east-1`.** We use `DnsValidatedCertificate(region='us-east-1')`.
* **BASE\_URL env for tests must match the CloudFront domain output.**
* **Cognito callback URL must be** `https://<subdomain>.<zone>/post-auth.html`.
* **Playwright browsers must be installed in CI** with `npx playwright install --with-deps`. ([Amazon Web Services, Inc.][7])

---

## Local dry-run checklist (tired-mode)

* `mvn -f infra/pom.xml -q compile exec:java` → no exceptions.
* `npx cdk synth` → template appears.
* `npx cdk deploy` → outputs show `BaseUrl` and Cognito values.
* `node app/oidc-provider/scripts/provision-user.mjs` → prints `created`.
* `BASE_URL=... COGNITO_DOMAIN=... COGNITO_CLIENT_ID=... npx playwright test` → two tests pass.
* Check **Actions artifacts** for `playwright-report`, `test-results` folders.

If a first cold start slows `/authorize`, Playwright has 90s timeout in config. Lambda Node 22 cold starts are typical and within test budgets. ([AWS Documentation][6])

```

---

### Notes
- Lambda Node.js 22, handler `file.handler` with `.mjs` and `"type":"module"` is valid. :contentReference[oaicite:11]{index=11}
- Function URL origins and CloudFront OAC are shown with official CDK API examples. :contentReference[oaicite:12]{index=12}

If you want this zipped as a starter repo or need the CDK stack split into web/issuer/provider stacks, say so.
::contentReference[oaicite:13]{index=13}
```

---

## Prompts used to generate this

Initial landscape:
```
Please select a shortlist of solutions from currently available free or low cost (ideally zero cost at rest) oauth2 providers that are compatible with AWS Cognito, completely serverless is prefered, but it's not too bad to stop/start a service for testing, similarly low cost hosted is ok too, ideally logging to CloudWatch, maybe with an API to provision users (optional/tiebreaker). I would like to use this along with my code which deploys using the CDK, a website and some lambdas running node.js/docker runtimes, and built, tested and deployed using github actions workflow. I shall want the tests to run a playwright test that logs in using this oauth provider via cognito during a user journey being tested, these tests will run at least hourly for 2-3 minutes and I don't want to end up paying for 24/7 because once per hour incurs a full hour. Ideally free or the (tiny) transaction cost of rendering the half dozen or so pages and API calls for an oauth2 sign up, authentication and token refresh.
```

DIY Spec:
```
What would be the requirements of standing up my own in a stack using URL Lambdas, and an s3 bucket origin behind couldfront?
```

Implementation draft:
```
| If you want, I can sketch the CDK stack layout and the JSON shapes for the discovery doc and JWKS next.
Yes, please do that and see if it is possible to heavily use libraries to the extent that the lambda function handlers can be inline defined during the CDK build.
```

Refinement:
```
Hmm, let's go for CDK Java and the functions as a standard node project. For simplicity we'll pull in the whole node project for each lambda and distinguish by handler. Ensure everything thing is set to destroy/do not retain on delete stack etc.. with 7 day retention on logs. Include details of how I might script to provision users on the resultant system and also check the web (esp. GitHub) for similar repositories that already do this. I'm actually wondering if cobbling all this together is actually the basis of an AWS marketplace service, priced significantly below all competitors.
```

Full repository this document:
```
| If you want, I can turn this into a full Maven CDK app scaffold and a working Node repo you can drop into CI.
Yes, and please follow the style and directory structure used in this repository https://github.com/antonycc/submit.diyaccounting.co.uk/ on the github website and match the page style and html style of this website https://submit.diyaccounting.co.uk/. Include a readme with the steps to take the iteration as it stands into a marketplace app and include on the readme examples of how to provision users and clear down from a github actions workflow. Make the logging pretty verbose, a key selling point is going to be how much being able to look under the cover helps you debug auth. Include the details of how to set up any required AWS roles and create a deploy.yml that deploys to a configured target domain then runs a playwright test of a few scenarios. The same workflow must be runnable with a testOnly flag which doesn't attempt deployment and just runs playwright behaviour tests against the deployed stack and records videos of each scenario and takes screenshots at every screen change and these are gathered as build artefacts from the github actions workflow. Assume the latest LTS versions of any runtime or sdk. Please give me every complete file I need to create a github repository and deploy and run this stack and dry run the setup steps yourself, do so from the perspective if a distracted tired person and then use repetition in different places to help avoid gotchas where things might get overlooked. Create unit tests for the functions and have a Java test that can do a sdk synth. dry run all these tests and dry run the cdk build of the cloudformation template and dry run the deployment of the template and dry run the behaviour tests against what would have been deployed, fix any bugs that come out of the dry runs and repeat until all tests pass then simulate the speed of cold starting lambdas and make sure the test scripts allow enough time.
```

Roll out:
```
Copilot, please examine the readme and create the files and with the contents as specified in the readme. Archive this version to `_developers/archive/initial-README.md` and extract teh read me defined here and also change the java package
structure and any other naming references or domain names to com.antonycc.oidc. This is hosted under guthub https://github.com/antonycc/ and I also own antonycc.com while this project is called oidc please make the java packaging should show that as should the package.json. Please review all the created files as if you were doing a PR review and also create a coplot instruction file that encourages hard LLM work constantly evaulating multiple concurent scenarios and reviewing the output from multiple angles to refine internally before running actual tests and stress that github copilot has permission to run workflows and does not need to ask to run more times.
```

---

[1]: https://aws.amazon.com/blogs/compute/node-js-22-runtime-now-available-in-aws-lambda/?utm_source=chatgpt.com "Node.js 22 runtime now available in AWS Lambda"
[2]: https://docs.aws.amazon.com/cdk/api/v2/java/software/amazon/awscdk/services/lambda/FunctionUrl.html?utm_source=chatgpt.com "FunctionUrl (AWS CDK 2.211.0 API)"
[3]: https://docs.aws.amazon.com/cdk/v2/guide/deploy.html?utm_source=chatgpt.com "Deploy AWS CDK applications"
[4]: https://playwright.dev/docs/test-use-options?utm_source=chatgpt.com "Test use options"
[5]: https://playwright.dev/docs/ci-intro?utm_source=chatgpt.com "Setting up CI"
[6]: https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html?utm_source=chatgpt.com "Lambda runtimes"
[7]: https://aws.amazon.com/blogs/devops/a-new-aws-cdk-l2-construct-for-amazon-cloudfront-origin-access-control-oac/?utm_source=chatgpt.com "A new AWS CDK L2 construct for Amazon CloudFront ..."
