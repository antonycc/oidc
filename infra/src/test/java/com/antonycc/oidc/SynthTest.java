package com.antonycc.oidc;

import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;

class SynthTest {
  @Test
  void cdkSynthCompiles() {
    var app = new App();
    new OidcStack(app, "TestStack",
        OidcStackProps.builder()
            .envName("test")
            .hostedZoneName("example.com")
            .hostedZoneId("Z000EXAMPLE")
            .domainName("oidc.example.com")
            .certificateArn("arn:aws:acm:us-east-1:123456789012:certificate/abc")
            .cognitoDomainPrefix("oidc-test-xyz")
            .build());
    app.synth(); // should not throw
  }
}