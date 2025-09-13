package com.antonycc.oidc;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.customresources.AwsSdkCall;
import software.amazon.awscdk.customresources.PhysicalResourceId;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.dynamodb.Attribute;
import software.amazon.awscdk.services.dynamodb.AttributeType;
import software.amazon.awscdk.services.dynamodb.BillingMode;
import software.amazon.awscdk.services.dynamodb.PointInTimeRecoverySpecification;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.dynamodb.TableEncryption;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.IBucket;
import software.constructs.Construct;

public class ProviderStack extends Stack {
    public final S3OriginBucket wellKnownOriginBucket;
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
    public final Map<String, BehaviorOptions> additionalOriginsBehaviourMappings;

    public ProviderStack(final Construct scope, final String id, final ProviderStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName);
        Tags.of(this).add("Application", "oidc-provider");
        Tags.of(this).add("CostCenter", "authentication");
        Tags.of(this).add("Owner", "platform-team");
        Tags.of(this).add("Project", "identity-management");
        Tags.of(this).add("DeploymentName", props.deploymentName);
        Tags.of(this).add("Stack", "ProviderStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-oidc");
        Tags.of(this).add("Criticality", "high");
        Tags.of(this).add("DataClassification", "confidential");
        Tags.of(this).add("BackupRequired", "true");
        Tags.of(this).add("MonitoringEnabled", "true");

        this.additionalOriginsBehaviourMappings = new HashMap<String, BehaviorOptions>();

        // Use Resources from the passed props
        IBucket logsBucket = Bucket.fromBucketName(this, "LogsBucket", props.logsBucketName);

        // Buckets

        // Well-known origin bucket
        this.wellKnownOriginBucket = new S3OriginBucket(
                this,
                props.resourceNamePrefix + "-WellKnownBucket",
                S3OriginBucketProps.builder()
                        .bucketNameSuffix("well-known")
                        .logsPrefix("s3/well-known/")
                        .oaiComment("Identity created for access to the Well Known origin bucket via the CloudFront"
                                + " distribution")
                        // .logsBucket(logsBucket)
                        .bucketType(S3OriginBucketType.WELL_KNOWN)
                        .build());
        this.wellKnownBucket = this.wellKnownOriginBucket.bucket;
        this.wellKnownOriginAccessIdentity = this.wellKnownOriginBucket.originAccessIdentity;
        this.shortTtl = this.wellKnownOriginBucket.cachePolicy;
        BehaviorOptions wellKnownOriginBehaviorOptions = this.wellKnownOriginBucket.behaviorOptions;
        this.additionalOriginsBehaviourMappings.put("/.well-known/*", wellKnownOriginBehaviorOptions);

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
        this.authorizeEndpoint = new EndpointFunction(
                this,
                props.resourceNamePrefix + "-AuthorizeEndpoint",
                EndpointFunctionProps.builder()
                        .functionName(props.compressedResourceNamePrefix + "-authorize")
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
        this.tokenEndpoint = new EndpointFunction(
                this,
                props.resourceNamePrefix + "-TokenEndpoint",
                EndpointFunctionProps.builder()
                        .functionName(props.compressedResourceNamePrefix + "-token")
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
        this.userinfoEndpoint = new EndpointFunction(
                this,
                props.resourceNamePrefix + "-UserInfoEndpoint",
                EndpointFunctionProps.builder()
                        .functionName(props.compressedResourceNamePrefix + "-userinfo")
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
        this.jwksEndpoint = new EndpointFunction(
                this,
                props.resourceNamePrefix + "-JwksEndpoint",
                EndpointFunctionProps.builder()
                        .functionName(props.compressedResourceNamePrefix + "-jwks")
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
        createWellKnownConfigFix(props.resourceNamePrefix, props.domainName);

        // Outputs
        new CfnOutput(
                this,
                "WellKnownBucketName",
                CfnOutputProps.builder()
                        .value(this.wellKnownBucket.getBucketName())
                        .build());
        new CfnOutput(
                this,
                "UsersTableName",
                CfnOutputProps.builder().value(this.usersTable.getTableName()).build());
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
        /*
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
        //wellKnownConfigCustomResource.getNode().addDependency(this.wellKnownDeployment);

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
        */
    }
}
