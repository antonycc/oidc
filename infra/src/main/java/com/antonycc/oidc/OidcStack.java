package com.antonycc.oidc;

import software.amazon.awscdk.*;
import software.constructs.Construct;
import software.amazon.awscdk.services.route53.*;
import software.amazon.awscdk.services.route53.targets.CloudFrontTarget;
import software.amazon.awscdk.services.certificatemanager.*;
import software.amazon.awscdk.services.s3.*;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.*;
import software.amazon.awscdk.services.cloudfront.origins.*;
import software.amazon.awscdk.services.dynamodb.*;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.*;
import software.amazon.awscdk.services.lambda.Runtime;
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
    Code nodeCode = Code.fromAsset("../app/oidc-provider");

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
    FunctionUrl authUrl    = authorize.addFunctionUrl(FunctionUrlOptions.builder().authType(FunctionUrlAuthType.AWS_IAM).build());
    FunctionUrl tokenUrl   = token.addFunctionUrl(FunctionUrlOptions.builder().authType(FunctionUrlAuthType.AWS_IAM).build());
    FunctionUrl userUrl    = userinfo.addFunctionUrl(FunctionUrlOptions.builder().authType(FunctionUrlAuthType.AWS_IAM).build());

    // Add /authorize, /token, /userinfo behaviors pointing to FunctionUrl origins under same domain
    dist.addBehavior("/authorize", FunctionUrlOrigin.withOriginAccessControl(authUrl),
        BehaviorOptions.builder()
            .origin(FunctionUrlOrigin.withOriginAccessControl(authUrl))
            .cachePolicy(CachePolicy.CACHING_DISABLED).build());
    dist.addBehavior("/token", FunctionUrlOrigin.withOriginAccessControl(tokenUrl),
        BehaviorOptions.builder()
            .origin(FunctionUrlOrigin.withOriginAccessControl(tokenUrl))
            .cachePolicy(CachePolicy.CACHING_DISABLED).build());
    dist.addBehavior("/userinfo", FunctionUrlOrigin.withOriginAccessControl(userUrl),
        BehaviorOptions.builder()
            .origin(FunctionUrlOrigin.withOriginAccessControl(userUrl))
            .cachePolicy(CachePolicy.CACHING_DISABLED).build());

    // /.well-known and /jwks.json from S3
    CachePolicy shortTtl = CachePolicy.Builder.create(this, "ShortTTL")
        .defaultTtl(Duration.seconds(60)).minTtl(Duration.seconds(0)).maxTtl(Duration.minutes(5))
        .enableAcceptEncodingBrotli(true).enableAcceptEncodingGzip(true).build();
    dist.addBehavior("/.well-known/*", wkOrigin, 
        BehaviorOptions.builder().origin(wkOrigin).cachePolicy(shortTtl).build());
    dist.addBehavior("/jwks.json", wkOrigin,
        BehaviorOptions.builder().origin(wkOrigin).cachePolicy(shortTtl).build());

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
        .attributeMapping(Map.of(
            "email", "email",
            "given_name", "name"))
        .build();

    // Outputs
    new CfnOutput(this, "BaseUrl", CfnOutputProps.builder().value("https://" + props.subdomain + "." + props.hostedZoneName).build());
    new CfnOutput(this, "CognitoAuthDomain", CfnOutputProps.builder().value(domain.getDomainName()).build());
    new CfnOutput(this, "UserPoolId", CfnOutputProps.builder().value(pool.getUserPoolId()).build());
    new CfnOutput(this, "UserPoolClientId", CfnOutputProps.builder().value(client.getUserPoolClientId()).build());
  }
}