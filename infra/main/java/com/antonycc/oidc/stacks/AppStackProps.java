package com.antonycc.oidc.stacks;

import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

@Value.Immutable
public interface AppStackProps extends StackProps {
    Environment environment();
    String envName();
    String deploymentName();
    String ecrRepositoryArn();
    String ecrRepositoryName();
    String baseImageTag();
    String domainName();
    String hostedZoneName();
    String hostedZoneId();
    String certificateArn();
    String resourceNamePrefix();
    String compressedResourceNamePrefix();

    @Override
    default Environment getEnv() {
        return environment();
    }

    static ImmutableAppStackProps.Builder builder() {
        return ImmutableAppStackProps.builder();
    }
}
