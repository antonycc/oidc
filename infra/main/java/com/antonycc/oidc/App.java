package com.antonycc.oidc;

import software.amazon.awscdk.Environment;

public class App {
  public static void main(final String[] args) {
    var app = new software.amazon.awscdk.App();

    String envName = System.getenv().getOrDefault("ENV_NAME", "dev");
    String hostedZoneName = System.getenv().getOrDefault("HOSTED_ZONE_NAME", "example.com");
    String hostedZoneId = System.getenv().getOrDefault("HOSTED_ZONE_ID", "Z000EXAMPLE");
    String domainName = System.getenv().getOrDefault("DOMAIN_NAME", "oidc.example.com");
    String certificateArn =
        System.getenv()
            .getOrDefault("CERTIFICATE_ARN", "arn:aws:acm:us-east-1:123456789012:certificate/abc");
    String cognitoPrefix = System.getenv().getOrDefault("COGNITO_DOMAIN_PREFIX", "oidc-" + envName);
    String authCertificateArn =
          System.getenv()
                  .getOrDefault("AUTH_CERTIFICATE_ARN", "arn:aws:acm:us-east-1:123456789012:certificate/xyz");

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
            "OidcProviderStack-" + envName,
            OidcProviderStackProps.builder()
                .env(env)
                .envName(envName)
                .hostedZoneName(hostedZoneName)
                .hostedZoneId(hostedZoneId)
                .domainName(domainName)
                .certificateArn(certificateArn)
                .logsBucket(observabilityStack.logsBucket)
                .trailLogGroup(observabilityStack.trailLogGroup)
                .auditTrail(observabilityStack.auditTrail)
                .xrayGroup(observabilityStack.xrayGroup)
                .build());

    // Create the Cognito stack (independent of provider stack)
    CognitoStack cognitoStack =
        new CognitoStack(
            app,
            "CognitoStack-" + envName,
            CognitoStackProps.builder()
                .env(env)
                .envName(envName)
                .domainName(domainName)
                .cognitoDomainPrefix(cognitoPrefix)
                .authCertificateArn(authCertificateArn)
                .hostedZoneName(hostedZoneName)
                .hostedZoneId(hostedZoneId)
                .build());

    providerStack.addDependency(observabilityStack);
    cognitoStack.addDependency(providerStack);

    app.synth();
  }
}
