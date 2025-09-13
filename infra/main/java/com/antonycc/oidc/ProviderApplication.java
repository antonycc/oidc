package com.antonycc.oidc;

import software.amazon.awscdk.Environment;

import static com.antonycc.oidc.ResourceNameUtils.buildDashedDomainName;
import static com.antonycc.oidc.ResourceNameUtils.generateCompressedResourceNamePrefix;
import static com.antonycc.oidc.ResourceNameUtils.generateResourceNamePrefix;

public class ProviderApplication {
    public static void main(final String[] args) {
        var app = new software.amazon.awscdk.App();

        String envName = System.getenv().getOrDefault("ENV_NAME", "dev");
        String deploymentName = System.getenv().getOrDefault("DEPLOYMENT_NAME", envName);
        String hostedZoneName = System.getenv().getOrDefault("HOSTED_ZONE_NAME", "example.com");
        String hostedZoneId = System.getenv().getOrDefault("HOSTED_ZONE_ID", "Z000EXAMPLE");
        String baseImageTag = System.getenv().getOrDefault("BASE_IMAGE_TAG", "latest");

        // Compute domain name based on deployment pattern
        String domainName;
        // String authDomainName;
        if ("prod".equals(deploymentName)) {
            domainName = System.getenv().getOrDefault("DOMAIN_NAME", "oidc.example.com");
            // authDomainName = System.getenv().getOrDefault("AUTH_DOMAIN_NAME", "auth.oidc.example.com");
        } else if ("ci".equals(deploymentName)) {
            domainName = System.getenv().getOrDefault("DOMAIN_NAME", "ci.oidc.example.com");
            // authDomainName = System.getenv().getOrDefault("AUTH_DOMAIN_NAME", "ci.auth.oidc.example.com");
        } else {
            // For branch deployments like ci-branchname
            domainName = System.getenv().getOrDefault("DOMAIN_NAME", deploymentName + ".oidc.example.com");
            // authDomainName = System.getenv().getOrDefault("AUTH_DOMAIN_NAME", deploymentName +
            // ".auth.oidc.example.com");
        }
        String dashedDomainName = buildDashedDomainName(envName, domainName);

        // Generate predictable resource name prefix based on domain and environment
        String resourceNamePrefix = generateResourceNamePrefix(domainName, envName);
        String compressedResourceNamePrefix = generateCompressedResourceNamePrefix(domainName, envName);

        String certificateArn =
                System.getenv().getOrDefault("CERTIFICATE_ARN", "arn:aws:acm:us-east-1:123456789012:certificate/abc");
        // String authCertificateArn =
        //      System.getenv()
        //              .getOrDefault("AUTH_CERTIFICATE_ARN", "arn:aws:acm:us-east-1:123456789012:certificate/xyz");

        Environment env = Environment.builder()
                .account(System.getenv("CDK_DEFAULT_ACCOUNT"))
                .region(System.getenv("CDK_DEFAULT_REGION"))
                .build();

        // Create the Observability stack first (logging, etc.)
        ObservabilityStack observabilityStack = new ObservabilityStack(
                app,
                "ObservabilityStack-" + envName,
                ObservabilityStackProps.builder()
                        .env(env)
                        .envName(envName)
                        .domainName(domainName)
                        .resourceNamePrefix(resourceNamePrefix)
                        .compressedResourceNamePrefix(compressedResourceNamePrefix)
                        .build());

        // Create DevStack with resources only used during development or deployment (e.g. ECR)
        String devStackId = "DevStack-%s".formatted(envName);
        DevStack devStack = new DevStack(
                app,
                devStackId,
                DevStackProps.builder()
                        .env(envName)
                        .hostedZoneName(hostedZoneName)
                        .domainName(domainName)
                        .dashedDomainName(dashedDomainName)
                        .resourceNamePrefix(resourceNamePrefix)
                        .compressedResourceNamePrefix(compressedResourceNamePrefix)
                        .build());
        devStack.addDependency(observabilityStack);

        // Create the App stack (Lambdas, DynamoDB, S3, CloudFront)
        AppStack appStack = new AppStack(
                app,
                "AppStack-" + deploymentName,
                AppStackProps.builder()
                        .env(env)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .ecrRepositoryArn(devStack.ecrRepository.getRepositoryArn())
                        .ecrRepositoryName(devStack.ecrRepository.getRepositoryName())
                        .baseImageTag(baseImageTag)
                        .domainName(domainName)
                        .resourceNamePrefix(resourceNamePrefix)
                        .compressedResourceNamePrefix(compressedResourceNamePrefix)
                        .logsBucketName(observabilityStack.logsBucket.getBucketName())
                        .build());
        appStack.addDependency(observabilityStack);
        appStack.addDependency(devStack);

        // Create the Web stack (S3, CloudFront, Route53)
        WebStack webStack = new WebStack(
                app,
                "WebStack-" + deploymentName,
                WebStackProps.builder()
                        .env(env)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .hostedZoneName(hostedZoneName)
                        .hostedZoneId(hostedZoneId)
                        .domainName(domainName)
                        .resourceNamePrefix(resourceNamePrefix)
                        .compressedResourceNamePrefix(compressedResourceNamePrefix)
                        .certificateArn(certificateArn)
                        .logsBucketArn(observabilityStack.logsBucket.getBucketArn())
                        .wellKnownBucketArn(appStack.wellKnownBucket.getBucketArn())
                        .jwksEndpointFunctionArn(appStack.jwksEndpoint.function.getFunctionArn())
                        .authorizeEndpointFunctionArn(appStack.authorizeEndpoint.function.getFunctionArn())
                        .tokenEndpointFunctionArn(appStack.tokenEndpoint.function.getFunctionArn())
                        .userinfoEndpointFunctionArn(appStack.userinfoEndpoint.function.getFunctionArn())
                        .build());
        webStack.addDependency(observabilityStack);
        webStack.addDependency(devStack);
        webStack.addDependency(appStack);

        // Create the Ops stack (Alarms, etc.)
        OpsStack opsStack = new OpsStack(
                app,
                "OpsStack-" + deploymentName,
                OpsStackProps.builder()
                        .env(env)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .domainName(domainName)
                        .resourceNamePrefix(resourceNamePrefix)
                        .compressedResourceNamePrefix(compressedResourceNamePrefix)
                        .jwksEndpointFunctionArn(appStack.jwksEndpoint.function.getFunctionArn())
                        .authorizeEndpointFunctionArn(appStack.authorizeEndpoint.function.getFunctionArn())
                        .tokenEndpointFunctionArn(appStack.tokenEndpoint.function.getFunctionArn())
                        .userinfoEndpointFunctionArn(appStack.userinfoEndpoint.function.getFunctionArn())
                        .usersTableArn(appStack.usersTable.getTableArn())
                        .authCodesTableArn(appStack.authCodesTable.getTableArn())
                        .refreshTokensTableArn(appStack.refreshTokensTable.getTableArn())
                        .distributionId(webStack.distribution.getDistributionId())
                        .build());
        opsStack.addDependency(observabilityStack);
        opsStack.addDependency(devStack);
        opsStack.addDependency(appStack);
        opsStack.addDependency(webStack);

        app.synth();
    }
}
