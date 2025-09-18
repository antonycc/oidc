package com.antonycc.oidc.stacks;

import org.immutables.value.Value;
import software.amazon.awscdk.StackProps;

@Value.Immutable
public interface DevStackProps extends StackProps {
    String env();
    String domainName();
    String dashedDomainName();
    String resourceNamePrefix();
    String compressedResourceNamePrefix();
    String hostedZoneName();

    static ImmutableDevStackProps.Builder builder() {
        return ImmutableDevStackProps.builder();
    }
}
