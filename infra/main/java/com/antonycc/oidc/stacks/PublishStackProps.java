package com.antonycc.oidc.stacks;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.s3.Bucket;

public class PublishStackProps implements StackProps {
    public final Environment env;
    public final String envName;
    public final String deploymentName;
    public final String domainName;
    public final String baseUrl;
    public final String resourceNamePrefix;
    public final String distributionId;
    public final Bucket webBucket;
    public final Bucket wellKnownBucket;

    private PublishStackProps(Builder builder) {
        this.env = builder.env;
        this.envName = builder.envName;
        this.deploymentName = builder.deploymentName;
        this.domainName = builder.domainName;
        this.distributionId = builder.distributionId;
        this.baseUrl = builder.baseUrl;
        this.resourceNamePrefix = builder.resourceNamePrefix;
        this.webBucket = builder.webBucket;
        this.wellKnownBucket = builder.wellKnownBucket;
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
        private String baseUrl;
        private String resourceNamePrefix;
        private String distributionId;
        private Bucket webBucket;
        private Bucket wellKnownBucket;

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

        public Builder baseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
            return this;
        }

        public Builder resourceNamePrefix(String resourceNamePrefix) {
            this.resourceNamePrefix = resourceNamePrefix;
            return this;
        }

        public Builder distributionId(String distributionId) {
            this.distributionId = distributionId;
            return this;
        }

        public Builder webBucket(Bucket webBucket) {
            this.webBucket = webBucket;
            return this;
        }

        public Builder wellKnownBucket(Bucket wellKnownBucket) {
            this.wellKnownBucket = wellKnownBucket;
            return this;
        }

        public PublishStackProps build() {
            return new PublishStackProps(this);
        }
    }
}
