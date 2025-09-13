package com.antonycc.oidc;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

public class ProviderStackProps implements StackProps {
    public final Environment env;
    public final String envName;
    public final String deploymentName;
    public final String ecrRepositoryArn;
    public final String ecrRepositoryName;
    public final String baseImageTag;
    public final String domainName;
    public final String resourceNamePrefix;
    public final String compressedResourceNamePrefix;
    public final String logsBucketName;

    private ProviderStackProps(Builder builder) {
        this.env = builder.env;
        this.envName = builder.envName;
        this.deploymentName = builder.deploymentName;
        this.ecrRepositoryArn = builder.ecrRepositoryArn;
        this.ecrRepositoryName = builder.ecrRepositoryName;
        this.baseImageTag = builder.baseImageTag;
        this.domainName = builder.domainName;
        this.logsBucketName = builder.logsBucketName;
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
        private String ecrRepositoryArn;
        private String ecrRepositoryName;
        private String baseImageTag;
        private String domainName;
        private String logsBucketName;

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

        public Builder ecrRepositoryArn(String ecrRepositoryArn) {
            this.ecrRepositoryArn = ecrRepositoryArn;
            return this;
        }

        public Builder ecrRepositoryName(String ecrRepositoryName) {
            this.ecrRepositoryName = ecrRepositoryName;
            return this;
        }

        public Builder baseImageTag(String baseImageTag) {
            this.baseImageTag = baseImageTag;
            return this;
        }

        public Builder domainName(String domainName) {
            this.domainName = domainName;
            return this;
        }

        public Builder logsBucketName(String logsBucketName) {
            this.logsBucketName = logsBucketName;
            return this;
        }

        public ProviderStackProps build() {
            return new ProviderStackProps(this);
        }
    }
}
