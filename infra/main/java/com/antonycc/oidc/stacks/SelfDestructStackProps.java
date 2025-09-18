package com.antonycc.oidc.stacks;

import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

@Value.Immutable
public interface SelfDestructStackProps extends StackProps {
    Environment environment();
    String envName();
    String deploymentName();
    String resourceNamePrefix();
    String compressedResourceNamePrefix();
    String observabilityStackName();
    String devStackName();
    String appStackName();
    String webStackName();
    String edgeStackName();
    String publishStackName();
    String opsStackName();
    String selfDestructDelayHours();
    String selfDestructHandlerSource();

    @Override
    default Environment getEnv() {
        return environment();
    }

    static ImmutableSelfDestructStackProps.Builder builder() {
        return ImmutableSelfDestructStackProps.builder();
    }
}
