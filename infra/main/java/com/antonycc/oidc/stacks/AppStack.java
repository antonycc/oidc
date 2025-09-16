package com.antonycc.oidc.stacks;

import com.antonycc.oidc.constructs.EndpointConstruct;
import com.antonycc.oidc.constructs.EndpointConstructProps;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOAIProps;
import software.amazon.awscdk.services.dynamodb.Attribute;
import software.amazon.awscdk.services.dynamodb.AttributeType;
import software.amazon.awscdk.services.dynamodb.BillingMode;
import software.amazon.awscdk.services.dynamodb.PointInTimeRecoverySpecification;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.dynamodb.TableEncryption;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.constructs.Construct;

public class AppStack extends Stack {
    public final Bucket wellKnownBucket;
    public final Table usersTable;
    public final Table authCodesTable;
    public final Table refreshTokensTable;
    public final EndpointConstruct authorizeEndpoint;
    public final EndpointConstruct tokenEndpoint;
    public final EndpointConstruct userinfoEndpoint;
    public final EndpointConstruct jwksEndpoint;
    public final Map<String, BehaviorOptions> additionalOriginsBehaviourMappings;
    public final OriginAccessIdentity wellKnownOriginAccessIdentity;
    public final IOrigin wellKnownOrigin;
    public final BehaviorOptions wellKnownBehaviorOptions;
    public final CachePolicy wellKnownCachePolicy;

    public AppStack(final Construct scope, final String id, final AppStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName);
        Tags.of(this).add("Application", "oidc-provider");
        Tags.of(this).add("CostCenter", "@antonycc/oidc");
        Tags.of(this).add("Owner", "@antonycc/oidc");
        Tags.of(this).add("Project", "oidc-provider");
        Tags.of(this).add("DeploymentName", props.deploymentName);
        Tags.of(this).add("Stack", "AppStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-oidc");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "true");

        this.additionalOriginsBehaviourMappings = new HashMap<String, BehaviorOptions>();

        // Use Resources from the passed props

        // Buckets

        // Well-known origin bucket
        this.wellKnownBucket = Bucket.Builder.create(this, props.resourceNamePrefix + "-WellKnownBucket")
                .bucketName(props.resourceNamePrefix + "-" + "well-known")
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .enforceSsl(true)
                .encryption(BucketEncryption.S3_MANAGED) // Explicit SSE-S3 encryption (zero cost)
                .autoDeleteObjects(true)
                .removalPolicy(RemovalPolicy.DESTROY)
                .serverAccessLogsPrefix("s3/well-known/")
                .build();

        this.wellKnownCachePolicy = CachePolicy.Builder.create(this, props.resourceNamePrefix + "-ShortTTL")
                .cachePolicyName(props.resourceNamePrefix + "-short-ttl")
                .defaultTtl(Duration.seconds(60))
                .minTtl(Duration.seconds(0))
                .maxTtl(Duration.minutes(5))
                .enableAcceptEncodingBrotli(true)
                .enableAcceptEncodingGzip(true)
                .build();

        // Create the OriginAccessIdentity for CloudFront access
        this.wellKnownOriginAccessIdentity = OriginAccessIdentity.Builder.create(
                        this, props.resourceNamePrefix + "-OriginAccessIdentity")
                // .comment(props.oaiComment)
                .build();

        // Grant read access to the OAI
        this.wellKnownBucket.grantRead(this.wellKnownOriginAccessIdentity);

        // Create the S3BucketOrigin
        this.wellKnownOrigin = S3BucketOrigin.withOriginAccessIdentity(
                this.wellKnownBucket,
                S3BucketOriginWithOAIProps.builder()
                        .originAccessIdentity(this.wellKnownOriginAccessIdentity)
                        .build());

        this.wellKnownBehaviorOptions = BehaviorOptions.builder()
                .origin(this.wellKnownOrigin)
                .cachePolicy(this.wellKnownCachePolicy)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .build();

        this.additionalOriginsBehaviourMappings.put("/.well-known/*", this.wellKnownBehaviorOptions);

        // DynamoDB tables

        // DDB tables with enhanced security and backup configuration
        this.usersTable = Table.Builder.create(this, props.resourceNamePrefix + "-Users")
                .tableName(props.resourceNamePrefix + "-users")
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

        this.authCodesTable = Table.Builder.create(this, props.resourceNamePrefix + "-AuthCodes")
                .tableName(props.resourceNamePrefix + "-auth-codes")
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

        this.refreshTokensTable = Table.Builder.create(this, props.resourceNamePrefix + "-RefreshTokens")
                .tableName(props.resourceNamePrefix + "-refresh-tokens")
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
        this.authorizeEndpoint = new EndpointConstruct(
                this,
                props.resourceNamePrefix + "-AuthorizeEndpoint",
                EndpointConstructProps.builder()
                        .functionName(props.resourceNamePrefix + "-authorize")
                        .ecrRepositoryArn(props.ecrRepositoryArn)
                        .ecrRepositoryName(props.ecrRepositoryName)
                        .baseImageTag(props.baseImageTag)
                        .handler(List.of("app/functions/authorize.handler"))
                        .pathPattern("/authorize")
                        .allowedMethods(AllowedMethods.ALLOW_ALL)
                        .extraEnv(Map.of(
                                "USERS_TABLE", this.usersTable.getTableName(),
                                "CODES_TABLE", this.authCodesTable.getTableName()))
                        .build());
        this.authorizeEndpoint.function.addEnvironment("ISSUER", "https://" + props.domainName);
        this.additionalOriginsBehaviourMappings.put("/authorize", this.authorizeEndpoint.behaviorOptions);
        this.usersTable.grantReadData(this.authorizeEndpoint.function);
        this.authCodesTable.grantReadWriteData(this.authorizeEndpoint.function);

        // Token endpoint via construct
        this.tokenEndpoint = new EndpointConstruct(
                this,
                props.resourceNamePrefix + "-TokenEndpoint",
                EndpointConstructProps.builder()
                        .functionName(props.resourceNamePrefix + "-token")
                        .ecrRepositoryArn(props.ecrRepositoryArn)
                        .ecrRepositoryName(props.ecrRepositoryName)
                        .baseImageTag(props.baseImageTag)
                        .handler(List.of("app/functions/token.handler"))
                        .pathPattern("/token")
                        .allowedMethods(AllowedMethods.ALLOW_ALL)
                        .extraEnv(Map.of(
                                "USERS_TABLE", this.usersTable.getTableName(),
                                "REFRESH_TABLE", this.refreshTokensTable.getTableName(),
                                "CODES_TABLE", this.authCodesTable.getTableName()))
                        .build());
        this.tokenEndpoint.function.addEnvironment("ISSUER", "https://" + props.domainName);
        this.additionalOriginsBehaviourMappings.put("/token", this.tokenEndpoint.behaviorOptions);
        this.authCodesTable.grantReadWriteData(this.tokenEndpoint.function);
        this.refreshTokensTable.grantReadWriteData(this.tokenEndpoint.function);
        // Allow token Lambda to read user records for ID token claims
        this.usersTable.grantReadData(this.tokenEndpoint.function);

        // UserInfo endpoint via construct
        this.userinfoEndpoint = new EndpointConstruct(
                this,
                props.resourceNamePrefix + "-UserInfoEndpoint",
                EndpointConstructProps.builder()
                        .functionName(props.resourceNamePrefix + "-userinfo")
                        .ecrRepositoryArn(props.ecrRepositoryArn)
                        .ecrRepositoryName(props.ecrRepositoryName)
                        .baseImageTag(props.baseImageTag)
                        .handler(List.of("app/functions/userinfo.handler"))
                        .pathPattern("/userinfo")
                        .allowedMethods(AllowedMethods.ALLOW_ALL)
                        .extraEnv(Map.of("USERS_TABLE", this.usersTable.getTableName()))
                        .build());
        this.userinfoEndpoint.function.addEnvironment("ISSUER", "https://" + props.domainName);
        this.additionalOriginsBehaviourMappings.put("/userinfo", this.userinfoEndpoint.behaviorOptions);
        this.usersTable.grantReadData(this.userinfoEndpoint.function);

        // JWKS endpoint via construct
        this.jwksEndpoint = new EndpointConstruct(
                this,
                props.resourceNamePrefix + "-JwksEndpoint",
                EndpointConstructProps.builder()
                        .functionName(props.resourceNamePrefix + "-jwks")
                        .ecrRepositoryArn(props.ecrRepositoryArn)
                        .ecrRepositoryName(props.ecrRepositoryName)
                        .baseImageTag(props.baseImageTag)
                        .handler(List.of("app/functions/jwks.handler"))
                        .pathPattern("/jwks")
                        .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                        .extraEnv(Map.of("CODES_TABLE", this.authCodesTable.getTableName()))
                        .build());
        this.jwksEndpoint.function.addEnvironment("ISSUER", "https://" + props.domainName);
        this.additionalOriginsBehaviourMappings.put("/jwks", this.jwksEndpoint.behaviorOptions);
        this.authCodesTable.grantReadWriteData(this.jwksEndpoint.function);

        // Create a custom resource to fix the well-known configuration with correct domain
        // createWellKnownConfigFix(props.resourceNamePrefix, props.domainName);

        // Outputs
        new CfnOutput(
                this,
                "WellKnownBucketBucketName",
                CfnOutputProps.builder()
                        .value(this.wellKnownBucket.getBucketName())
                        .build());
        new CfnOutput(
                this,
                "WellKnownAccessIdentity",
                CfnOutputProps.builder()
                        .value(this.wellKnownOriginAccessIdentity.getOriginAccessIdentityId())
                        .build());
        new CfnOutput(
                this,
                "WellKnownId",
                CfnOutputProps.builder().value(this.wellKnownOrigin.toString()).build());
        new CfnOutput(
                this,
                "WellKnownCachePolicy",
                CfnOutputProps.builder()
                        .value(this.wellKnownCachePolicy.getCachePolicyId())
                        .build());
        new CfnOutput(
                this,
                "WellKnownBehaviorOptions",
                CfnOutputProps.builder()
                        .value(this.wellKnownBehaviorOptions.toString())
                        .build());
        new CfnOutput(
                this,
                "AuthorizeFunctionName",
                CfnOutputProps.builder()
                        .value(this.authorizeEndpoint.function.getFunctionName())
                        .build());
        new CfnOutput(
                this,
                "TokenFunctionName",
                CfnOutputProps.builder()
                        .value(this.tokenEndpoint.function.getFunctionName())
                        .build());
        new CfnOutput(
                this,
                "UserInfoFunctionName",
                CfnOutputProps.builder()
                        .value(this.userinfoEndpoint.function.getFunctionName())
                        .build());
        new CfnOutput(
                this,
                "JwksFunctionName",
                CfnOutputProps.builder()
                        .value(this.jwksEndpoint.function.getFunctionName())
                        .build());
        new CfnOutput(
                this,
                "UsersTableName",
                CfnOutputProps.builder().value(this.usersTable.getTableName()).build());
        new CfnOutput(
                this,
                "AuthCodesTableName",
                CfnOutputProps.builder()
                        .value(this.authCodesTable.getTableName())
                        .build());
        new CfnOutput(
                this,
                "RefreshTokensTableName",
                CfnOutputProps.builder()
                        .value(this.refreshTokensTable.getTableName())
                        .build());
    }
}
