package com.antonycc.oidc.stacks;

import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.s3.Bucket;

@Value.Immutable
public interface PublishStackProps extends StackProps {
    Environment environment();
    String envName();
    String deploymentName();
    String domainName();
    String baseUrl();
    String resourceNamePrefix();
    String distributionId();
    Bucket webBucket();
    Bucket wellKnownBucket();

    @Override
    default Environment getEnv() {
        return environment();
    }

    static ImmutablePublishStackProps.Builder builder() {
        return ImmutablePublishStackProps.builder();
    }
}
