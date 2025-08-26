package com.antonycc.oidc;

import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StageSynthesisOptions;

class SynthTest {
  @Test
  void cdkSynthCompiles() {
      var app = new App();

    Environment env = Environment.builder().account("123456789012").region("us-east-1").build();

    // Create the OIDC Provider stack first
    OidcProviderStack providerStack =
        new OidcProviderStack(
            app,
            "TestOidcProviderStack",
            OidcProviderStackProps.builder()
                .env(env)
                .envName("test")
                .hostedZoneName("example.com")
                .hostedZoneId("Z000EXAMPLE")
                .domainName("oidc.example.com")
                .certificateArn("arn:aws:acm:us-east-1:123456789012:certificate/abc")
                .build());

    // Create the Cognito stack (independent of provider stack)
    CognitoStack cognitoStack =
        new CognitoStack(
            app,
            "TestCognitoStack",
            CognitoStackProps.builder()
                .env(env)
                .envName("test")
                .domainName("oidc.example.com")
                .cognitoDomainPrefix("oidc-test-xyz")
                .authCertificateArn("arn:aws:acm:us-east-1:123456789012:certificate/xyz")
                .hostedZoneName("example.com")
                .hostedZoneId("Z000EXAMPLE")
                .build());

    StageSynthesisOptions options = StageSynthesisOptions.builder()
              .skipValidation(false)
              .validateOnSynthesis(true)
              .build();
    app.synth(options); // should not throw
  }
}
