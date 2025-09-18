package com.antonycc.oidc.stacks;

import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

@Value.Immutable
public interface OpsStackProps extends StackProps {
    Environment environment();
    String envName();
    String deploymentName();
    String domainName();
    String resourceNamePrefix();
    String compressedResourceNamePrefix();
    String jwksEndpointFunctionArn();
    String authorizeEndpointFunctionArn();
    String tokenEndpointFunctionArn();
    String userinfoEndpointFunctionArn();
    String usersTableArn();
    String authCodesTableArn();
    String refreshTokensTableArn();

    @Override
    default Environment getEnv() {
        return environment();
    }

    static ImmutableOpsStackProps.Builder builder() {
        return ImmutableOpsStackProps.builder();
    }
}
