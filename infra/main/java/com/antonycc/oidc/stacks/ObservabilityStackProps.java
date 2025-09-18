package com.antonycc.oidc.stacks;

import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

@Value.Immutable
public interface ObservabilityStackProps extends StackProps {
    Environment environment();
    String envName();
    String domainName();
    String resourceNamePrefix();
    String compressedResourceNamePrefix();

    @Override
    default Environment getEnv() {
        return environment();
    }

    static ImmutableObservabilityStackProps.Builder builder() {
        return ImmutableObservabilityStackProps.builder();
    }
}
