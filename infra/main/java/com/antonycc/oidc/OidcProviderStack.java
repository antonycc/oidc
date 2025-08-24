package com.antonycc.oidc;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.dynamodb.Attribute;
import software.amazon.awscdk.services.dynamodb.AttributeType;
import software.amazon.awscdk.services.dynamodb.BillingMode;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.AssetImageCodeProps;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.FunctionUrlOptions;
import software.amazon.awscdk.services.lambda.InvokeMode;
import software.amazon.awscdk.services.lambda.Permission;
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
import software.amazon.awscdk.services.xray.CfnGroup;
import software.constructs.Construct;

public class OidcProviderStack extends Stack {
  private final String baseUrl;
  private final BucketDeployment wellKnownDeployment;
  private final Distribution distribution;

  public OidcProviderStack(
      final Construct scope, final String id, final OidcProviderStackProps props) {
    super(scope, id, props);

    var additionalOriginsBehaviourMappings = new HashMap<String, BehaviorOptions>();

    // Hosted zone (must exist)
    IHostedZone zone =
        HostedZone.fromHostedZoneAttributes(
            this,
            "Zone",
            HostedZoneAttributes.builder()
                .hostedZoneId(props.hostedZoneId)
                .zoneName(props.hostedZoneName)
                .build());
    String domainName = props.domainName;
    String recordName =
        props.hostedZoneName.equals(props.domainName)
            ? null
            : (props.domainName.endsWith("." + props.hostedZoneName)
                ? props.domainName.substring(
                    0, props.domainName.length() - (props.hostedZoneName.length() + 1))
                : props.domainName);

    this.baseUrl = "https://" + domainName;

    // TLS certificate from existing ACM (must be in us-east-1 for CloudFront)
    var cert = Certificate.fromCertificateArn(this, "WebCert", props.certificateArn);

    // Log bucket for CloudFront and S3 access logs
    // TODO: Ship logs to cloudwatch logs
    var logsBucket =
        Bucket.Builder.create(this, "LogsBucket")
            .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
            .enforceSsl(true)
            .autoDeleteObjects(true)
            .removalPolicy(RemovalPolicy.DESTROY)
            .lifecycleRules(
                List.of(
                    software.amazon.awscdk.services.s3.LifecycleRule.builder()
                        .expiration(Duration.days(7))
                        .enabled(true)
                        .build()))
            .build();

    // CloudTrail - capture management events and deliver to S3 and CloudWatch Logs
    LogGroup trailLogGroup =
        LogGroup.Builder.create(this, "CloudTrailLogGroup")
            .logGroupName("/aws/cloudtrail/oidc-trail")
            .retention(RetentionDays.ONE_WEEK)
            .removalPolicy(RemovalPolicy.DESTROY)
            .build();
    Trail trail =
        Trail.Builder.create(this, "AuditTrail")
            .bucket(logsBucket)
            .cloudWatchLogGroup(trailLogGroup)
            .build();

    // X-Ray Group for Lambda traces
    CfnGroup xrayGroup =
        CfnGroup.Builder.create(this, "XRayGroup")
            .groupName("oidc-provider")
            .filterExpression("service(\"lambda\")")
            .insightsConfiguration(
                CfnGroup.InsightsConfigurationProperty.builder().insightsEnabled(true).build())
            .build();

    // Buckets

    // Web origin bucket
    Bucket webBucket =
        Bucket.Builder.create(this, "WebBucket")
            .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
            .enforceSsl(true)
            .autoDeleteObjects(true)
            .removalPolicy(RemovalPolicy.DESTROY)
            .serverAccessLogsBucket(logsBucket)
            .serverAccessLogsPrefix("s3/web/")
            .build();
    var webOriginIdentity =
        OriginAccessIdentity.Builder.create(this, "WebOriginAccessIdentity")
            .comment(
                "Identity created for access to the website origin bucket via the CloudFront"
                    + " distribution")
            .build();
    webBucket.grantRead(webOriginIdentity);
    var webOrigin =
        S3BucketOrigin.withOriginAccessIdentity(
            webBucket,
            S3BucketOriginWithOAIProps.builder().originAccessIdentity(webOriginIdentity).build());
    BehaviorOptions webOriginBehaviorOptions =
        BehaviorOptions.builder()
            .origin(webOrigin)
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
            .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
            .responseHeadersPolicy(
                ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
            .compress(true)
            .build();

    // Well-known origin bucket
    Bucket wellKnownBucket =
        Bucket.Builder.create(this, "WellKnownBucket")
            .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
            .enforceSsl(true)
            .autoDeleteObjects(true)
            .removalPolicy(RemovalPolicy.DESTROY)
            .serverAccessLogsBucket(logsBucket)
            .serverAccessLogsPrefix("s3/well-known/")
            .build();
    var wellKnownOriginIdentity =
        OriginAccessIdentity.Builder.create(this, "WellKnownOriginAccessIdentity")
            .comment(
                "Identity created for access to the Well Known origin bucket via the CloudFront"
                    + " distribution")
            .build();
    wellKnownBucket.grantRead(wellKnownOriginIdentity);
    var wellKnownOrigin =
        S3BucketOrigin.withOriginAccessIdentity(
            wellKnownBucket,
            S3BucketOriginWithOAIProps.builder()
                .originAccessIdentity(wellKnownOriginIdentity)
                .build());
    CachePolicy shortTtl =
        CachePolicy.Builder.create(this, "ShortTTL")
            .defaultTtl(Duration.seconds(60))
            .minTtl(Duration.seconds(0))
            .maxTtl(Duration.minutes(5))
            .enableAcceptEncodingBrotli(true)
            .enableAcceptEncodingGzip(true)
            .build();
    BehaviorOptions wellKnownOriginBehaviorOptions =
        BehaviorOptions.builder()
            .origin(wellKnownOrigin)
            .cachePolicy(shortTtl)
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
            .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
            .responseHeadersPolicy(
                ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
            .build();
    additionalOriginsBehaviourMappings.put("/.well-known/*", wellKnownOriginBehaviorOptions);

    // DDB tables
    Table users =
        Table.Builder.create(this, "Users")
            .partitionKey(Attribute.builder().name("username").type(AttributeType.STRING).build())
            .billingMode(BillingMode.PAY_PER_REQUEST)
            .removalPolicy(RemovalPolicy.DESTROY)
            .build();

    Table codes =
        Table.Builder.create(this, "AuthCodes")
            .partitionKey(Attribute.builder().name("code").type(AttributeType.STRING).build())
            .timeToLiveAttribute("ttl")
            .billingMode(BillingMode.PAY_PER_REQUEST)
            .removalPolicy(RemovalPolicy.DESTROY)
            .build();

    Table refresh =
        Table.Builder.create(this, "RefreshTokens")
            .partitionKey(Attribute.builder().name("rt").type(AttributeType.STRING).build())
            .timeToLiveAttribute("ttl")
            .billingMode(BillingMode.PAY_PER_REQUEST)
            .removalPolicy(RemovalPolicy.DESTROY)
            .build();

    // Lambda functions

    // Authorize function
    var authorizeFunctionName = "AuthorizeFn";
    LogGroup authorizeLogGroup =
        LogGroup.Builder.create(this, "AuthorizeLogGroup")
            .logGroupName("/aws/lambda/" + "AuthorizeFn")
            .removalPolicy(RemovalPolicy.DESTROY)
            .retention(RetentionDays.ONE_WEEK)
            .build();
    var authorizeBuildArgs = Map.of("BUILDKIT_INLINE_CACHE", "1");
    var authorizeImageCodeProps =
        AssetImageCodeProps.builder()
            .file("infra/runtimes/authorize.Dockerfile")
            .cmd(List.of("app/functions/authorize.handler"))
            .buildArgs(authorizeBuildArgs)
            .build();
    var authorizeEnvironment =
        Map.of(
            "ISSUER",
            "https://" + domainName,
            "USERS_TABLE",
            users.getTableName(),
            "CODES_TABLE",
            codes.getTableName(),
            "AWS_XRAY_TRACING_NAME",
            authorizeFunctionName);
    var authorizeFunction =
        DockerImageFunction.Builder.create(this, authorizeFunctionName + "Lambda")
            .code(DockerImageCode.fromImageAsset(".", authorizeImageCodeProps))
            .memorySize(256)
            .environment(authorizeEnvironment)
            .functionName(authorizeFunctionName)
            .timeout(Duration.seconds(15))
            .tracing(Tracing.ACTIVE)
            .logGroup(authorizeLogGroup)
            .build();
    FunctionUrl authUrl =
        authorizeFunction.addFunctionUrl(
            FunctionUrlOptions.builder()
                .authType(FunctionUrlAuthType.NONE)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
    var authorizeLambdaUrlOrigin =
        HttpOrigin.Builder.create(this.getLambdaUrlHostToken(authUrl))
            .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
            .build();
    BehaviorOptions authorizeBehaviorOptions =
        BehaviorOptions.builder()
            .origin(authorizeLambdaUrlOrigin)
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .cachePolicy(CachePolicy.CACHING_DISABLED)
            .originRequestPolicy(OriginRequestPolicy.ALL_VIEWER)
            .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
            .build();
    additionalOriginsBehaviourMappings.put("/authorize", authorizeBehaviorOptions);
    users.grantReadData(authorizeFunction);
    codes.grantReadWriteData(authorizeFunction);

    // Token function
    var tokenFunctionName = "TokenFn";
    LogGroup tokenLogGroup =
        LogGroup.Builder.create(this, "TokenLogGroup")
            .logGroupName("/aws/lambda/" + "TokenFn")
            .removalPolicy(RemovalPolicy.DESTROY)
            .retention(RetentionDays.ONE_WEEK)
            .build();
    var tokenBuildArgs = Map.of("BUILDKIT_INLINE_CACHE", "1");
    var tokenImageCodeProps =
        AssetImageCodeProps.builder()
            .file("infra/runtimes/token.Dockerfile")
            .cmd(List.of("app/functions/token.handler"))
            .buildArgs(tokenBuildArgs)
            .build();
    var tokenEnvironment =
        Map.of(
            "ISSUER",
            "https://" + domainName,
            "USERS_TABLE",
            users.getTableName(),
            "REFRESH_TABLE",
            refresh.getTableName(),
            "AWS_XRAY_TRACING_NAME",
            tokenFunctionName);
    var tokenFunction =
        DockerImageFunction.Builder.create(this, tokenFunctionName + "Lambda")
            .code(DockerImageCode.fromImageAsset(".", tokenImageCodeProps))
            .memorySize(256)
            .environment(tokenEnvironment)
            .functionName(tokenFunctionName)
            .timeout(Duration.seconds(15))
            .tracing(Tracing.ACTIVE)
            .logGroup(tokenLogGroup)
            .build();
    FunctionUrl tokenUrl =
        tokenFunction.addFunctionUrl(
            FunctionUrlOptions.builder()
                .authType(FunctionUrlAuthType.NONE)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
    var tokenLambdaUrlOrigin =
        HttpOrigin.Builder.create(this.getLambdaUrlHostToken(tokenUrl))
            .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
            .build();
    BehaviorOptions tokenBehaviorOptions =
        BehaviorOptions.builder()
            .origin(tokenLambdaUrlOrigin)
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .cachePolicy(CachePolicy.CACHING_DISABLED)
            .originRequestPolicy(OriginRequestPolicy.ALL_VIEWER)
            .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
            .build();
    additionalOriginsBehaviourMappings.put("/token", tokenBehaviorOptions);
    codes.grantReadWriteData(tokenFunction);
    refresh.grantReadWriteData(tokenFunction);

    // UserInfo function
    var userinfoFunctionName = "UserInfoFn";
    LogGroup userinfoLogGroup =
        LogGroup.Builder.create(this, "UserInfoLogGroup")
            .logGroupName("/aws/lambda/" + "UserInfoFn")
            .removalPolicy(RemovalPolicy.DESTROY)
            .retention(RetentionDays.ONE_WEEK)
            .build();
    var userinfoBuildArgs = Map.of("BUILDKIT_INLINE_CACHE", "1");
    var userinfoImageCodeProps =
        AssetImageCodeProps.builder()
            .file("infra/runtimes/userinfo.Dockerfile")
            .cmd(List.of("app/functions/userinfo.handler"))
            .buildArgs(userinfoBuildArgs)
            .build();
    var userinfoEnvironment =
        Map.of("ISSUER", "https://" + domainName, "AWS_XRAY_TRACING_NAME", userinfoFunctionName);
    var userinfoFunction =
        DockerImageFunction.Builder.create(this, userinfoFunctionName + "Lambda")
            .code(DockerImageCode.fromImageAsset(".", userinfoImageCodeProps))
            .memorySize(256)
            .environment(userinfoEnvironment)
            .functionName(userinfoFunctionName)
            .timeout(Duration.seconds(15))
            .tracing(Tracing.ACTIVE)
            .logGroup(userinfoLogGroup)
            .build();
    FunctionUrl userUrl =
        userinfoFunction.addFunctionUrl(
            FunctionUrlOptions.builder()
                .authType(FunctionUrlAuthType.NONE)
                .invokeMode(InvokeMode.BUFFERED)
                .build());
    var userinfoLambdaUrlOrigin =
        HttpOrigin.Builder.create(this.getLambdaUrlHostToken(userUrl))
            .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
            .build();
    BehaviorOptions userinfoBehaviorOptions =
        BehaviorOptions.builder()
            .origin(userinfoLambdaUrlOrigin)
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            .cachePolicy(CachePolicy.CACHING_DISABLED)
            .originRequestPolicy(OriginRequestPolicy.ALL_VIEWER)
            .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
            .build();
    additionalOriginsBehaviourMappings.put("/userinfo", userinfoBehaviorOptions);

    // CloudFront with two S3 origins and FunctionUrl origins for OIDC endpoints
    this.distribution =
        Distribution.Builder.create(this, "WebDist")
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

    // Grant CloudFront access to the origin lambdas
    Permission invokeFunctionUrlPermission =
        Permission.builder()
            .principal(new ServicePrincipal("cloudfront.amazonaws.com"))
            .action("lambda:InvokeFunctionUrl")
            .functionUrlAuthType(FunctionUrlAuthType.NONE)
            .sourceArn(this.distribution.getDistributionArn())
            .build();
    authorizeFunction.addPermission("AuthLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
    tokenFunction.addPermission("TokenLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);
    userinfoFunction.addPermission(
        "UserInfoLambdaAllowCloudFrontInvoke", invokeFunctionUrlPermission);

    LogGroup bucketDeploymentLogGroup =
        LogGroup.Builder.create(this, "BucketDeploymentLogGroup")
            .logGroupName("/deployment/bucket-deployment")
            .retention(RetentionDays.ONE_WEEK)
            .removalPolicy(RemovalPolicy.DESTROY)
            .build();

    // Deploy the web website files to the web website bucket and invalidate distribution
    var webDocRootSource =
        Source.asset("web", AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
    var webDeployment =
        BucketDeployment.Builder.create(this, "DocRootToWebOriginDeployment")
            .sources(List.of(webDocRootSource))
            .destinationBucket(webBucket)
            .distribution(this.distribution)
            .distributionPaths(List.of("/*"))
            .retainOnDelete(false)
            .logGroup(bucketDeploymentLogGroup)
            .expires(Expiration.after(Duration.minutes(5)))
            .prune(true)
            .build();

    // Deploy the well known website files to the well-known bucket under /.well-known/ path
    var wellKnownRootSource =
        Source.asset(
            "well-known", AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
    this.wellKnownDeployment =
        BucketDeployment.Builder.create(this, "DocRootToWellKnownOriginDeployment")
            .sources(List.of(wellKnownRootSource))
            .destinationBucket(wellKnownBucket)
            .destinationKeyPrefix(".well-known/")
            .distribution(this.distribution)
            .distributionPaths(List.of("/*"))
            .retainOnDelete(false)
            .logGroup(bucketDeploymentLogGroup)
            .expires(Expiration.after(Duration.minutes(5)))
            .prune(true)
            .build();

    // A record
    new ARecord(
        this,
        "AliasRecord",
        ARecordProps.builder()
            .recordName(recordName)
            .zone(zone)
            .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
            .build());

    // Outputs
    new CfnOutput(this, "BaseUrl", CfnOutputProps.builder().value("https://" + domainName).build());
    new CfnOutput(
        this, "WebBucketName", CfnOutputProps.builder().value(webBucket.getBucketName()).build());
    new CfnOutput(
        this,
        "WellKnownBucketName",
        CfnOutputProps.builder().value(wellKnownBucket.getBucketName()).build());
    new CfnOutput(
        this,
        "DistributionId",
        CfnOutputProps.builder().value(this.distribution.getDistributionId()).build());
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
