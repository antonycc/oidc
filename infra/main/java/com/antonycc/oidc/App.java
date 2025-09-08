package com.antonycc.oidc;

import software.amazon.awscdk.Environment;

public class App {
  public static void main(final String[] args) {
    var app = new software.amazon.awscdk.App();

    String envName = System.getenv().getOrDefault("ENV_NAME", "dev");
    String deploymentName = System.getenv().getOrDefault("DEPLOYMENT_NAME", envName);
    String hostedZoneName = System.getenv().getOrDefault("HOSTED_ZONE_NAME", "example.com");
    String hostedZoneId = System.getenv().getOrDefault("HOSTED_ZONE_ID", "Z000EXAMPLE");

    // Compute domain name based on deployment pattern
    String domainName;
    // String authDomainName;
    if ("prod".equals(deploymentName)) {
      domainName = System.getenv().getOrDefault("DOMAIN_NAME", "oidc.example.com");
      // authDomainName = System.getenv().getOrDefault("AUTH_DOMAIN_NAME", "auth.oidc.example.com");
    } else if ("ci".equals(deploymentName)) {
      domainName = System.getenv().getOrDefault("DOMAIN_NAME", "ci.oidc.example.com");
      // authDomainName = System.getenv().getOrDefault("AUTH_DOMAIN_NAME",
      // "ci.auth.oidc.example.com");
    } else {
      // For branch deployments like ci-branchname
      domainName =
          System.getenv().getOrDefault("DOMAIN_NAME", deploymentName + ".oidc.example.com");
      // authDomainName = System.getenv().getOrDefault("AUTH_DOMAIN_NAME", deploymentName +
      // ".auth.oidc.example.com");
    }

    String certificateArn =
        System.getenv()
            .getOrDefault("CERTIFICATE_ARN", "arn:aws:acm:us-east-1:123456789012:certificate/abc");
    // String authCertificateArn =
    //      System.getenv()
    //              .getOrDefault("AUTH_CERTIFICATE_ARN",
    // "arn:aws:acm:us-east-1:123456789012:certificate/xyz");

    Environment env =
        Environment.builder()
            .account(System.getenv("CDK_DEFAULT_ACCOUNT"))
            .region(System.getenv("CDK_DEFAULT_REGION"))
            .build();

    // Create the Observability stack first (logging, monitoring, etc.)
    ObservabilityStack observabilityStack =
        new ObservabilityStack(
            app,
            "ObservabilityStack-" + envName,
            ObservabilityStackProps.builder()
                .env(env)
                .envName(envName)
                .domainName(domainName)
                .build());

    // Create the OIDC Provider stack (Lambdas, DynamoDB, S3, CloudFront, Route53)
    OidcProviderStack providerStack =
        new OidcProviderStack(
            app,
            "OidcProviderStack-" + deploymentName,
            OidcProviderStackProps.builder()
                .env(env)
                .envName(envName)
                .deploymentName(deploymentName)
                .hostedZoneName(hostedZoneName)
                .hostedZoneId(hostedZoneId)
                .domainName(domainName)
                .certificateArn(certificateArn)
                .logsBucket(observabilityStack.logsBucket)
                .trailLogGroup(observabilityStack.trailLogGroup)
                .auditTrail(observabilityStack.auditTrail)
                .xrayGroup(observabilityStack.xrayGroup)
                .build());
    providerStack.addDependency(observabilityStack);

    app.synth();
  }
}
