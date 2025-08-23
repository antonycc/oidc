package com.antonycc.oidc;

import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.Environment;

public class App {
  public static void main(final String[] args) {
    var app = new software.amazon.awscdk.App();

    String envName = System.getenv().getOrDefault("ENV_NAME", "dev");
    String hostedZoneName = System.getenv().getOrDefault("HOSTED_ZONE_NAME", "example.com");
    String hostedZoneId   = System.getenv().getOrDefault("HOSTED_ZONE_ID", "Z000EXAMPLE");
    String domainName     = System.getenv().getOrDefault("DOMAIN_NAME", "oidc.example.com");
    String certificateArn = System.getenv().getOrDefault("CERTIFICATE_ARN", "arn:aws:acm:us-east-1:123456789012:certificate/abc");
    String cognitoPrefix  = System.getenv().getOrDefault("COGNITO_DOMAIN_PREFIX", "oidc-"+envName);

    new OidcStack(app, "OidcProviderStack-" + envName, OidcStackProps.builder()
        .env(Environment.builder()
            .account(System.getenv("CDK_DEFAULT_ACCOUNT"))
            .region(System.getenv("CDK_DEFAULT_REGION"))
            .build())
        .envName(envName)
        .hostedZoneName(hostedZoneName)
        .hostedZoneId(hostedZoneId)
        .domainName(domainName)
        .certificateArn(certificateArn)
        .cognitoDomainPrefix(cognitoPrefix)
        .build());

    app.synth();
  }
}