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
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.SSLMethod;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOAIProps;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.dynamodb.Attribute;
import software.amazon.awscdk.services.dynamodb.AttributeType;
import software.amazon.awscdk.services.dynamodb.BillingMode;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.Permission;
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

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class OidcProviderStack extends Stack {
  public final String baseUrl;
  public final Bucket logsBucket;
  public final LogGroup trailLogGroup;
  public final Trail auditTrail;
  public final CfnGroup xrayGroup;
  public final S3OriginBucket webOriginBucket;
  public final S3OriginBucket wellKnownOriginBucket;
  public final Bucket webBucket;
  public final OriginAccessIdentity webOriginAccessIdentity;
  public final Bucket wellKnownBucket;
  public final OriginAccessIdentity wellKnownOriginAccessIdentity;
  public final CachePolicy shortTtl;
  public final Table usersTable;
  public final Table authCodesTable;
  public final Table refreshTokensTable;
  public final OidcEndpointFunction authorizeEndpoint;
  public final OidcEndpointFunction tokenEndpoint;
  public final OidcEndpointFunction userinfoEndpoint;
  public final Distribution distribution;
  public final LogGroup bucketDeploymentLogGroup;
  public final BucketDeployment webDeployment;
  public final BucketDeployment wellKnownDeployment;
  public final ARecord aliasRecord;

  public OidcProviderStack(
      final Construct scope, final String id, final OidcProviderStackProps props) {
    super(scope, id, props);

    var additionalOriginsBehaviourMappings = new HashMap<String, BehaviorOptions>();
    
    // Generate predictable resource name prefix based on domain and environment
    String resourceNamePrefix = generateResourceNamePrefix(props.domainName, props.envName);
    String compressedResourceNamePrefix = generateCompressedResourceNamePrefix(props.domainName, props.envName);

    // Hosted zone (must exist)
    IHostedZone zone =
        HostedZone.fromHostedZoneAttributes(
            this,
            resourceNamePrefix + "-Zone",
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
    var cert = Certificate.fromCertificateArn(this, resourceNamePrefix + "-WebCert", props.certificateArn);

    // Log bucket for CloudFront and S3 access logs
    // TODO: Ship logs to cloudwatch logs
    // TODO: Move logsBucket to Observability Stack
    this.logsBucket =
        Bucket.Builder.create(this, resourceNamePrefix + "-LogsBucket")
            .bucketName(resourceNamePrefix + "-logs")
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
    // TODO: Move trailLogGroup to Observability Stack
    this.trailLogGroup =
        LogGroup.Builder.create(this, resourceNamePrefix + "-CloudTrailLogGroup")
            .logGroupName("/aws/cloudtrail/" + resourceNamePrefix)
            .retention(RetentionDays.ONE_WEEK)
            .removalPolicy(RemovalPolicy.DESTROY)
            .build();
    this.auditTrail =
        Trail.Builder.create(this, resourceNamePrefix + "-AuditTrail")
            .trailName(resourceNamePrefix + "-audit-trail")
            .bucket(this.logsBucket)
            .cloudWatchLogGroup(this.trailLogGroup)
            .build();

    // X-Ray Group for Lambda traces
    // TODO: Move xrayGroup to Observability Stack
    this.xrayGroup =
        CfnGroup.Builder.create(this, resourceNamePrefix + "-XRayGroup")
            .groupName(compressedResourceNamePrefix + "-lambda-traces")
            .filterExpression("service(\"lambda\")")
            .insightsConfiguration(
                CfnGroup.InsightsConfigurationProperty.builder().insightsEnabled(true).build())
            .build();

    // Buckets

    // Web origin bucket
    this.webOriginBucket = new S3OriginBucket(
        this,
        resourceNamePrefix + "-WebBucket",
        S3OriginBucketProps.builder()
            .bucketNameSuffix("web")
            .logsPrefix("s3/web/")
            .oaiComment("Identity created for access to the website origin bucket via the CloudFront"
                + " distribution")
            .logsBucket(this.logsBucket)
            .build());
    this.webBucket = this.webOriginBucket.bucket;
    this.webOriginAccessIdentity = this.webOriginBucket.originAccessIdentity;
    var webOrigin =
        S3BucketOrigin.withOriginAccessIdentity(
            this.webBucket,
            S3BucketOriginWithOAIProps.builder().originAccessIdentity(this.webOriginAccessIdentity).build());
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
    this.wellKnownOriginBucket = new S3OriginBucket(
        this,
        resourceNamePrefix + "-WellKnownBucket",
        S3OriginBucketProps.builder()
            .bucketNameSuffix("well-known")
            .logsPrefix("s3/well-known/")
            .oaiComment("Identity created for access to the Well Known origin bucket via the CloudFront"
                + " distribution")
            .logsBucket(this.logsBucket)
            .build());
    this.wellKnownBucket = this.wellKnownOriginBucket.bucket;
    this.wellKnownOriginAccessIdentity = this.wellKnownOriginBucket.originAccessIdentity;
    var wellKnownOrigin =
        S3BucketOrigin.withOriginAccessIdentity(
            this.wellKnownBucket,
            S3BucketOriginWithOAIProps.builder()
                .originAccessIdentity(this.wellKnownOriginAccessIdentity)
                .build());
    this.shortTtl =
        CachePolicy.Builder.create(this, resourceNamePrefix + "-ShortTTL")
            .cachePolicyName(resourceNamePrefix + "-short-ttl")
            .defaultTtl(Duration.seconds(60))
            .minTtl(Duration.seconds(0))
            .maxTtl(Duration.minutes(5))
            .enableAcceptEncodingBrotli(true)
            .enableAcceptEncodingGzip(true)
            .build();
    BehaviorOptions wellKnownOriginBehaviorOptions =
        BehaviorOptions.builder()
            .origin(wellKnownOrigin)
            .cachePolicy(this.shortTtl)
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
            .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
            .responseHeadersPolicy(
                ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
            .build();
    additionalOriginsBehaviourMappings.put("/.well-known/*", wellKnownOriginBehaviorOptions);

    // DDB tables
    this.usersTable =
        Table.Builder.create(this, resourceNamePrefix + "-Users")
            .tableName(resourceNamePrefix + "-users")
            .partitionKey(Attribute.builder().name("username").type(AttributeType.STRING).build())
            .billingMode(BillingMode.PAY_PER_REQUEST)
            .removalPolicy(RemovalPolicy.DESTROY)
            .build();

    this.authCodesTable =
        Table.Builder.create(this, resourceNamePrefix + "-AuthCodes")
            .tableName(resourceNamePrefix + "-auth-codes")
            .partitionKey(Attribute.builder().name("code").type(AttributeType.STRING).build())
            .timeToLiveAttribute("ttl")
            .billingMode(BillingMode.PAY_PER_REQUEST)
            .removalPolicy(RemovalPolicy.DESTROY)
            .build();

    this.refreshTokensTable =
        Table.Builder.create(this, resourceNamePrefix + "-RefreshTokens")
            .tableName(resourceNamePrefix + "-refresh-tokens")
            .partitionKey(Attribute.builder().name("rt").type(AttributeType.STRING).build())
            .timeToLiveAttribute("ttl")
            .billingMode(BillingMode.PAY_PER_REQUEST)
            .removalPolicy(RemovalPolicy.DESTROY)
            .build();

    // Lambda functions

    // Authorize endpoint via construct
    this.authorizeEndpoint = new OidcEndpointFunction(
        this,
        resourceNamePrefix + "-AuthorizeEndpoint",
        OidcEndpointFunctionProps.builder()
            .functionName(resourceNamePrefix + "-authorize")
            .dockerfilePath("infra/runtimes/authorize.Dockerfile")
            .cmd(List.of("app/functions/authorize.handler"))
            .pathPattern("/authorize")
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .extraEnv(Map.of(
                "USERS_TABLE", this.usersTable.getTableName(),
                "CODES_TABLE", this.authCodesTable.getTableName()
            ))
            .build());
    this.authorizeEndpoint.function.addEnvironment("ISSUER", "https://" + domainName);
    additionalOriginsBehaviourMappings.put("/authorize", this.authorizeEndpoint.behaviorOptions);
    this.usersTable.grantReadData(this.authorizeEndpoint.function);
    this.authCodesTable.grantReadWriteData(this.authorizeEndpoint.function);

    // Token endpoint via construct
    this.tokenEndpoint = new OidcEndpointFunction(
        this,
        resourceNamePrefix + "-TokenEndpoint",
        OidcEndpointFunctionProps.builder()
            .functionName(resourceNamePrefix + "-token")
            .dockerfilePath("infra/runtimes/token.Dockerfile")
            .cmd(List.of("app/functions/token.handler"))
            .pathPattern("/token")
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .extraEnv(Map.of(
                "USERS_TABLE", this.usersTable.getTableName(),
                "REFRESH_TABLE", this.refreshTokensTable.getTableName(),
                "CODES_TABLE", this.authCodesTable.getTableName()
            ))
            .build());
    this.tokenEndpoint.function.addEnvironment("ISSUER", "https://" + domainName);
    additionalOriginsBehaviourMappings.put("/token", this.tokenEndpoint.behaviorOptions);
    this.authCodesTable.grantReadWriteData(this.tokenEndpoint.function);
    this.refreshTokensTable.grantReadWriteData(this.tokenEndpoint.function);

    // UserInfo endpoint via construct
    this.userinfoEndpoint = new OidcEndpointFunction(
        this,
        resourceNamePrefix + "-UserInfoEndpoint",
        OidcEndpointFunctionProps.builder()
            .functionName(resourceNamePrefix + "-userinfo")
            .dockerfilePath("infra/runtimes/userinfo.Dockerfile")
            .cmd(List.of("app/functions/userinfo.handler"))
            .pathPattern("/userinfo")
            .allowedMethods(AllowedMethods.ALLOW_ALL)
            .extraEnv(Map.of(
                "USERS_TABLE", this.usersTable.getTableName()
            ))
            .build());
    this.userinfoEndpoint.function.addEnvironment("ISSUER", "https://" + domainName);
    additionalOriginsBehaviourMappings.put("/userinfo", this.userinfoEndpoint.behaviorOptions);
    this.usersTable.grantReadData(this.userinfoEndpoint.function);

    // CloudFront with two S3 origins and FunctionUrl origins for OIDC endpoints
    this.distribution =
        Distribution.Builder.create(this, resourceNamePrefix + "-WebDist")
            .defaultBehavior(webOriginBehaviorOptions)
            .additionalBehaviors(additionalOriginsBehaviourMappings)
            .domainNames(List.of(domainName))
            .certificate(cert)
            .defaultRootObject("index.html")
            .enableLogging(true)
            .logBucket(this.logsBucket)
            .logFilePrefix("cloudfront/")
            .enableIpv6(true)
            .sslSupportMethod(SSLMethod.SNI)
            .build();

    // Grant CloudFront access to the origin lambdas with compressed names
    Permission invokeFunctionUrlPermission =
        Permission.builder()
            .principal(new ServicePrincipal("cloudfront.amazonaws.com"))
            .action("lambda:InvokeFunctionUrl")
            .functionUrlAuthType(FunctionUrlAuthType.NONE)
            .sourceArn(this.distribution.getDistributionArn())
            .build();
    this.authorizeEndpoint.function.addPermission(compressedResourceNamePrefix + "-cf-auth", invokeFunctionUrlPermission);
    this.tokenEndpoint.function.addPermission(compressedResourceNamePrefix + "-cf-token", invokeFunctionUrlPermission);
    this.userinfoEndpoint.function.addPermission(compressedResourceNamePrefix + "-cf-userinfo", invokeFunctionUrlPermission);

    this.bucketDeploymentLogGroup =
        LogGroup.Builder.create(this, resourceNamePrefix + "-BucketDeploymentLogGroup")
            .logGroupName("/deployment/" + resourceNamePrefix + "-bucket-deployment")
            .retention(RetentionDays.ONE_WEEK)
            .removalPolicy(RemovalPolicy.DESTROY)
            .build();

    // Deploy the web website files to the web website bucket and invalidate distribution
    var webDocRootSource =
        Source.asset("web", AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
    this.webDeployment =
        BucketDeployment.Builder.create(this, resourceNamePrefix + "-DocRootToWebOriginDeployment")
            .sources(List.of(webDocRootSource))
            .destinationBucket(this.webBucket)
            .distribution(this.distribution)
            .distributionPaths(List.of("/*"))
            .retainOnDelete(false)
            .logGroup(this.bucketDeploymentLogGroup)
            .expires(Expiration.after(Duration.minutes(5)))
            .prune(true)
            .build();

    // Deploy the well known website files to the well-known bucket under /.well-known/ path
    var wellKnownRootSource =
        Source.asset(
            "well-known", AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
    this.wellKnownDeployment =
        BucketDeployment.Builder.create(this, resourceNamePrefix + "-DocRootToWellKnownOriginDeployment")
            .sources(List.of(wellKnownRootSource))
            .destinationBucket(this.wellKnownBucket)
            .destinationKeyPrefix(".well-known/")
            .distribution(this.distribution)
            .distributionPaths(List.of("/*"))
            .retainOnDelete(false)
            .logGroup(this.bucketDeploymentLogGroup)
            .expires(Expiration.after(Duration.minutes(5)))
            .prune(true)
            .build();

    // A record
    this.aliasRecord = new ARecord(
        this,
        resourceNamePrefix + "-AliasRecord",
        ARecordProps.builder()
            .recordName(recordName)
            .zone(zone)
            .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
            .build());

    // Outputs
    new CfnOutput(this, "BaseUrl", CfnOutputProps.builder().value("https://" + domainName).build());
    new CfnOutput(
        this, "WebBucketName", CfnOutputProps.builder().value(this.webBucket.getBucketName()).build());
    new CfnOutput(
        this,
        "WellKnownBucketName",
        CfnOutputProps.builder().value(this.wellKnownBucket.getBucketName()).build());
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

  /**
   * Generate a predictable resource name prefix based on domain name and environment.
   * Converts domain like "oidc.example.com" to "oidc-example-com" and adds environment.
   */
  private static String generateResourceNamePrefix(String domainName, String envName) {
    String dashedDomainName = domainName.replace('.', '-');
    return dashedDomainName + "-" + envName;
  }

    /**
     * Generate a shortened predictable resource name prefix based on domain and environment.
     * Steps:
     * 1. Replace dots with dashes.
     * 2. Split on dashes.
     * 3. Keep segment "oidc" intact; compress all other non-empty segments to their first letter.
     * 4. Append '-' + environment name (environment kept whole).
     *
     * Examples:
     *   domain=oidc.example.com, env=dev  -> oidc-e-c-dev
     *   domain=login.auth.service.example.com, env=prod -> l-a-s-e-c-prod
     *
     * @param domainName fully qualified domain name (e.g. "oidc.example.com")
     * @param envName environment name (e.g. "dev")
     * @return compressed resource name prefix
     */
    private static String generateCompressedResourceNamePrefix(String domainName, String envName) {
        if (domainName == null || domainName.isBlank()) {
            throw new IllegalArgumentException("domainName must be non-empty");
        }
        if (envName == null || envName.isBlank()) {
            throw new IllegalArgumentException("envName must be non-empty");
        }

        String dashed = domainName.replace('.', '-').toLowerCase();
        String[] parts = dashed.split("-+");
        StringBuilder sb = new StringBuilder();
        for (String part : parts) {
            if (part.isEmpty()) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append('-');
            }
            if ("oidc".equals(part)) {
                sb.append("oidc");
            } else {
                sb.append(part.charAt(0));
            }
        }
        sb.append('-').append(envName);
        return sb.toString();
    }
}
