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
    public EdgeStack edgeStack;
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

    private static String getConfig(String key, String defaultValue) {
        String v = System.getProperty(key);
        if (v != null && !v.isEmpty()) return v;
        v = System.getenv(key);
        if (v != null && !v.isEmpty()) return v;
        return defaultValue;
    }

    public static class Builder {
        public final App app;
        public final Environment env;
        public final ProviderApplication application;

        public Builder(App app, Environment env) {
            this.app = app;
            this.env = env;
            this.application = new ProviderApplication();
            this.application.envName = getConfig("ENV_NAME", "dev");
            this.application.deploymentName = getConfig("DEPLOYMENT_NAME", this.application.envName);
            this.application.hostedZoneName = getConfig("HOSTED_ZONE_NAME", "dev.oidc.antonycc.com");
            this.application.hostedZoneId = getConfig("HOSTED_ZONE_ID", "Z000OIDCDEV");
            this.application.baseImageTag = getConfig("BASE_IMAGE_TAG", "dev-tag");

            // Compute domain name based on deployment pattern
            // String authDomainName;
            if ("prod".equals(this.application.deploymentName)) {
                this.application.domainName = getConfig("DOMAIN_NAME", "dev.oidc.antonycc.com");
                // this.authDomainName = System.getenv().getOrDefault("AUTH_DOMAIN_NAME", "auth.oidc.example.com");
            } else if ("ci".equals(this.application.deploymentName)) {
                this.application.domainName = getConfig("DOMAIN_NAME", "ci.dev.oidc.antonycc.com");
                // this.authDomainName = System.getenv().getOrDefault("AUTH_DOMAIN_NAME", "ci.auth.oidc.example.com");
            } else {
                // For branch deployments like ci-branchname
                this.application.domainName =
                        getConfig("DOMAIN_NAME", this.application.deploymentName + ".dev.oidc.antonycc.com");
                // this.authDomainName = System.getenv().getOrDefault("AUTH_DOMAIN_NAME", deploymentName +
                // ".auth.oidc.example.com");
            }
            this.application.dashedDomainName = buildDashedDomainName(
                    this.application.envName, this.application.deploymentName, this.application.domainName);
            this.application.baseUrl = "https://" + this.application.domainName;

            // Generate predictable resource name prefix based on domain and environment
            this.application.resourceNamePrefix =
                    generateResourceNamePrefix(this.application.domainName, this.application.envName);
            this.application.compressedResourceNamePrefix =
                    generateCompressedResourceNamePrefix(this.application.domainName, this.application.envName);

            this.application.certificateArn =
                    getConfig("CERTIFICATE_ARN", "arn:aws:acm:us-east-1:123456789012:certificate/abc");
            // this.authCertificateArn =
            //      System.getenv()
            //              .getOrDefault("AUTH_CERTIFICATE_ARN", "arn:aws:acm:us-east-1:123456789012:certificate/xyz");
        }

        public ProviderApplication build() {

            // Create the Observability stack first (logging, etc.)
            String observabilityStackId = "%s-ObservabilityStack".formatted(this.application.deploymentName);
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
            String devStackId = "%s-DevStack".formatted(this.application.deploymentName);
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
            String appStackId = "%s-AppStack".formatted(this.application.deploymentName);
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
                            .build());
            this.application.appStack.addDependency(this.application.devStack);

            // Create the Web stack (S3 origin)
            String webStackId = "%s-WebStack".formatted(this.application.deploymentName);
            this.application.webStack = new WebStack(
                    app,
                    webStackId,
                    WebStackProps.builder()
                            .env(env)
                            .envName(this.application.envName)
                            .deploymentName(this.application.deploymentName)
                            .domainName(this.application.domainName)
                            .resourceNamePrefix(this.application.resourceNamePrefix)
                            .compressedResourceNamePrefix(this.application.compressedResourceNamePrefix)
                            .build());

            // Create the Edge stack (CloudFront, Route53)
            String edgeStackId = "%s-EdgeStack".formatted(this.application.deploymentName);
            this.application.edgeStack = new EdgeStack(
                    app,
                    edgeStackId,
                    EdgeStackProps.builder()
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
                            .webBucket(this.application.webStack.webBucket)
                            .wellKnownBucket(this.application.appStack.wellKnownBucket)
                            .jwksEndpointFunctionArn(this.application.appStack.jwksEndpoint.function.getFunctionArn())
                            .authorizeEndpointFunctionArn(
                                    this.application.appStack.authorizeEndpoint.function.getFunctionArn())
                            .tokenEndpointFunctionArn(this.application.appStack.tokenEndpoint.function.getFunctionArn())
                            .userinfoEndpointFunctionArn(
                                    this.application.appStack.userinfoEndpoint.function.getFunctionArn())
                            .additionalOriginsBehaviourMappings(
                                    this.application.appStack.additionalOriginsBehaviourMappings)
                            .build());
            this.application.edgeStack.addDependency(this.application.observabilityStack);
            this.application.edgeStack.addDependency(this.application.appStack);
            this.application.edgeStack.addDependency(this.application.webStack);

            // Create the Ops stack (Alarms, etc.)
            String opsStackId = "%s-OpsStack".formatted(this.application.deploymentName);
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
                            .build());
            this.application.opsStack.addDependency(this.application.appStack);
            this.application.opsStack.addDependency(this.application.webStack);

            app.synth();

            CfnOutputProps.builder()
                    .exportName("%s-EnvName".formatted(this.application.deploymentName))
                    .value(this.application.envName)
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-DeploymentName".formatted(this.application.deploymentName))
                    .value(this.application.deploymentName)
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-HostedZoneName".formatted(this.application.deploymentName))
                    .value(this.application.hostedZoneName)
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-HostedZoneId".formatted(this.application.deploymentName))
                    .value(this.application.hostedZoneId)
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-DomainName".formatted(this.application.deploymentName))
                    .value(this.application.domainName)
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-DashedDomainName".formatted(this.application.deploymentName))
                    .value(this.application.dashedDomainName)
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-BaseUrl".formatted(this.application.deploymentName))
                    .value(this.application.baseUrl)
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-ResourceNamePrefix".formatted(this.application.deploymentName))
                    .value(this.application.resourceNamePrefix)
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-CompressedResourceNamePrefix".formatted(this.application.deploymentName))
                    .value(this.application.compressedResourceNamePrefix)
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-BaseImageTag".formatted(this.application.deploymentName))
                    .value(this.application.baseImageTag)
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-CertificateArn".formatted(this.application.deploymentName))
                    .value(this.application.certificateArn)
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-EcrRepositoryName".formatted(this.application.deploymentName))
                    .value(this.application.devStack.ecrRepository.getRepositoryName())
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-EcrRepositoryArn".formatted(this.application.deploymentName))
                    .value(this.application.devStack.ecrRepository.getRepositoryArn())
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-ObservabilityStackName".formatted(this.application.deploymentName))
                    .value(this.application.observabilityStack.getStackName())
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-DevStackName".formatted(this.application.deploymentName))
                    .value(this.application.devStack.getStackName())
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-AppStackName".formatted(this.application.deploymentName))
                    .value(this.application.appStack.getStackName())
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-WebStackName".formatted(this.application.deploymentName))
                    .value(this.application.webStack.getStackName())
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-EdgeStackName".formatted(this.application.deploymentName))
                    .value(this.application.edgeStack.getStackName())
                    .build();
            CfnOutputProps.builder()
                    .exportName("%s-OpsStackName".formatted(this.application.deploymentName))
                    .value(this.application.opsStack.getStackName())
                    .build();

            return this.application;
        }
    }
}
