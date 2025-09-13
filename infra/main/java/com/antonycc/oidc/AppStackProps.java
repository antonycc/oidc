package com.antonycc.oidc;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

public class AppStackProps implements StackProps {
    public final Environment env;
    public final String envName;
    public final String deploymentName;
    public final String ecrRepositoryArn;
    public final String ecrRepositoryName;
    public final String baseImageTag;
    public final String domainName;
    public final String hostedZoneName;
    public final String hostedZoneId;
    public final String certificateArn;
    public final String resourceNamePrefix;
    public final String compressedResourceNamePrefix;

    private AppStackProps(Builder builder) {
        this.env = builder.env;
        this.envName = builder.envName;
        this.deploymentName = builder.deploymentName;
        this.ecrRepositoryArn = builder.ecrRepositoryArn;
        this.ecrRepositoryName = builder.ecrRepositoryName;
        this.baseImageTag = builder.baseImageTag;
        this.domainName = builder.domainName;
        this.hostedZoneName = builder.hostedZoneName;
        this.hostedZoneId = builder.hostedZoneId;
        this.certificateArn = builder.certificateArn;
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
        private String deploymentName;
        private String ecrRepositoryArn;
        private String ecrRepositoryName;
        private String baseImageTag;
        private String domainName;
        private String hostedZoneName;
        private String hostedZoneId;
        private String certificateArn;
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

        public Builder hostedZoneName(String hostedZoneName) {
            this.hostedZoneName = hostedZoneName;
            return this;
        }

        public Builder hostedZoneId(String hostedZoneId) {
            this.hostedZoneId = hostedZoneId;
            return this;
        }

        public Builder certificateArn(String certificateArn) {
            this.certificateArn = certificateArn;
            return this;
        }

        public Builder trailLogGroup(software.amazon.awscdk.services.logs.LogGroup logGroup) {
            // not used in AppStackProps; method provided for compatibility with tests
            return this;
        }

        public Builder auditTrail(software.amazon.awscdk.services.cloudtrail.Trail trail) {
            // not used in AppStackProps; method provided for compatibility with tests
            return this;
        }

        public Builder xrayGroup(software.amazon.awscdk.services.xray.CfnGroup group) {
            // not used in AppStackProps; method provided for compatibility with tests
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

        public AppStackProps build() {
            return new AppStackProps(this);
        }
    }
}
