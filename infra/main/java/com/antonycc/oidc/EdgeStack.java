package com.antonycc.oidc;

import software.amazon.awscdk.AssetHashType;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Expiration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.SSLMethod;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOACProps;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionAttributes;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.IFunction;
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
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.amazon.awscdk.services.wafv2.CfnWebACL;
import software.constructs.Construct;

import java.util.List;
import java.util.Map;

public class EdgeStack extends Stack {
    public final Distribution distribution;
    public final BucketDeployment webDeployment;
    public final BucketDeployment wellKnownDeployment;
    public final ARecord aliasRecord;
    public final String baseUrl;

    public EdgeStack(final Construct scope, final String id, final EdgeStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName);
        Tags.of(this).add("Application", "oidc-provider");
        Tags.of(this).add("CostCenter", "authentication");
        Tags.of(this).add("Owner", "platform-team");
        Tags.of(this).add("Project", "identity-management");
        Tags.of(this).add("DeploymentName", props.deploymentName);
        Tags.of(this).add("Stack", "EdgeStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-oidc");
        Tags.of(this).add("Criticality", "high");
        Tags.of(this).add("DataClassification", "confidential");
        Tags.of(this).add("BackupRequired", "true");
        Tags.of(this).add("MonitoringEnabled", "true");

        // Use Resources from the passed props
        this.baseUrl = props.baseUrl;
        IBucket logsBucket = Bucket.fromBucketArn(this, "LogsBucket", props.logsBucketArn);
        IBucket webBucketImported = Bucket.fromBucketArn(this, "WebBucket", props.webBucket.getBucketArn());
        IBucket wellKnownBucketImported = Bucket.fromBucketArn(this, "WellKnownBucket", props.wellKnownBucket.getBucketArn());
        IFunction jwksEndpointFunction = Function.fromFunctionAttributes(
                this,
                "JwksEndpointFunction",
                FunctionAttributes.builder()
                        .functionArn(props.jwksEndpointFunctionArn)
                        .sameEnvironment(true)
                        .build());
        IFunction authorizeEndpointFunction = Function.fromFunctionAttributes(
                this,
                "AuthorizeEndpointFunction",
                FunctionAttributes.builder()
                        .functionArn(props.authorizeEndpointFunctionArn)
                        .sameEnvironment(true)
                        .build());
        IFunction tokenEndpointFunction = Function.fromFunctionAttributes(
                this,
                "TokenEndpointFunction",
                FunctionAttributes.builder()
                        .functionArn(props.tokenEndpointFunctionArn)
                        .sameEnvironment(true)
                        .build());
        IFunction userinfoEndpointFunction = Function.fromFunctionAttributes(
                this,
                "UserinfoEndpointFunction",
                FunctionAttributes.builder()
                        .functionArn(props.userinfoEndpointFunctionArn)
                        .sameEnvironment(true)
                        .build());

        // Hosted zone (must exist)
        IHostedZone zone = HostedZone.fromHostedZoneAttributes(
                this,
                props.resourceNamePrefix + "-Zone",
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

        // TLS certificate from existing ACM (must be in us-east-1 for CloudFront)
        var cert = Certificate.fromCertificateArn(this, props.resourceNamePrefix + "-WebCert", props.certificateArn);

        // Buckets

        // AWS WAF WebACL for CloudFront protection against common attacks and rate limiting
        CfnWebACL webAcl = CfnWebACL.Builder.create(this, props.resourceNamePrefix + "-WebAcl")
                .name(props.compressedResourceNamePrefix + "-waf")
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
                                        .block(CfnWebACL.BlockActionProperty.builder()
                                                .build())
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
                                                .ruleActionOverrides(
                                                        List.of()) // Empty override list to prevent conflicts
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
                                                .ruleActionOverrides(
                                                        List.of()) // Empty override list to prevent conflicts
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
                                .build()))
                .description(
                        "WAF WebACL for OIDC provider CloudFront distribution - provides rate limiting and protection against common attacks")
                .visibilityConfig(CfnWebACL.VisibilityConfigProperty.builder()
                        .cloudWatchMetricsEnabled(true)
                        .metricName(props.compressedResourceNamePrefix + "-waf")
                        .sampledRequestsEnabled(true)
                        .build())
                .build();

        // Build CloudFront origins and behaviors locally to avoid cross-stack binding
        //var webBucketOrigin = S3BucketOrigin.withOriginAccessControl(
        //    props.webBucket, S3BucketOriginWithOACProps.builder().build());
        var webBucketOrigin = S3BucketOrigin.withBucketDefaults(webBucketImported);
        var webBehavior = BehaviorOptions.builder()
                .origin(webBucketOrigin)
                .compress(true)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(
                        ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .build();

        var cachePolicy = CachePolicy.Builder.create(this, props.resourceNamePrefix + "-ShortTTL")
                .cachePolicyName(props.resourceNamePrefix + "-short-ttl")
                .defaultTtl(Duration.seconds(60))
                .minTtl(Duration.seconds(0))
                .maxTtl(Duration.minutes(5))
                .enableAcceptEncodingBrotli(true)
                .enableAcceptEncodingGzip(true)
                .build();
        var wellKnownBucketOrigin = S3BucketOrigin.withOriginAccessControl(
            wellKnownBucketImported, S3BucketOriginWithOACProps.builder().build());
        var wellKnownBehaviorOptions = BehaviorOptions.builder()
                .origin(wellKnownBucketOrigin)
                .cachePolicy(cachePolicy)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(
                        ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .build();

        java.util.Map<String, software.amazon.awscdk.services.cloudfront.BehaviorOptions> additionalBehaviors = new java.util.HashMap<>();
        additionalBehaviors.put("/.well-known/*", wellKnownBehaviorOptions);
        if (props.additionalOriginsBehaviourMappings != null) {
            additionalBehaviors.putAll(props.additionalOriginsBehaviourMappings);
        }

        this.distribution = Distribution.Builder.create(this, props.resourceNamePrefix + "-WebDist")
                .defaultBehavior(webBehavior)
                .additionalBehaviors(additionalBehaviors)
                .domainNames(List.of(domainName))
                .certificate(cert)
                .defaultRootObject("index.html")
                .enableLogging(true)
                .logBucket(logsBucket)
                .logFilePrefix("cloudfront/")
                .enableIpv6(true)
                .sslSupportMethod(SSLMethod.SNI)
                .webAclId(webAcl.getAttrArn())
                .build();

        // Explicit bucket policies for imported buckets to allow access from CloudFront OAC
        //props.webBucket.addToResourcePolicy(PolicyStatement.Builder.create()
        //        .sid("AllowCloudFrontReadWeb")
        //        .actions(List.of("s3:GetObject"))
        //        .principals(List.of(new ServicePrincipal("cloudfront.amazonaws.com")))
        //        .resources(List.of(props.webBucket.arnForObjects("*")))
        //        .conditions(Map.of("StringEquals", Map.of("AWS:SourceArn", this.distribution.getDistributionArn())))
        //        .build());

        //props.wellKnownBucket.addToResourcePolicy(PolicyStatement.Builder.create()
        //        .sid("AllowCloudFrontReadWellKnown")
        //        .actions(List.of("s3:GetObject"))
        //        .principals(List.of(new ServicePrincipal("cloudfront.amazonaws.com")))
        //        .resources(List.of(props.wellKnownBucket.arnForObjects(".well-known/*")))
        //        .conditions(Map.of("StringEquals", Map.of("AWS:SourceArn", this.distribution.getDistributionArn())))
        //        .build());

        // Grant CloudFront access to the origin lambdas with compressed names
        Permission invokeFunctionUrlPermission = Permission.builder()
                .principal(new ServicePrincipal("cloudfront.amazonaws.com"))
                .action("lambda:InvokeFunctionUrl")
                .functionUrlAuthType(FunctionUrlAuthType.NONE)
                .sourceArn(this.distribution.getDistributionArn())
                .build();
        authorizeEndpointFunction.addPermission(
                props.compressedResourceNamePrefix + "-cf-auth", invokeFunctionUrlPermission);
        tokenEndpointFunction.addPermission(
                props.compressedResourceNamePrefix + "-cf-token", invokeFunctionUrlPermission);
        userinfoEndpointFunction.addPermission(
                props.compressedResourceNamePrefix + "-cf-userinfo", invokeFunctionUrlPermission);
        jwksEndpointFunction.addPermission(
                props.compressedResourceNamePrefix + "-cf-jwks", invokeFunctionUrlPermission);

        var deployPostfix = java.util.UUID.randomUUID().toString().substring(0, 8);

        // Deploy the web website files to the web website bucket and invalidate distribution
        var webDocRootSource = Source.asset(
                "web",
                AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
        var webDeploymentLogGroup = LogGroup.Builder.create(this, props.resourceNamePrefix + "-WebDeploymentLogGroup")
                .logGroupName("/deployment/" + props.resourceNamePrefix + "-web-deployment-" + deployPostfix)
                .retention(RetentionDays.ONE_DAY)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        this.webDeployment = BucketDeployment.Builder.create(
                        this, props.resourceNamePrefix + "-DocRootToWebOriginDeployment")
                .sources(List.of(webDocRootSource))
                .destinationBucket(props.webBucket)
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
                        this, props.resourceNamePrefix + "-WellKnownDeploymentLogGroup")
                .logGroupName("/deployment/" + props.resourceNamePrefix + "-well-known-deployment-" + deployPostfix)
                .retention(RetentionDays.ONE_DAY)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        this.wellKnownDeployment = BucketDeployment.Builder.create(
                        this, props.resourceNamePrefix + "-DocRootToWellKnownOriginDeployment")
                .sources(List.of(wellKnownRootSource))
                .destinationBucket(props.wellKnownBucket)
                .destinationKeyPrefix(".well-known/")
                .distribution(this.distribution)
                .distributionPaths(List.of("/*"))
                .retainOnDelete(false)
                .logGroup(wellKnownDeploymentLogGroup)
                .expires(Expiration.after(Duration.minutes(5)))
                .prune(true)
                .build();

        // A record
        this.aliasRecord = new ARecord(
                this,
                props.resourceNamePrefix + "-AliasRecord",
                ARecordProps.builder()
                        .recordName(recordName)
                        .zone(zone)
                        .target(RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)))
                        .build());

        // Outputs
        new CfnOutput(
                this, "BaseUrl", CfnOutputProps.builder().value(this.baseUrl).build());
        new CfnOutput(
                this,
                "AliasRecord",
                CfnOutputProps.builder().value(this.aliasRecord.getDomainName()).build());
        new CfnOutput(
                this,
                "WebDistributionDomainName",
                CfnOutputProps.builder()
                        .value(this.distribution.getDomainName())
                        .build());
        new CfnOutput(
                this,
                "DistributionId",
                CfnOutputProps.builder()
                        .value(this.distribution.getDistributionId())
                        .build());
    }
}
