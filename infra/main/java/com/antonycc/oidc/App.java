package com.antonycc.oidc;

import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.Environment;

public class App {
  public static void main(final String[] args) {
    var app = new software.amazon.awscdk.App();

    String envName = System.getenv().getOrDefault("ENV_NAME", "dev");
    String hostedZoneName = System.getenv().getOrDefault("HOSTED_ZONE_NAME", "");
    String hostedZoneId   = System.getenv().getOrDefault("HOSTED_ZONE_ID", "");
    String domainName     = System.getenv().getOrDefault("DOMAIN_NAME", "");
    String certificateArn = System.getenv().getOrDefault("CERTIFICATE_ARN", "");
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