package com.antonycc.oidc;

import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StageSynthesisOptions;

class SynthTest {
    @Test
    void cdkSynthCompiles() {
        var app = new App();

        Environment env = Environment.builder()
                .account("123456789012")
                .region("us-east-1")
                .build();

        // Create the Observability stack first
        ObservabilityStack observabilityStack = new ObservabilityStack(
                app,
                "TestObservabilityStack",
                ObservabilityStackProps.builder()
                        .env(env)
                        .envName("test")
                        .domainName("oidc.example.com")
                        .build());

        // Create the App stack
        AppStack appStack = new AppStack(
                app,
                "TestAppStack",
                AppStackProps.builder()
                        .env(env)
                        .envName("test")
                        .deploymentName("test")
                        .hostedZoneName("example.com")
                        .hostedZoneId("Z000EXAMPLE")
                        .ecrRepositoryArn("arn:aws:ecr:us-east-1:123456789012:repository/oidc-repo")
                        .ecrRepositoryName("oidc-repo")
                        .baseImageTag("latest")
                        .domainName("oidc.example.com")
                        .certificateArn("arn:aws:acm:us-east-1:123456789012:certificate/abc")
                        .trailLogGroup(observabilityStack.trailLogGroup)
                        .auditTrail(observabilityStack.auditTrail)
                        .xrayGroup(observabilityStack.xrayGroup)
                        .build());

        StageSynthesisOptions options = StageSynthesisOptions.builder()
                .skipValidation(false)
                .validateOnSynthesis(true)
                .build();
        app.synth(options); // should not throw
    }
}
