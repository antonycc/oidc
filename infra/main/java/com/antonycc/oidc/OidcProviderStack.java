package com.antonycc.oidc;

import software.amazon.awscdk.AssetHashType;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Expiration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudfront.SSLMethod;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.dynamodb.Attribute;
import software.amazon.awscdk.services.dynamodb.AttributeType;
import software.amazon.awscdk.services.dynamodb.BillingMode;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.Permission;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.route53.ARecord;
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
  // OIDC Provider specific resources
  public final Table usersTable;
  public final Table authCodesTable;
  public final Table refreshTokensTable;
  public final OidcEndpointFunction authorizeEndpoint;
  public final OidcEndpointFunction tokenEndpoint;
  public final OidcEndpointFunction userinfoEndpoint;
  public final OidcEndpointFunction jwksEndpoint;
  public final Distribution distribution;
  public final ARecord aliasRecord;
  public final BucketDeployment webDeployment;
  public final BucketDeployment wellKnownDeployment;

  public OidcProviderStack(
      final Construct scope, final String id, final OidcProviderStackProps props) {
    super(scope, id, props);

    var additionalOriginsBehaviourMappings = new HashMap<String, BehaviorOptions>();
    
    // Generate predictable resource name prefix based on domain and deployment name
    String resourceNamePrefix = generateResourceNamePrefix(props.domainName, props.deploymentName);
    String compressedResourceNamePrefix = generateCompressedResourceNamePrefix(props.domainName, props.deploymentName);

    // Use edge resources from the passed props
    this.logsBucket = props.logsBucket;
    this.trailLogGroup = props.trailLogGroup;
    this.auditTrail = props.auditTrail;
    this.xrayGroup = props.xrayGroup;
    this.webOriginBucket = props.webOriginBucket;
    this.wellKnownOriginBucket = props.wellKnownOriginBucket;
    this.webBucket = props.webBucket;
    this.webOriginAccessIdentity = props.webOriginAccessIdentity;
    this.wellKnownBucket = props.wellKnownBucket;
    this.wellKnownOriginAccessIdentity = props.wellKnownOriginAccessIdentity;
    this.shortTtl = props.shortTtl;

    String domainName = props.domainName;
    this.baseUrl = "https://" + domainName;

    // Add well-known behavior to additional behaviors mapping
    additionalOriginsBehaviourMappings.put("/.well-known/*", props.wellKnownOriginBehaviorOptions);

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
            .functionName(compressedResourceNamePrefix + "-authorize")
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
            .functionName(compressedResourceNamePrefix + "-token")
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
    // Allow token Lambda to read user records for ID token claims
    this.usersTable.grantReadData(this.tokenEndpoint.function);

    // UserInfo endpoint via construct
    this.userinfoEndpoint = new OidcEndpointFunction(
        this,
        resourceNamePrefix + "-UserInfoEndpoint",
        OidcEndpointFunctionProps.builder()
            .functionName(compressedResourceNamePrefix + "-userinfo")
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

    // JWKS endpoint via construct
    this.jwksEndpoint = new OidcEndpointFunction(
        this,
        resourceNamePrefix + "-JwksEndpoint",
        OidcEndpointFunctionProps.builder()
            .functionName(compressedResourceNamePrefix + "-jwks")
            .dockerfilePath("infra/runtimes/jwks.Dockerfile")
            .cmd(List.of("app/functions/jwks.handler"))
            .pathPattern("/jwks")
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            .extraEnv(Map.of(
                "CODES_TABLE", this.authCodesTable.getTableName()
            ))
            .build());
    this.jwksEndpoint.function.addEnvironment("ISSUER", "https://" + domainName);
    additionalOriginsBehaviourMappings.put("/jwks", this.jwksEndpoint.behaviorOptions);
    this.authCodesTable.grantReadWriteData(this.jwksEndpoint.function);

    // Use EdgeStack's centralized distribution configuration
    // This consolidates all CloudFront logic in EdgeStack while avoiding circular dependencies
    this.distribution = props.edgeStack.createDistribution(
        this,
        resourceNamePrefix + "-Distribution",
        additionalOriginsBehaviourMappings,
        "OIDC Provider distribution for " + domainName);

    // DNS record is created by EdgeStack's createDistribution method
    this.aliasRecord = null; // EdgeStack manages the alias record

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
    this.jwksEndpoint.function.addPermission(compressedResourceNamePrefix + "-cf-jwks", invokeFunctionUrlPermission);

    // The alias record was created by EdgeStack alongside the distribution

    // Deploy the web website files to the web website bucket and invalidate distribution
    var deployPostfix = java.util.UUID.randomUUID().toString().substring(0, 8);
    var webDocRootSource =
        Source.asset("web", AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
    var webDeploymentLogGroup =
          LogGroup.Builder.create(this, resourceNamePrefix + "-WebDeploymentLogGroup")
              .logGroupName("/aws/vendedlogs/bucketdeployment/" + compressedResourceNamePrefix + "-web-" + deployPostfix)
              .retention(RetentionDays.ONE_WEEK)
              .removalPolicy(RemovalPolicy.DESTROY)
              .build();
    this.webDeployment =
        BucketDeployment.Builder.create(this, resourceNamePrefix + "-DocRootToWebOriginDeployment")
            .sources(List.of(webDocRootSource))
            .destinationBucket(this.webBucket)
            .distribution(this.distribution)
            .distributionPaths(List.of("/*"))
            .retainOnDelete(false)
            .logGroup(webDeploymentLogGroup)
            .expires(Expiration.after(Duration.minutes(5)))
            .prune(true)
            .build();

    // Deploy the well-known website files to the well-known bucket under /.well-known/ and invalidate distribution
    var wellKnownRootSource =
        Source.asset(
            "well-known", AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
    var wellKnownDeploymentLogGroup =
          LogGroup.Builder.create(this, resourceNamePrefix + "-WellKnownDeploymentLogGroup")
                  .logGroupName("/aws/vendedlogs/bucketdeployment/" + compressedResourceNamePrefix + "-wk-" + deployPostfix)
                  .retention(RetentionDays.ONE_WEEK)
                  .removalPolicy(RemovalPolicy.DESTROY)
                  .build();
    this.wellKnownDeployment =
        BucketDeployment.Builder.create(this, resourceNamePrefix + "-DocRootToWellKnownOriginDeployment")
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

    // Outputs
    new CfnOutput(this, "BaseUrl", CfnOutputProps.builder().value("https://" + domainName).build());
    new CfnOutput(
        this,
        "DistributionId",
        CfnOutputProps.builder().value(this.distribution.getDistributionId()).build());
    new CfnOutput(
        this,
        "UsersTableName",
        CfnOutputProps.builder().value(this.usersTable.getTableName()).build());
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
}
