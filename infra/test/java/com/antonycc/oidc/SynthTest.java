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

    // Create the Observability stack first
    ObservabilityStack observabilityStack =
        new ObservabilityStack(
            app,
            "TestObservabilityStack",
            ObservabilityStackProps.builder()
                .env(env)
                .envName("test")
                .domainName("oidc.example.com")
                .build());

    // Create the Edge stack 
    EdgeStack edgeStack =
        new EdgeStack(
            app,
            "TestEdgeStack",
            EdgeStackProps.builder()
                .env(env)
                .envName("test")
                .domainName("oidc.example.com")
                .hostedZoneName("example.com")
                .hostedZoneId("Z000EXAMPLE")
                .certificateArn("arn:aws:acm:us-east-1:123456789012:certificate/abc")
                .logsBucket(observabilityStack.logsBucket)
                .build());

    // Create the OIDC Provider stack
    OidcProviderStack providerStack =
        new OidcProviderStack(
            app,
            "TestOidcProviderStack",
            OidcProviderStackProps.builder()
                .env(env)
                .envName("test")
                .deploymentName("test")
                .domainName("oidc.example.com")
                .logsBucket(observabilityStack.logsBucket)
                .trailLogGroup(observabilityStack.trailLogGroup)
                .auditTrail(observabilityStack.auditTrail)
                .xrayGroup(observabilityStack.xrayGroup)
                .bucketDeploymentLogGroup(observabilityStack.trailLogGroup)
                // Edge resources from EdgeStack
                .webOriginBucket(edgeStack.webOriginBucket)
                .wellKnownOriginBucket(edgeStack.wellKnownOriginBucket)
                .webBucket(edgeStack.webBucket)
                .webOriginAccessIdentity(edgeStack.webOriginAccessIdentity)
                .wellKnownBucket(edgeStack.wellKnownBucket)
                .wellKnownOriginAccessIdentity(edgeStack.wellKnownOriginAccessIdentity)
                .shortTtl(edgeStack.shortTtl)
                .webOriginBehaviorOptions(edgeStack.webOriginBehaviorOptions)
                .wellKnownOriginBehaviorOptions(edgeStack.wellKnownOriginBehaviorOptions)
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
                .authDomainName("auth.oidc.example.com")
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
