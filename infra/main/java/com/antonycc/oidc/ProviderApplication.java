package com.antonycc.oidc;

import software.amazon.awscdk.App;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Environment;

import static com.antonycc.oidc.ResourceNameUtils.buildDashedDomainName;
import static com.antonycc.oidc.ResourceNameUtils.generateCompressedResourceNamePrefix;
import static com.antonycc.oidc.ResourceNameUtils.generateResourceNamePrefix;

public class ProviderApplication {

    public String envName;
    public String deploymentName;
    public String hostedZoneName;
    public String hostedZoneId;
    public String domainName;
    public String dashedDomainName;
    public String baseUrl;
    public String resourceNamePrefix;
    public String compressedResourceNamePrefix;
    public String baseImageTag;
    public String certificateArn;
    // public String authCertificateArn;
    public ObservabilityStack observabilityStack;
    public DevStack devStack;
    public AppStack appStack;
    public WebStack webStack;
    public OpsStack opsStack;

    public ProviderApplication() {}

    public static void main(final String[] args) {
        App app = new App();
        Environment env = Environment.builder()
                .account(System.getenv("CDK_DEFAULT_ACCOUNT"))
                .region(System.getenv("CDK_DEFAULT_REGION"))
                .build();
        ProviderApplication application = ProviderApplication.builder(app, env).build();
    }

    public static Builder builder(App app, Environment env) {
        return new Builder(app, env);
    }

    public static class Builder {
        public final App app;
        public final Environment env;
        public final ProviderApplication application;

        public Builder(App app, Environment env) {
            this.app = app;
            this.env = env;
            this.application = new ProviderApplication();
            this.application.envName = System.getenv().getOrDefault("ENV_NAME", "dev");
            this.application.deploymentName = System.getenv().getOrDefault("DEPLOYMENT_NAME", this.application.envName);
            this.application.hostedZoneName = System.getenv().getOrDefault("HOSTED_ZONE_NAME", "example.com");
            this.application.hostedZoneId = System.getenv().getOrDefault("HOSTED_ZONE_ID", "Z000EXAMPLE");
            this.application.baseImageTag = System.getenv().getOrDefault("BASE_IMAGE_TAG", "latest");

            // Compute domain name based on deployment pattern
            // String authDomainName;
            if ("prod".equals(this.application.deploymentName)) {
                this.application.domainName = System.getenv().getOrDefault("DOMAIN_NAME", "oidc.example.com");
                // this.authDomainName = System.getenv().getOrDefault("AUTH_DOMAIN_NAME", "auth.oidc.example.com");
            } else if ("ci".equals(this.application.deploymentName)) {
                this.application.domainName = System.getenv().getOrDefault("DOMAIN_NAME", "ci.oidc.example.com");
                // this.authDomainName = System.getenv().getOrDefault("AUTH_DOMAIN_NAME", "ci.auth.oidc.example.com");
            } else {
                // For branch deployments like ci-branchname
                this.application.domainName = System.getenv()
                        .getOrDefault("DOMAIN_NAME", this.application.deploymentName + ".oidc.example.com");
                // this.authDomainName = System.getenv().getOrDefault("AUTH_DOMAIN_NAME", deploymentName +
                // ".auth.oidc.example.com");
            }
            this.application.dashedDomainName =
                    buildDashedDomainName(this.application.envName, this.application.domainName);
            this.application.baseUrl = "https://" + this.application.domainName;

            // Generate predictable resource name prefix based on domain and environment
            this.application.resourceNamePrefix =
                    generateResourceNamePrefix(this.application.domainName, this.application.envName);
            this.application.compressedResourceNamePrefix =
                    generateCompressedResourceNamePrefix(this.application.domainName, this.application.envName);

            this.application.certificateArn = System.getenv()
                    .getOrDefault("CERTIFICATE_ARN", "arn:aws:acm:us-east-1:123456789012:certificate/abc");
            // this.authCertificateArn =
            //      System.getenv()
            //              .getOrDefault("AUTH_CERTIFICATE_ARN", "arn:aws:acm:us-east-1:123456789012:certificate/xyz");
        }

        public ProviderApplication build() {

            // Create the Observability stack first (logging, etc.)
            String observabilityStackId = "ObservabilityStack-%s".formatted(this.application.deploymentName);
            this.application.observabilityStack = new ObservabilityStack(
                    app,
                    observabilityStackId,
                    ObservabilityStackProps.builder()
                            .env(env)
                            .envName(this.application.envName)
                            .domainName(this.application.domainName)
                            .resourceNamePrefix(this.application.resourceNamePrefix)
                            .compressedResourceNamePrefix(this.application.compressedResourceNamePrefix)
                            .build());

            // Create DevStack with resources only used during development or deployment (e.g. ECR)
            String devStackId = "DevStack-%s".formatted(this.application.deploymentName);
            this.application.devStack = new DevStack(
                    app,
                    devStackId,
                    DevStackProps.builder()
                            .env(this.application.envName)
                            .hostedZoneName(this.application.hostedZoneName)
                            .domainName(this.application.domainName)
                            .dashedDomainName(this.application.dashedDomainName)
                            .resourceNamePrefix(this.application.resourceNamePrefix)
                            .compressedResourceNamePrefix(this.application.compressedResourceNamePrefix)
                            .build());

            // Create the App stack (Lambdas, DynamoDB, S3, CloudFront)
            String appStackId = "AppStack-%s".formatted(this.application.deploymentName);
            this.application.appStack = new AppStack(
                    app,
                    appStackId,
                    AppStackProps.builder()
                            .env(env)
                            .envName(this.application.envName)
                            .deploymentName(this.application.deploymentName)
                            .ecrRepositoryArn(this.application.devStack.ecrRepository.getRepositoryArn())
                            .ecrRepositoryName(this.application.devStack.ecrRepository.getRepositoryName())
                            .baseImageTag(this.application.baseImageTag)
                            .domainName(this.application.domainName)
                            .resourceNamePrefix(this.application.resourceNamePrefix)
                            .compressedResourceNamePrefix(this.application.compressedResourceNamePrefix)
                            .logsBucketName(this.application.observabilityStack.logsBucket.getBucketName())
                            .build());
            this.application.appStack.addDependency(this.application.observabilityStack);
            this.application.appStack.addDependency(this.application.devStack);

            // Create the Web stack (S3, CloudFront, Route53)
            String webStackId = "WebStack-%s".formatted(this.application.deploymentName);
            this.application.webStack = new WebStack(
                    app,
                    webStackId,
                    WebStackProps.builder()
                            .env(env)
                            .envName(this.application.envName)
                            .deploymentName(this.application.deploymentName)
                            .hostedZoneName(this.application.hostedZoneName)
                            .hostedZoneId(this.application.hostedZoneId)
                            .domainName(this.application.domainName)
                            .baseUrl(this.application.baseUrl)
                            .resourceNamePrefix(this.application.resourceNamePrefix)
                            .compressedResourceNamePrefix(this.application.compressedResourceNamePrefix)
                            .certificateArn(this.application.certificateArn)
                            .logsBucketArn(this.application.observabilityStack.logsBucket.getBucketArn())
                            .wellKnownBucketArn(this.application.appStack.wellKnownBucket.getBucketArn())
                            .jwksEndpointFunctionArn(this.application.appStack.jwksEndpoint.function.getFunctionArn())
                            .authorizeEndpointFunctionArn(
                                    this.application.appStack.authorizeEndpoint.function.getFunctionArn())
                            .tokenEndpointFunctionArn(this.application.appStack.tokenEndpoint.function.getFunctionArn())
                            .userinfoEndpointFunctionArn(
                                    this.application.appStack.userinfoEndpoint.function.getFunctionArn())
                            .build());
            this.application.webStack.addDependency(this.application.observabilityStack);
            this.application.webStack.addDependency(this.application.appStack);

            // Create the Ops stack (Alarms, etc.)
            String opsStackId = "OpsStack-%s".formatted(this.application.deploymentName);
            this.application.opsStack = new OpsStack(
                    app,
                    opsStackId,
                    OpsStackProps.builder()
                            .env(env)
                            .envName(this.application.envName)
                            .deploymentName(this.application.deploymentName)
                            .domainName(this.application.domainName)
                            .resourceNamePrefix(this.application.resourceNamePrefix)
                            .compressedResourceNamePrefix(this.application.compressedResourceNamePrefix)
                            .jwksEndpointFunctionArn(this.application.appStack.jwksEndpoint.function.getFunctionArn())
                            .authorizeEndpointFunctionArn(
                                    this.application.appStack.authorizeEndpoint.function.getFunctionArn())
                            .tokenEndpointFunctionArn(this.application.appStack.tokenEndpoint.function.getFunctionArn())
                            .userinfoEndpointFunctionArn(
                                    this.application.appStack.userinfoEndpoint.function.getFunctionArn())
                            .usersTableArn(this.application.appStack.usersTable.getTableArn())
                            .authCodesTableArn(this.application.appStack.authCodesTable.getTableArn())
                            .refreshTokensTableArn(this.application.appStack.refreshTokensTable.getTableArn())
                            .distributionId(this.application.webStack.distribution.getDistributionId())
                            .build());
            this.application.opsStack.addDependency(this.application.appStack);
            this.application.opsStack.addDependency(this.application.webStack);

            app.synth();

            CfnOutputProps cfnOutputProps = CfnOutputProps.builder()
                    .exportName("BaseUrl")
                    .value(this.application.baseUrl)
                    .build();

            return this.application;
        }
    }
}
