package com.antonycc.oidc.stacks;

import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;

@Value.Immutable
public interface EdgeStackProps extends StackProps {
    Environment environment();
    String envName();
    String deploymentName();
    String hostedZoneName();
    String hostedZoneId();
    String domainName();
    String baseUrl();
    String resourceNamePrefix();
    String compressedResourceNamePrefix();
    String certificateArn();
    String logsBucketArn();
    BehaviorOptions webBehaviorOptions();
    BehaviorOptions wellKnownBehaviorOptions();
    String jwksEndpointFunctionArn();
    String authorizeEndpointFunctionArn();
    String tokenEndpointFunctionArn();
    String userinfoEndpointFunctionArn();
    Map<String, BehaviorOptions> additionalOriginsBehaviourMappings();

    @Override
    default Environment getEnv() {
        return environment();
    }

    static ImmutableEdgeStackProps.Builder builder() {
        return ImmutableEdgeStackProps.builder();
    }
}
