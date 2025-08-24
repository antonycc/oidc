package com.antonycc.oidc;

import software.amazon.awscdk.AssetHashType;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Expiration;
import software.amazon.awscdk.Fn;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudfront.OriginProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.SSLMethod;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.HttpOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOAIProps;
import software.amazon.awscdk.services.dynamodb.Attribute;
import software.amazon.awscdk.services.dynamodb.AttributeType;
import software.amazon.awscdk.services.dynamodb.BillingMode;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.FunctionUrlOptions;
import software.amazon.awscdk.services.lambda.InvokeMode;
import software.amazon.awscdk.services.lambda.Permission;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.lambda.Tracing;
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
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.xray.CfnGroup;
import software.constructs.Construct;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class OidcProviderStack extends Stack {
    private final String baseUrl;
    private final BucketDeployment wellKnownDeployment;
    private final Distribution distribution;

    public OidcProviderStack(final Construct scope, final String id, final OidcProviderStackProps props) {
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

        this.baseUrl = "https://" + domainName;

        // TLS certificate from existing ACM (must be in us-east-1 for CloudFront)
        var cert = Certificate.fromCertificateArn(this, "WebCert", props.certificateArn);

        // Central logs bucket for access logs and CloudFront logs (7-day retention via lifecycle)
        Bucket logsBucket = Bucket.Builder.create(this, "LogsBucket")
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .enforceSsl(true)
                .autoDeleteObjects(true)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // Buckets
        Bucket webBucket = Bucket.Builder.create(this, "WebBucket")
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL).enforceSsl(true)
                .autoDeleteObjects(true).removalPolicy(RemovalPolicy.DESTROY)
                .serverAccessLogsBucket(logsBucket).serverAccessLogsPrefix("s3/web/")
                .build();
        var webOriginIdentity =
                OriginAccessIdentity.Builder.create(this, "WebOriginAccessIdentity")
                        .comment(
                                "Identity created for access to the website origin bucket via the CloudFront distribution")
                        .build();
        webBucket.grantRead(webOriginIdentity);
        //var webOrigin = S3BucketOrigin.withOriginAccessControl(webBucket, S3BucketOriginWithOACProps.builder().build());
        var webOrigin = S3BucketOrigin.withOriginAccessIdentity(
                webBucket,
                S3BucketOriginWithOAIProps.builder().originAccessIdentity(webOriginIdentity).build());
        BehaviorOptions webOriginBehaviorOptions = BehaviorOptions.builder()
                .origin(webOrigin)
                //.cachePolicy(CachePolicy.CACHING_OPTIMIZED)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .compress(true)
                .build();

        Bucket wellKnownBucket = Bucket.Builder.create(this, "WellKnownBucket")
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL).enforceSsl(true)
                .autoDeleteObjects(true).removalPolicy(RemovalPolicy.DESTROY)
                .serverAccessLogsBucket(logsBucket).serverAccessLogsPrefix("s3/well-known/")
                .build();
        var wellKnownOriginIdentity =
                OriginAccessIdentity.Builder.create(this, "WellKnownOriginAccessIdentity")
                        .comment(
                                "Identity created for access to the Well Known origin bucket via the CloudFront distribution")
                        .build();
        wellKnownBucket.grantRead(wellKnownOriginIdentity);
        //var wkOrigin = S3BucketOrigin.withOriginAccessControl(wellKnownBucket, S3BucketOriginWithOACProps.builder().build());
        var wellKnownOrigin = S3BucketOrigin.withOriginAccessIdentity(
                wellKnownBucket,
                S3BucketOriginWithOAIProps.builder().originAccessIdentity(wellKnownOriginIdentity).build());
        CachePolicy shortTtl = CachePolicy.Builder.create(this, "ShortTTL")
                .defaultTtl(Duration.seconds(60)).minTtl(Duration.seconds(0)).maxTtl(Duration.minutes(5))
                .enableAcceptEncodingBrotli(true).enableAcceptEncodingGzip(true).build();
        BehaviorOptions wellKnownOriginBehaviorOptions = BehaviorOptions.builder()
                .origin(wellKnownOrigin)
                .cachePolicy(shortTtl)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .build();
        additionalOriginsBehaviourMappings.put("/.well-known/*", wellKnownOriginBehaviorOptions);
        additionalOriginsBehaviourMappings.put("/jwks.json", wellKnownOriginBehaviorOptions);

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

        // Lambda functions
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
                .tracing(Tracing.ACTIVE)
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
                .tracing(Tracing.ACTIVE)
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
                .tracing(Tracing.ACTIVE)
                .environment(Map.of("ISSUER", "https://" + domainName))
                .logGroup(userinfoLogGroup)
                .build();

        // Function URLs
        FunctionUrl authUrl = authorize.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(FunctionUrlAuthType.NONE)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        FunctionUrl tokenUrl = token.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(FunctionUrlAuthType.NONE)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
        FunctionUrl userUrl = userinfo.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(FunctionUrlAuthType.NONE)
                .invokeMode(InvokeMode.BUFFERED)
                .build());

        // Add /authorize, /token, /userinfo behaviors pointing to FunctionUrl origins under same domain
        var authorizeLambdaUrlOrigin = HttpOrigin.Builder
                .create(this.getLambdaUrlHostToken(authUrl))
                .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
                .build();
        BehaviorOptions authorizeBehaviorOptions = BehaviorOptions.builder()
                .origin(authorizeLambdaUrlOrigin)
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .cachePolicy(CachePolicy.CACHING_DISABLED)
                .originRequestPolicy(OriginRequestPolicy.ALL_VIEWER)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .build();

        var tokenLambdaUrlOrigin = HttpOrigin.Builder
                .create(this.getLambdaUrlHostToken(tokenUrl))
                .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
                .build();
        BehaviorOptions tokenBehaviorOptions = BehaviorOptions.builder()
                .origin(tokenLambdaUrlOrigin)
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .cachePolicy(CachePolicy.CACHING_DISABLED)
                .originRequestPolicy(OriginRequestPolicy.ALL_VIEWER)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .build();

        var userinfoLambdaUrlOrigin = HttpOrigin.Builder
                .create(this.getLambdaUrlHostToken(userUrl))
                .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
                .build();
        BehaviorOptions userinfoBehaviorOptions = BehaviorOptions.builder()
                .origin(userinfoLambdaUrlOrigin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .cachePolicy(CachePolicy.CACHING_DISABLED)
                .originRequestPolicy(OriginRequestPolicy.ALL_VIEWER)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .build();

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
                .enableLogging(true)
                .logBucket(logsBucket)
                .logFilePrefix("cloudfront/")
                .enableIpv6(true)
                .sslSupportMethod(SSLMethod.SNI)
                .build();

        this.distribution = dist;

        // CloudTrail - capture management events and deliver to S3 and CloudWatch Logs
        LogGroup trailLogGroup = LogGroup.Builder.create(this, "CloudTrailLogGroup")
                .logGroupName("/aws/cloudtrail/oidc-trail")
                .retention(RetentionDays.ONE_WEEK)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        Trail trail = Trail.Builder.create(this, "AuditTrail")
                .bucket(logsBucket)
                .cloudWatchLogGroup(trailLogGroup)
                .build();

        // X-Ray Group for Lambda traces (manual linkage/insights)
        CfnGroup xrayGroup = CfnGroup.Builder.create(this, "XRayGroup")
                .groupName("oidc-provider")
                .filterExpression("service(\"lambda\")")
                .insightsConfiguration(CfnGroup.InsightsConfigurationProperty.builder()
                        .insightsEnabled(true)
                        .build())
                .build();

        // Grant CloudFront access to the origin lambdas
        Permission invokeFunctionUrlPermission =
                Permission.builder()
                        .principal(new ServicePrincipal("cloudfront.amazonaws.com"))
                        .action("lambda:InvokeFunctionUrl")
                        .functionUrlAuthType(FunctionUrlAuthType.NONE)
                        .sourceArn(dist.getDistributionArn())
                        .build();
        authorize.addPermission("AuthLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        token.addPermission("TokenLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
        userinfo.addPermission("UserInfoLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);

        // Deploy the web website files to the web website bucket and invalidate distribution
        var webDocRootSource = Source.asset("web", AssetOptions.builder()
                .assetHashType(AssetHashType.SOURCE)
                .build());
        LogGroup webBucketDeploymentLogGroup = LogGroup.Builder.create(this, "WebBucketDeploymentLogGroup")
                        .logGroupName("/deployment/web-bucket-deployment")
                        .retention(RetentionDays.ONE_WEEK)
                        .removalPolicy(RemovalPolicy.DESTROY)
                        .build();
        var webDeployment = BucketDeployment.Builder.create(this, "DocRootToWebOriginDeployment")
                        .sources(List.of(webDocRootSource))
                        .destinationBucket(webBucket)
                        .distribution(dist)
                        .distributionPaths(List.of("/*"))
                        .retainOnDelete(false)
                        .logGroup(webBucketDeploymentLogGroup)
                        .expires(Expiration.after(Duration.minutes(5)))
                        .prune(true)
                        .build();

        // Deploy the well known website files to the web website bucket and invalidate distribution
        var wellKnownRootSource = Source.asset("well-known", AssetOptions.builder()
                .assetHashType(AssetHashType.SOURCE)
                .build());
        LogGroup wellKnownBucketDeploymentLogGroup = LogGroup.Builder.create(this, "WellKnownBucketDeploymentLogGroup")
                .logGroupName("/deployment/well-known-bucket-deployment")
                .retention(RetentionDays.ONE_WEEK)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        this.wellKnownDeployment = BucketDeployment.Builder.create(this, "DocRootToWellKnownOriginDeployment")
                .sources(List.of(wellKnownRootSource))
                .destinationBucket(wellKnownBucket)
                .distribution(dist)
                .distributionPaths(List.of("/*"))
                .retainOnDelete(false)
                .logGroup(wellKnownBucketDeploymentLogGroup)
                .expires(Expiration.after(Duration.minutes(5)))
                .prune(true)
                .build();

        // A record
        new ARecord(this, "AliasRecord",
                ARecordProps.builder()
                        .recordName(recordName)
                        .zone(zone)
                        .target(RecordTarget.fromAlias(new CloudFrontTarget(dist)))
                        .build());

        // Outputs
        new CfnOutput(this, "BaseUrl", CfnOutputProps.builder().value("https://" + domainName).build());
        new CfnOutput(this, "WebBucketName", CfnOutputProps.builder().value(webBucket.getBucketName()).build());
        new CfnOutput(this, "WellKnownBucketName", CfnOutputProps.builder().value(wellKnownBucket.getBucketName()).build());
        new CfnOutput(this, "DistributionId", CfnOutputProps.builder().value(dist.getDistributionId()).build());
    }

    private String getLambdaUrlHostToken(FunctionUrl functionUrl) {
        return Fn.select(2, Fn.split("/", functionUrl.getUrl()));
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public BucketDeployment getWellKnownDeployment() {
        return wellKnownDeployment;
    }

    public Distribution getDistribution() {
        return distribution;
    }
}