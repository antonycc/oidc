package com.antonycc.oidc;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

public class OpsStackProps implements StackProps {
    public final Environment env;
    public final String envName;
    public final String deploymentName;
    public final String domainName;
    public final String resourceNamePrefix;
    public final String compressedResourceNamePrefix;
    public final String jwksEndpointFunctionArn;
    public final String authorizeEndpointFunctionArn;
    public final String tokenEndpointFunctionArn;
    public final String userinfoEndpointFunctionArn;
    public final String usersTableArn;
    public final String authCodesTableArn;
    public final String refreshTokensTableArn;
    public final String distributionId;

    private OpsStackProps(Builder builder) {
        this.env = builder.env;
        this.envName = builder.envName;
        this.deploymentName = builder.deploymentName;
        this.domainName = builder.domainName;
        this.resourceNamePrefix = builder.resourceNamePrefix;
        this.compressedResourceNamePrefix = builder.compressedResourceNamePrefix;
        this.jwksEndpointFunctionArn = builder.jwksEndpointFunctionArn;
        this.authorizeEndpointFunctionArn = builder.authorizeEndpointFunctionArn;
        this.tokenEndpointFunctionArn = builder.tokenEndpointFunctionArn;
        this.userinfoEndpointFunctionArn = builder.userinfoEndpointFunctionArn;
        this.usersTableArn = builder.usersTableArn;
        this.authCodesTableArn = builder.authCodesTableArn;
        this.refreshTokensTableArn = builder.refreshTokensTableArn;
        this.distributionId = builder.distributionId;
    }

    @Override
    public Environment getEnv() {
        return this.env;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private Environment env;
        private String envName;
        private String deploymentName;
        private String domainName;
        private String resourceNamePrefix;
        private String compressedResourceNamePrefix;
        private String jwksEndpointFunctionArn;
        private String authorizeEndpointFunctionArn;
        private String tokenEndpointFunctionArn;
        private String userinfoEndpointFunctionArn;
        private String usersTableArn;
        private String authCodesTableArn;
        private String refreshTokensTableArn;
        private String distributionId;

        public Builder env(Environment env) {
            this.env = env;
            return this;
        }

        public Builder envName(String envName) {
            this.envName = envName;
            return this;
        }

        public Builder deploymentName(String deploymentName) {
            this.deploymentName = deploymentName;
            return this;
        }

        public Builder domainName(String domainName) {
            this.domainName = domainName;
            return this;
        }

        public Builder resourceNamePrefix(String resourceNamePrefix) {
            this.resourceNamePrefix = resourceNamePrefix;
            return this;
        }

        public Builder compressedResourceNamePrefix(String compressedResourceNamePrefix) {
            this.compressedResourceNamePrefix = compressedResourceNamePrefix;
            return this;
        }

        public Builder jwksEndpointFunctionArn(String jwksEndpointFunctionArn) {
            this.jwksEndpointFunctionArn = jwksEndpointFunctionArn;
            return this;
        }

        public Builder authorizeEndpointFunctionArn(String authorizeEndpointFunctionArn) {
            this.authorizeEndpointFunctionArn = authorizeEndpointFunctionArn;
            return this;
        }

        public Builder tokenEndpointFunctionArn(String tokenEndpointFunctionArn) {
            this.tokenEndpointFunctionArn = tokenEndpointFunctionArn;
            return this;
        }

        public Builder userinfoEndpointFunctionArn(String userinfoEndpointFunctionArn) {
            this.userinfoEndpointFunctionArn = userinfoEndpointFunctionArn;
            return this;
        }

        public Builder usersTableArn(String usersTableArn) {
            this.usersTableArn = usersTableArn;
            return this;
        }

        public Builder authCodesTableArn(String authCodesTableArn) {
            this.authCodesTableArn = authCodesTableArn;
            return this;
        }

        public Builder refreshTokensTableArn(String refreshTokensTableArn) {
            this.refreshTokensTableArn = refreshTokensTableArn;
            return this;
        }

        public Builder distributionId(String distributionId) {
            this.distributionId = distributionId;
            return this;
        }

        public OpsStackProps build() {
            return new OpsStackProps(this);
        }
    }
}
