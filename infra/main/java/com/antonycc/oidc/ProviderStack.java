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
import software.amazon.awscdk.customresources.AwsCustomResource;
import software.amazon.awscdk.customresources.AwsCustomResourcePolicy;
import software.amazon.awscdk.customresources.AwsSdkCall;
import software.amazon.awscdk.customresources.PhysicalResourceId;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudfront.SSLMethod;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Dashboard;
import software.amazon.awscdk.services.cloudwatch.GraphWidget;
import software.amazon.awscdk.services.cloudwatch.LogQueryWidget;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.SingleValueWidget;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.dynamodb.Attribute;
import software.amazon.awscdk.services.dynamodb.AttributeType;
import software.amazon.awscdk.services.dynamodb.BillingMode;
import software.amazon.awscdk.services.dynamodb.PointInTimeRecoverySpecification;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.dynamodb.TableEncryption;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
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
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.wafv2.CfnWebACL;
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.amazon.awscdk.services.xray.CfnGroup;
import software.amazon.awscdk.Tags;
import software.constructs.Construct;

public class ProviderStack extends Stack {
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
    public final EndpointFunction authorizeEndpoint;
    public final EndpointFunction tokenEndpoint;
    public final EndpointFunction userinfoEndpoint;
    public final EndpointFunction jwksEndpoint;
    public final Distribution distribution;
    public final LogGroup bucketDeploymentLogGroup;
    public final BucketDeployment webDeployment;
    public final BucketDeployment wellKnownDeployment;
    public final ARecord aliasRecord;

    public ProviderStack(final Construct scope, final String id, final ProviderStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        applyCostAllocationTags(props);

        var additionalOriginsBehaviourMappings = new HashMap<String, BehaviorOptions>();

        // Generate predictable resource name prefix based on domain and deployment name
        String resourceNamePrefix = generateResourceNamePrefix(props.domainName, props.deploymentName);
        String compressedResourceNamePrefix =
                generateCompressedResourceNamePrefix(props.domainName, props.deploymentName);

        // Use observability resources from the passed props
        this.logsBucket = props.logsBucket;
        this.trailLogGroup = props.trailLogGroup;
        this.auditTrail = props.auditTrail;
        this.xrayGroup = props.xrayGroup;
        this.bucketDeploymentLogGroup = props.bucketDeploymentLogGroup;

        // Hosted zone (must exist)
        IHostedZone zone = HostedZone.fromHostedZoneAttributes(
                this,
                resourceNamePrefix + "-Zone",
                HostedZoneAttributes.builder()
                        .hostedZoneId(props.hostedZoneId)
                        .zoneName(props.hostedZoneName)
                        .build());
        String domainName = props.domainName;
        String recordName = props.hostedZoneName.equals(props.domainName)
                ? null
                : (props.domainName.endsWith("." + props.hostedZoneName)
                        ? props.domainName.substring(0, props.domainName.length() - (props.hostedZoneName.length() + 1))
                        : props.domainName);

        this.baseUrl = "https://" + domainName;

        // TLS certificate from existing ACM (must be in us-east-1 for CloudFront)
        var cert = Certificate.fromCertificateArn(this, resourceNamePrefix + "-WebCert", props.certificateArn);

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
                        .bucketType(S3OriginBucketType.WEB)
                        .build());
        this.webBucket = this.webOriginBucket.bucket;
        this.webOriginAccessIdentity = this.webOriginBucket.originAccessIdentity;
        BehaviorOptions webOriginBehaviorOptions = this.webOriginBucket.behaviorOptions;

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
                        .bucketType(S3OriginBucketType.WELL_KNOWN)
                        .build());
        this.wellKnownBucket = this.wellKnownOriginBucket.bucket;
        this.wellKnownOriginAccessIdentity = this.wellKnownOriginBucket.originAccessIdentity;
        this.shortTtl = this.wellKnownOriginBucket.cachePolicy;
        BehaviorOptions wellKnownOriginBehaviorOptions = this.wellKnownOriginBucket.behaviorOptions;
        additionalOriginsBehaviourMappings.put("/.well-known/*", wellKnownOriginBehaviorOptions);

        // DDB tables with enhanced security and backup configuration
        this.usersTable = Table.Builder.create(this, resourceNamePrefix + "-Users")
                .tableName(resourceNamePrefix + "-users")
                .partitionKey(Attribute.builder()
                        .name("username")
                        .type(AttributeType.STRING)
                        .build())
                .billingMode(BillingMode.PAY_PER_REQUEST)
                .encryption(TableEncryption.AWS_MANAGED) // Enhanced: AWS managed encryption
                .pointInTimeRecoverySpecification(PointInTimeRecoverySpecification.builder()
                        .pointInTimeRecoveryEnabled(true)
                        .build()) // Enhanced: Enable point-in-time recovery for data protection
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        this.authCodesTable = Table.Builder.create(this, resourceNamePrefix + "-AuthCodes")
                .tableName(resourceNamePrefix + "-auth-codes")
                .partitionKey(Attribute.builder()
                        .name("code")
                        .type(AttributeType.STRING)
                        .build())
                .timeToLiveAttribute("ttl")
                .billingMode(BillingMode.PAY_PER_REQUEST)
                .encryption(TableEncryption.AWS_MANAGED) // Enhanced: AWS managed encryption
                .pointInTimeRecoverySpecification(PointInTimeRecoverySpecification.builder()
                        .pointInTimeRecoveryEnabled(true)
                        .build()) // Enhanced: Enable point-in-time recovery for data protection
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        this.refreshTokensTable = Table.Builder.create(this, resourceNamePrefix + "-RefreshTokens")
                .tableName(resourceNamePrefix + "-refresh-tokens")
                .partitionKey(Attribute.builder()
                        .name("rt")
                        .type(AttributeType.STRING)
                        .build())
                .timeToLiveAttribute("ttl")
                .billingMode(BillingMode.PAY_PER_REQUEST)
                .encryption(TableEncryption.AWS_MANAGED) // Enhanced: AWS managed encryption
                .pointInTimeRecoverySpecification(PointInTimeRecoverySpecification.builder()
                        .pointInTimeRecoveryEnabled(true)
                        .build()) // Enhanced: Enable point-in-time recovery for data protection
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // Lambda functions

        // Authorize endpoint via construct
        this.authorizeEndpoint = new EndpointFunction(
                this,
                resourceNamePrefix + "-AuthorizeEndpoint",
                EndpointFunctionProps.builder()
                        .functionName(compressedResourceNamePrefix + "-authorize")
                        .ecrRepositoryArn(props.ecrRepositoryArn)
                        .ecrRepositoryName(props.ecrRepositoryName)
                        .dockerfilePath("infra/runtimes/authorize.Dockerfile")
                        .handler(List.of("app/functions/authorize.handler"))
                        .pathPattern("/authorize")
                        .allowedMethods(AllowedMethods.ALLOW_ALL)
                        .extraEnv(Map.of(
                                "USERS_TABLE", this.usersTable.getTableName(),
                                "CODES_TABLE", this.authCodesTable.getTableName()))
                        .build());
        this.authorizeEndpoint.function.addEnvironment("ISSUER", "https://" + domainName);
        additionalOriginsBehaviourMappings.put("/authorize", this.authorizeEndpoint.behaviorOptions);
        this.usersTable.grantReadData(this.authorizeEndpoint.function);
        this.authCodesTable.grantReadWriteData(this.authorizeEndpoint.function);

        // Token endpoint via construct
        this.tokenEndpoint = new EndpointFunction(
                this,
                resourceNamePrefix + "-TokenEndpoint",
                EndpointFunctionProps.builder()
                        .functionName(compressedResourceNamePrefix + "-token")
                        .ecrRepositoryArn(props.ecrRepositoryArn)
                        .ecrRepositoryName(props.ecrRepositoryName)
                        .dockerfilePath("infra/runtimes/token.Dockerfile")
                        .handler(List.of("app/functions/token.handler"))
                        .pathPattern("/token")
                        .allowedMethods(AllowedMethods.ALLOW_ALL)
                        .extraEnv(Map.of(
                                "USERS_TABLE", this.usersTable.getTableName(),
                                "REFRESH_TABLE", this.refreshTokensTable.getTableName(),
                                "CODES_TABLE", this.authCodesTable.getTableName()))
                        .build());
        this.tokenEndpoint.function.addEnvironment("ISSUER", "https://" + domainName);
        additionalOriginsBehaviourMappings.put("/token", this.tokenEndpoint.behaviorOptions);
        this.authCodesTable.grantReadWriteData(this.tokenEndpoint.function);
        this.refreshTokensTable.grantReadWriteData(this.tokenEndpoint.function);
        // Allow token Lambda to read user records for ID token claims
        this.usersTable.grantReadData(this.tokenEndpoint.function);

        // UserInfo endpoint via construct
        this.userinfoEndpoint = new EndpointFunction(
                this,
                resourceNamePrefix + "-UserInfoEndpoint",
                EndpointFunctionProps.builder()
                        .functionName(compressedResourceNamePrefix + "-userinfo")
                        .ecrRepositoryArn(props.ecrRepositoryArn)
                        .ecrRepositoryName(props.ecrRepositoryName)
                        .dockerfilePath("infra/runtimes/userinfo.Dockerfile")
                        .handler(List.of("app/functions/userinfo.handler"))
                        .pathPattern("/userinfo")
                        .allowedMethods(AllowedMethods.ALLOW_ALL)
                        .extraEnv(Map.of("USERS_TABLE", this.usersTable.getTableName()))
                        .build());
        this.userinfoEndpoint.function.addEnvironment("ISSUER", "https://" + domainName);
        additionalOriginsBehaviourMappings.put("/userinfo", this.userinfoEndpoint.behaviorOptions);
        this.usersTable.grantReadData(this.userinfoEndpoint.function);

        // JWKS endpoint via construct
        this.jwksEndpoint = new EndpointFunction(
                this,
                resourceNamePrefix + "-JwksEndpoint",
                EndpointFunctionProps.builder()
                        .functionName(compressedResourceNamePrefix + "-jwks")
                        .ecrRepositoryArn(props.ecrRepositoryArn)
                        .ecrRepositoryName(props.ecrRepositoryName)
                        .dockerfilePath("infra/runtimes/jwks.Dockerfile")
                        .handler(List.of("app/functions/jwks.handler"))
                        .pathPattern("/jwks")
                        .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                        .extraEnv(Map.of("CODES_TABLE", this.authCodesTable.getTableName()))
                        .build());
        this.jwksEndpoint.function.addEnvironment("ISSUER", "https://" + domainName);
        additionalOriginsBehaviourMappings.put("/jwks", this.jwksEndpoint.behaviorOptions);
        this.authCodesTable.grantReadWriteData(this.jwksEndpoint.function);

        // AWS WAF WebACL for CloudFront protection against common attacks and rate limiting
        CfnWebACL webAcl = createWebAclForCloudFront(resourceNamePrefix, compressedResourceNamePrefix);

        // CloudFront with two S3 origins and FunctionUrl origins for OIDC endpoints
        this.distribution = Distribution.Builder.create(this, resourceNamePrefix + "-WebDist")
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
                .webAclId(webAcl.getAttrArn())
                .build();

        // Grant CloudFront access to the origin lambdas with compressed names
        Permission invokeFunctionUrlPermission = Permission.builder()
                .principal(new ServicePrincipal("cloudfront.amazonaws.com"))
                .action("lambda:InvokeFunctionUrl")
                .functionUrlAuthType(FunctionUrlAuthType.NONE)
                .sourceArn(this.distribution.getDistributionArn())
                .build();
        this.authorizeEndpoint.function.addPermission(
                compressedResourceNamePrefix + "-cf-auth", invokeFunctionUrlPermission);
        this.tokenEndpoint.function.addPermission(
                compressedResourceNamePrefix + "-cf-token", invokeFunctionUrlPermission);
        this.userinfoEndpoint.function.addPermission(
                compressedResourceNamePrefix + "-cf-userinfo", invokeFunctionUrlPermission);
        this.jwksEndpoint.function.addPermission(
                compressedResourceNamePrefix + "-cf-jwks", invokeFunctionUrlPermission);

        // Reliability Monitoring: CloudWatch Alarms for Lambda functions
        createLambdaReliabilityAlarms(resourceNamePrefix, compressedResourceNamePrefix);

        // Operational Dashboard for system health monitoring
        createOperationalDashboard(resourceNamePrefix, compressedResourceNamePrefix);

        var deployPostfix = java.util.UUID.randomUUID().toString().substring(0, 8);

        // Deploy the web website files to the web website bucket and invalidate distribution
        var webDocRootSource = Source.asset(
                "web",
                AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
        var webDeploymentLogGroup = LogGroup.Builder.create(this, resourceNamePrefix + "-WebDeploymentLogGroup")
                .logGroupName("/deployment/" + resourceNamePrefix + "-web-deployment-" + deployPostfix)
                .retention(RetentionDays.ONE_DAY)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        this.webDeployment = BucketDeployment.Builder.create(this, resourceNamePrefix + "-DocRootToWebOriginDeployment")
                .sources(List.of(webDocRootSource))
                .destinationBucket(this.webBucket)
                .distribution(this.distribution)
                .distributionPaths(List.of("/*"))
                .retainOnDelete(false)
                .logGroup(webDeploymentLogGroup)
                .expires(Expiration.after(Duration.minutes(5)))
                .prune(true)
                .build();

        // Deploy the well-known website files to the well-known bucket under /.well-known/ with a random suffix on the
        // log group name
        var wellKnownRootSource = Source.asset(
                "well-known",
                AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());

        var wellKnownDeploymentLogGroup = LogGroup.Builder.create(
                        this, resourceNamePrefix + "-WellKnownDeploymentLogGroup")
                .logGroupName("/deployment/" + resourceNamePrefix + "-well-known-deployment-" + deployPostfix)
                .retention(RetentionDays.ONE_DAY)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        this.wellKnownDeployment = BucketDeployment.Builder.create(
                        this, resourceNamePrefix + "-DocRootToWellKnownOriginDeployment")
                .sources(List.of(wellKnownRootSource))
                .destinationBucket(this.wellKnownBucket)
                .destinationKeyPrefix(".well-known/")
                .distribution(this.distribution)
                .distributionPaths(List.of("/*"))
                .retainOnDelete(false)
                .logGroup(wellKnownDeploymentLogGroup)
                .expires(Expiration.after(Duration.minutes(5)))
                .prune(true)
                .build();

        // Create a custom resource to fix the well-known configuration with correct domain
        createWellKnownConfigFix(resourceNamePrefix, domainName);

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
        new CfnOutput(
                this,
                "BaseUrl",
                CfnOutputProps.builder().value("https://" + domainName).build());
        new CfnOutput(
                this,
                "WebBucketName",
                CfnOutputProps.builder().value(this.webBucket.getBucketName()).build());
        new CfnOutput(
                this,
                "WellKnownBucketName",
                CfnOutputProps.builder()
                        .value(this.wellKnownBucket.getBucketName())
                        .build());
        new CfnOutput(
                this,
                "DistributionId",
                CfnOutputProps.builder()
                        .value(this.distribution.getDistributionId())
                        .build());
        new CfnOutput(
                this,
                "UsersTableName",
                CfnOutputProps.builder().value(this.usersTable.getTableName()).build());
    }

    private String getLambdaUrlHostToken(FunctionUrl functionUrl) {
        return Fn.select(2, Fn.split("/", functionUrl.getUrl()));
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    /**
     * Create CloudWatch alarms for Lambda function reliability monitoring
     */
    private void createLambdaReliabilityAlarms(String resourceNamePrefix, String compressedResourceNamePrefix) {
        // Error rate alarm for authorize endpoint
        Alarm.Builder.create(this, resourceNamePrefix + "-AuthorizeErrorAlarm")
                .alarmName(compressedResourceNamePrefix + "-authorize-errors")
                .metric(this.authorizeEndpoint.function.metricErrors())
                .threshold(3.0) // Alert on 3+ errors in evaluation period
                .evaluationPeriods(2) // Over 2 evaluation periods (10 minutes)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("High error rate detected in authorize endpoint")
                .build();

        // Duration alarm for authorize endpoint (cold start monitoring)
        Alarm.Builder.create(this, resourceNamePrefix + "-AuthorizeDurationAlarm")
                .alarmName(compressedResourceNamePrefix + "-authorize-duration")
                .metric(this.authorizeEndpoint.function.metricDuration())
                .threshold(10000.0) // Alert if duration > 10 seconds
                .evaluationPeriods(3) // Over 3 evaluation periods (15 minutes)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("High duration detected in authorize endpoint - possible cold start issues")
                .build();

        // Error rate alarm for token endpoint (most critical)
        Alarm.Builder.create(this, resourceNamePrefix + "-TokenErrorAlarm")
                .alarmName(compressedResourceNamePrefix + "-token-errors")
                .metric(this.tokenEndpoint.function.metricErrors())
                .threshold(2.0) // Lower threshold for critical token endpoint
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("High error rate detected in token endpoint - critical for authentication flow")
                .build();

        // Throttle alarm for all endpoints (simplified approach)
        Alarm.Builder.create(this, resourceNamePrefix + "-LambdaThrottleAlarm")
                .alarmName(compressedResourceNamePrefix + "-lambda-throttles")
                .metric(this.authorizeEndpoint.function.metricThrottles())
                .threshold(1.0) // Alert on any throttling
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("Lambda function throttling detected - may need reserved concurrency")
                .build();
    }

    /**
     * Apply comprehensive cost allocation tags for all resources in the stack
     */
    private void applyCostAllocationTags(ProviderStackProps props) {
        Tags.of(this).add("Environment", props.envName);
        Tags.of(this).add("Application", "oidc-provider");
        Tags.of(this).add("CostCenter", "authentication");
        Tags.of(this).add("Owner", "platform-team");
        Tags.of(this).add("Project", "identity-management");
        Tags.of(this).add("DeploymentName", props.deploymentName);
        Tags.of(this).add("Stack", "ProviderStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");
    }

    public BucketDeployment getWellKnownDeployment() {
        return wellKnownDeployment;
    }

    public Distribution getDistribution() {
        return distribution;
    }

    /**
     * Generate a predictable resource name prefix based on domain name and deployment name.
     * Converts domain like "oidc.example.com" to "oidc-example-com" and adds deployment name.
     */
    private static String generateResourceNamePrefix(String domainName, String deploymentName) {
        String dashedDomainName = domainName.replace('.', '-');
        return dashedDomainName + "-" + deploymentName;
    }

    /**
     * Generate a shortened predictable resource name prefix based on domain and deployment name.
     * Steps:
     * 1. Replace dots with dashes.
     * 2. Split on dashes.
     * 3. Keep segment "oidc" intact; compress all other non-empty segments to their first letter.
     * 4. Append '-' + deployment name (deployment name kept whole).
     *
     * Examples:
     *   domain=oidc.example.com, deployment=dev  -> oidc-e-c-dev
     *   domain=login.auth.service.example.com, deployment=prod -> l-a-s-e-c-prod
     *
     * @param domainName fully qualified domain name (e.g. "oidc.example.com")
     * @param deploymentName deployment name (e.g. "dev", "ci", "ci-branchname")
     * @return compressed resource name prefix
     */
    private static String generateCompressedResourceNamePrefix(String domainName, String deploymentName) {
        if (domainName == null || domainName.isBlank()) {
            throw new IllegalArgumentException("domainName must be non-empty");
        }
        if (deploymentName == null || deploymentName.isBlank()) {
            throw new IllegalArgumentException("deploymentName must be non-empty");
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
        sb.append('-').append(deploymentName);
        return sb.toString();
    }

    /**
     * Create a custom resource to fix the well-known configuration with the correct domain
     */
    private void createWellKnownConfigFix(String resourceNamePrefix, String domainName) {
        var configContent = String.format(
                """
            {
              "issuer": "https://%s",
              "authorization_endpoint": "https://%s/authorize",
              "token_endpoint": "https://%s/token",
              "userinfo_endpoint": "https://%s/userinfo",
              "jwks_uri": "https://%s/jwks",
              "scopes_supported": ["openid", "email", "profile"],
              "response_types_supported": ["code"],
              "grant_types_supported": ["authorization_code"],
              "subject_types_supported": ["public"],
              "id_token_signing_alg_values_supported": ["RS256"],
              "token_endpoint_auth_methods_supported": ["none"],
              "code_challenge_methods_supported": ["S256"],
              "claims_supported": ["sub", "email", "email_verified", "name", "given_name", "family_name", "aud", "exp", "iat", "iss", "nonce"]
            }
            """,
                domainName, domainName, domainName, domainName, domainName);

        var wellKnownConfigCall = AwsSdkCall.builder()
                .service("S3")
                .action("putObject")
                .parameters(Map.of(
                        "Bucket", this.wellKnownBucket.getBucketName(),
                        "Key", ".well-known/openid-configuration",
                        "Body", configContent,
                        "ContentType", "application/json",
                        "CacheControl", "no-cache"))
                .physicalResourceId(PhysicalResourceId.of("well-known-config-" + resourceNamePrefix))
                .build();

        var wellKnownConfigCustomResource = AwsCustomResource.Builder.create(
                        this, resourceNamePrefix + "-WellKnownConfigFix")
                .onCreate(wellKnownConfigCall)
                .onUpdate(wellKnownConfigCall)
                .policy(AwsCustomResourcePolicy.fromStatements(List.of(PolicyStatement.Builder.create()
                        .effect(Effect.ALLOW)
                        .actions(List.of("s3:PutObject"))
                        .resources(List.of(this.wellKnownBucket.getBucketArn() + "/.well-known/*"))
                        .build())))
                .installLatestAwsSdk(false)
                .build();

        // Ensure the custom resource runs after the initial deployment
        wellKnownConfigCustomResource.getNode().addDependency(this.wellKnownDeployment);

        // Invalidate CloudFront after config is updated
        var wellKnownInvalidationCall = AwsSdkCall.builder()
                .service("CloudFront")
                .action("createInvalidation")
                .parameters(Map.of(
                        "DistributionId", this.distribution.getDistributionId(),
                        "InvalidationBatch",
                                Map.of(
                                        "CallerReference",
                                        "well-known-config-"
                                                + java.time.Instant.now().toEpochMilli(),
                                        "Paths",
                                        Map.of("Quantity", 1, "Items", List.of("/.well-known/*")))))
                .physicalResourceId(PhysicalResourceId.of("well-known-config-invalidation-" + resourceNamePrefix))
                .build();

        var wellKnownInvalidationCustomResource = AwsCustomResource.Builder.create(
                        this, resourceNamePrefix + "-WellKnownConfigInvalidation")
                .onCreate(wellKnownInvalidationCall)
                .onUpdate(wellKnownInvalidationCall)
                .policy(AwsCustomResourcePolicy.fromStatements(List.of(PolicyStatement.Builder.create()
                        .effect(Effect.ALLOW)
                        .actions(List.of("cloudfront:CreateInvalidation"))
                        .resources(List.of(this.distribution.getDistributionArn()))
                        .build())))
                .installLatestAwsSdk(false)
                .build();

        // Ensure invalidation runs after config is updated
        wellKnownInvalidationCustomResource.getNode().addDependency(wellKnownConfigCustomResource);
    }

    /**
     * Create AWS WAF WebACL for CloudFront distribution protection.
     * Implements rate limiting and basic security rules to protect against common attacks.
     * Fixed to use proper rule overrides for managed rule groups.
     */
    private CfnWebACL createWebAclForCloudFront(String resourceNamePrefix, String compressedResourceNamePrefix) {
        return CfnWebACL.Builder.create(this, resourceNamePrefix + "-WebAcl")
                .name(compressedResourceNamePrefix + "-waf")
                .scope("CLOUDFRONT")
                .defaultAction(CfnWebACL.DefaultActionProperty.builder()
                        .allow(CfnWebACL.AllowActionProperty.builder().build())
                        .build())
                .rules(List.of(
                        // Rate limiting rule - 2000 requests per 5 minutes per IP
                        CfnWebACL.RuleProperty.builder()
                                .name("RateLimitRule")
                                .priority(1)
                                .statement(CfnWebACL.StatementProperty.builder()
                                        .rateBasedStatement(CfnWebACL.RateBasedStatementProperty.builder()
                                                .limit(2000L) // requests per 5 minutes
                                                .aggregateKeyType("IP")
                                                .build())
                                        .build())
                                .action(CfnWebACL.RuleActionProperty.builder()
                                        .block(CfnWebACL.BlockActionProperty.builder().build())
                                        .build())
                                .visibilityConfig(CfnWebACL.VisibilityConfigProperty.builder()
                                        .cloudWatchMetricsEnabled(true)
                                        .metricName("RateLimitRule")
                                        .sampledRequestsEnabled(true)
                                        .build())
                                .build(),
                        // AWS managed rule for known bad inputs
                        CfnWebACL.RuleProperty.builder()
                                .name("AWSManagedRulesKnownBadInputsRuleSet")
                                .priority(2)
                                .statement(CfnWebACL.StatementProperty.builder()
                                        .managedRuleGroupStatement(CfnWebACL.ManagedRuleGroupStatementProperty.builder()
                                                .name("AWSManagedRulesKnownBadInputsRuleSet")
                                                .vendorName("AWS")
                                                .ruleActionOverrides(List.of()) // Empty override list to prevent conflicts
                                                .build())
                                        .build())
                                .overrideAction(CfnWebACL.OverrideActionProperty.builder()
                                        .none(Map.of())
                                        .build())
                                .visibilityConfig(CfnWebACL.VisibilityConfigProperty.builder()
                                        .cloudWatchMetricsEnabled(true)
                                        .metricName("AWSManagedRulesKnownBadInputsRuleSet")
                                        .sampledRequestsEnabled(true)
                                        .build())
                                .build(),
                        // AWS managed rule for common rule set (SQL injection, XSS, etc.)
                        CfnWebACL.RuleProperty.builder()
                                .name("AWSManagedRulesCommonRuleSet")
                                .priority(3)
                                .statement(CfnWebACL.StatementProperty.builder()
                                        .managedRuleGroupStatement(CfnWebACL.ManagedRuleGroupStatementProperty.builder()
                                                .name("AWSManagedRulesCommonRuleSet")
                                                .vendorName("AWS")
                                                .ruleActionOverrides(List.of()) // Empty override list to prevent conflicts
                                                .build())
                                        .build())
                                .overrideAction(CfnWebACL.OverrideActionProperty.builder()
                                        .none(Map.of())
                                        .build())
                                .visibilityConfig(CfnWebACL.VisibilityConfigProperty.builder()
                                        .cloudWatchMetricsEnabled(true)
                                        .metricName("AWSManagedRulesCommonRuleSet")
                                        .sampledRequestsEnabled(true)
                                        .build())
                                .build()
                ))
                .description("WAF WebACL for OIDC provider CloudFront distribution - provides rate limiting and protection against common attacks")
                .visibilityConfig(CfnWebACL.VisibilityConfigProperty.builder()
                        .cloudWatchMetricsEnabled(true)
                        .metricName(compressedResourceNamePrefix + "-waf")
                        .sampledRequestsEnabled(true)
                        .build())
                .build();
    }

    /**
     * Create operational dashboard for system health monitoring.
     * Provides comprehensive visibility into Lambda performance, CloudFront requests, and system metrics.
     */
    private void createOperationalDashboard(String resourceNamePrefix, String compressedResourceNamePrefix) {
        Dashboard.Builder.create(this, resourceNamePrefix + "-OperationalDashboard")
                .dashboardName(compressedResourceNamePrefix + "-operations")
                .widgets(List.of(List.of(
                        // Lambda invocation metrics
                        GraphWidget.Builder.create()
                                .title("Lambda Invocations by Endpoint")
                                .region(this.getRegion())
                                .left(List.of(
                                        this.authorizeEndpoint.function.metricInvocations(),
                                        this.tokenEndpoint.function.metricInvocations(),
                                        this.userinfoEndpoint.function.metricInvocations(),
                                        this.jwksEndpoint.function.metricInvocations()
                                ))
                                .width(12)
                                .height(6)
                                .build(),
                        // Lambda error metrics
                        GraphWidget.Builder.create()
                                .title("Lambda Errors by Endpoint")
                                .region(this.getRegion())
                                .left(List.of(
                                        this.authorizeEndpoint.function.metricErrors(),
                                        this.tokenEndpoint.function.metricErrors(),
                                        this.userinfoEndpoint.function.metricErrors(),
                                        this.jwksEndpoint.function.metricErrors()
                                ))
                                .width(12)
                                .height(6)
                                .build(),
                        // Lambda duration metrics
                        GraphWidget.Builder.create()
                                .title("Lambda Duration by Endpoint")
                                .region(this.getRegion())
                                .left(List.of(
                                        this.authorizeEndpoint.function.metricDuration(),
                                        this.tokenEndpoint.function.metricDuration(),
                                        this.userinfoEndpoint.function.metricDuration(),
                                        this.jwksEndpoint.function.metricDuration()
                                ))
                                .width(12)
                                .height(6)
                                .build(),
                        // Lambda throttle metrics
                        GraphWidget.Builder.create()
                                .title("Lambda Throttles")
                                .region(this.getRegion())
                                .left(List.of(
                                        this.authorizeEndpoint.function.metricThrottles(),
                                        this.tokenEndpoint.function.metricThrottles(),
                                        this.userinfoEndpoint.function.metricThrottles(),
                                        this.jwksEndpoint.function.metricThrottles()
                                ))
                                .width(12)
                                .height(6)
                                .build()
                )))
                .build();
    }


}
