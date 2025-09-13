package com.antonycc.oidc;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

public class ObservabilityStackProps implements StackProps {
    public final Environment env;
    public final String envName;
    public final String domainName;
    public final String resourceNamePrefix;
    public final String compressedResourceNamePrefix;

    private ObservabilityStackProps(Builder builder) {
        this.env = builder.env;
        this.envName = builder.envName;
        this.domainName = builder.domainName;
        this.resourceNamePrefix = builder.resourceNamePrefix;
        this.compressedResourceNamePrefix = builder.compressedResourceNamePrefix;
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
        private String domainName;
        private String resourceNamePrefix;
        private String compressedResourceNamePrefix;

        public Builder env(Environment env) {
            this.env = env;
            return this;
        }

        public Builder envName(String envName) {
            this.envName = envName;
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

        public ObservabilityStackProps build() {
            return new ObservabilityStackProps(this);
        }
    }
}
