package com.antonycc.oidc;

import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.FunctionUrlOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOACProps;
import software.amazon.awscdk.services.cognito.CfnUserPoolIdentityProvider;
import software.amazon.awscdk.services.cognito.CognitoDomainOptions;
import software.amazon.awscdk.services.cognito.OAuthFlows;
import software.amazon.awscdk.services.cognito.OAuthScope;
import software.amazon.awscdk.services.cognito.OAuthSettings;
import software.amazon.awscdk.services.cognito.SignInAliases;
import software.amazon.awscdk.services.cognito.UserPool;
import software.amazon.awscdk.services.cognito.UserPoolClient;
import software.amazon.awscdk.services.cognito.UserPoolClientIdentityProvider;
import software.amazon.awscdk.services.cognito.UserPoolClientOptions;
import software.amazon.awscdk.services.cognito.UserPoolDomain;
import software.amazon.awscdk.services.cognito.UserPoolDomainOptions;
import software.amazon.awscdk.services.dynamodb.Attribute;
import software.amazon.awscdk.services.dynamodb.AttributeType;
import software.amazon.awscdk.services.dynamodb.BillingMode;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.FunctionUrlOptions;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.ARecordProps;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.route53.RecordTarget;
import software.amazon.awscdk.services.route53.targets.CloudFrontTarget;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.constructs.Construct;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class OidcStack extends Stack {
  public OidcStack(final Construct scope, final String id, final OidcStackProps props) {
    super(scope, id, props);

    var additionalOriginsBehaviourMappings = new HashMap<String, BehaviorOptions>();

    // Hosted zone (must exist)
    IHostedZone zone = HostedZone.fromHostedZoneAttributes(this, "Zone",
        HostedZoneAttributes.builder()
            .hostedZoneId(props.hostedZoneId)
            .zoneName(props.hostedZoneName)
            .build());
    String domainName = props.domainName;
    String recordName = props.hostedZoneName.equals(props.domainName) ? null :
        (props.domainName.endsWith("." + props.hostedZoneName)
            ? props.domainName.substring(0, props.domainName.length() - (props.hostedZoneName.length() + 1))
            : props.domainName);

    // TLS certificate from existing ACM (must be in us-east-1 for CloudFront)
    var cert = Certificate.fromCertificateArn(this, "WebCert", props.certificateArn);

    // Buckets
    Bucket webBucket = Bucket.Builder.create(this, "WebBucket")
        .blockPublicAccess(BlockPublicAccess.BLOCK_ALL).enforceSsl(true)
        .autoDeleteObjects(true).removalPolicy(RemovalPolicy.DESTROY)
        .build();
      var webOrigin = S3BucketOrigin.withOriginAccessControl(webBucket, S3BucketOriginWithOACProps.builder().build());
      BehaviorOptions webOriginBehaviorOptions = BehaviorOptions.builder()
              .origin(webOrigin)
              .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
              .cachePolicy(CachePolicy.CACHING_OPTIMIZED)
              .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS)
              .build();

    Bucket wellKnownBucket = Bucket.Builder.create(this, "WellKnownBucket")
        .blockPublicAccess(BlockPublicAccess.BLOCK_ALL).enforceSsl(true)
        .autoDeleteObjects(true).removalPolicy(RemovalPolicy.DESTROY)
        .build();
    var wkOrigin  = S3BucketOrigin.withOriginAccessControl(wellKnownBucket, S3BucketOriginWithOACProps.builder().build());
      CachePolicy shortTtl = CachePolicy.Builder.create(this, "ShortTTL")
              .defaultTtl(Duration.seconds(60)).minTtl(Duration.seconds(0)).maxTtl(Duration.minutes(5))
              .enableAcceptEncodingBrotli(true).enableAcceptEncodingGzip(true).build();
    BehaviorOptions wkOriginBehaviorOptions = BehaviorOptions.builder()
          .origin(wkOrigin)
          .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
          .cachePolicy(shortTtl)
          .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS)
          .build();
    additionalOriginsBehaviourMappings.put("/.well-known/*", wkOriginBehaviorOptions);
    additionalOriginsBehaviourMappings.put("/jwks.json", wkOriginBehaviorOptions);

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
    // When running from infra/, use ../app/oidc
    // When running from root, use app/oidc
    String assetPath = System.getProperty("user.dir").endsWith("infra") ? "../app/oidc" : "app/oidc";
    Code nodeCode = Code.fromAsset(assetPath);

    LogGroup authorizeLogGroup = LogGroup.Builder.create(this, "AuthorizeLogGroup")
        .logGroupName("/aws/lambda/" + "AuthorizeFn")
        .removalPolicy(RemovalPolicy.DESTROY)
        .retention(RetentionDays.ONE_WEEK)
        .build();
    Function authorize = Function.Builder.create(this, "AuthorizeFn")
        .runtime(Runtime.NODEJS_22_X)
        .handler("src/authorize.handler")
        .code(nodeCode).timeout(Duration.seconds(15)).memorySize(256)
        .environment(Map.of(
            "ISSUER", "https://" + domainName,
            "USERS_TABLE", users.getTableName(),
            "CODES_TABLE", codes.getTableName()
        ))
        .logGroup(authorizeLogGroup)
        .build();

    LogGroup tokenLogGroup = LogGroup.Builder.create(this, "TokenLogGroup")
              .logGroupName("/aws/lambda/" + "TokenFn")
              .removalPolicy(RemovalPolicy.DESTROY)
              .retention(RetentionDays.ONE_WEEK)
              .build();
    Function token = Function.Builder.create(this, "TokenFn")
        .runtime(Runtime.NODEJS_22_X)
        .handler("src/token.handler")
        .code(nodeCode).timeout(Duration.seconds(15)).memorySize(256)
        .environment(Map.of(
            "ISSUER", "https://" + domainName,
            "CODES_TABLE", codes.getTableName(),
            "REFRESH_TABLE", refresh.getTableName()
        ))
        .logGroup(tokenLogGroup)
        .build();

    LogGroup userinfoLogGroup = LogGroup.Builder.create(this, "UserInfoLogGroup")
              .logGroupName("/aws/lambda/" + "UserInfoFn")
              .removalPolicy(RemovalPolicy.DESTROY)
              .retention(RetentionDays.ONE_WEEK)
              .build();
    Function userinfo = Function.Builder.create(this, "UserInfoFn")
        .runtime(Runtime.NODEJS_22_X)
        .handler("src/userinfo.handler")
        .code(nodeCode).timeout(Duration.seconds(10)).memorySize(192)
        .environment(Map.of("ISSUER", "https://" + domainName))
        .logGroup(userinfoLogGroup)
        .build();

    // Function URLs
    FunctionUrl authUrl    = authorize.addFunctionUrl(FunctionUrlOptions.builder().authType(FunctionUrlAuthType.AWS_IAM).build());
    FunctionUrl tokenUrl   = token.addFunctionUrl(FunctionUrlOptions.builder().authType(FunctionUrlAuthType.AWS_IAM).build());
    FunctionUrl userUrl    = userinfo.addFunctionUrl(FunctionUrlOptions.builder().authType(FunctionUrlAuthType.AWS_IAM).build());

    // Add /authorize, /token, /userinfo behaviors pointing to FunctionUrl origins under same domain
    BehaviorOptions authorizeBehaviorOptions = BehaviorOptions.builder()
          .origin(FunctionUrlOrigin.withOriginAccessControl(authUrl))
          .cachePolicy(CachePolicy.CACHING_DISABLED).build();
    BehaviorOptions tokenBehaviorOptions = BehaviorOptions.builder()
          .origin(FunctionUrlOrigin.withOriginAccessControl(tokenUrl))
          .cachePolicy(CachePolicy.CACHING_DISABLED).build();
    BehaviorOptions userinfoBehaviorOptions = BehaviorOptions.builder()
          .origin(FunctionUrlOrigin.withOriginAccessControl(userUrl))
          .cachePolicy(CachePolicy.CACHING_DISABLED).build();
    additionalOriginsBehaviourMappings.put("/authorize", authorizeBehaviorOptions);
    additionalOriginsBehaviourMappings.put("/token", tokenBehaviorOptions);
    additionalOriginsBehaviourMappings.put("/userinfo", userinfoBehaviorOptions);

    // Permissions
    users.grantReadData(authorize);
    codes.grantReadWriteData(authorize);
    codes.grantReadWriteData(token);
    refresh.grantReadWriteData(token);


  // CloudFront with two S3 origins and FunctionUrl origins for OIDC endpoints
  Distribution dist = Distribution.Builder.create(this, "WebDist")
          .defaultBehavior(webOriginBehaviorOptions)
          .additionalBehaviors(additionalOriginsBehaviourMappings)
          .domainNames(List.of(domainName))
          .certificate(cert)
          .defaultRootObject("index.html")
          .build();

    // A record
    new ARecord(this, "AliasRecord",
        ARecordProps.builder()
            .recordName(recordName)
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
            .callbackUrls(List.of("https://" + domainName + "/post-auth.html"))
            .logoutUrls(List.of("https://" + domainName + "/"))
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

    // Ensure the UserPoolClient is created after the OIDC IdP exists
    client.getNode().addDependency(oidcIdp);

    // Outputs
    new CfnOutput(this, "BaseUrl", CfnOutputProps.builder().value("https://" + domainName).build());
    new CfnOutput(this, "CognitoAuthDomain", CfnOutputProps.builder().value(domain.getDomainName()).build());
    new CfnOutput(this, "UserPoolId", CfnOutputProps.builder().value(pool.getUserPoolId()).build());
    new CfnOutput(this, "UserPoolClientId", CfnOutputProps.builder().value(client.getUserPoolClientId()).build());
  }
}