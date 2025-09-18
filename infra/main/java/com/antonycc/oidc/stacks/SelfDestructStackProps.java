package com.antonycc.oidc.stacks;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

public class SelfDestructStackProps implements StackProps {
    public final Environment env;
    public final String envName;
    public final String deploymentName;
    public final String resourceNamePrefix;
    public final String compressedResourceNamePrefix;
    public final String observabilityStackName;
    public final String devStackName;
    public final String appStackName;
    public final String webStackName;
    public final String edgeStackName;
    public final String publishStackName;
    public final String opsStackName;
    public final String selfDestructDelayHours;
    public final String selfDestructHandlerSource;

    private SelfDestructStackProps(Builder builder) {
        this.env = builder.env;
        this.envName = builder.envName;
        this.deploymentName = builder.deploymentName;
        this.resourceNamePrefix = builder.resourceNamePrefix;
        this.compressedResourceNamePrefix = builder.compressedResourceNamePrefix;
        this.observabilityStackName = builder.observabilityStackName;
        this.devStackName = builder.devStackName;
        this.appStackName = builder.appStackName;
        this.webStackName = builder.webStackName;
        this.edgeStackName = builder.edgeStackName;
        this.publishStackName = builder.publishStackName;
        this.opsStackName = builder.opsStackName;
        this.selfDestructDelayHours = builder.selfDestructDelayHours;
        this.selfDestructHandlerSource = builder.selfDestructHandlerSource;
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
        private String resourceNamePrefix;
        private String compressedResourceNamePrefix;
        private String observabilityStackName;
        private String devStackName;
        private String appStackName;
        private String webStackName;
        private String edgeStackName;
        private String publishStackName;
        private String opsStackName;
        private String selfDestructDelayHours;
        private String selfDestructHandlerSource;

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

        public Builder resourceNamePrefix(String resourceNamePrefix) {
            this.resourceNamePrefix = resourceNamePrefix;
            return this;
        }

        public Builder compressedResourceNamePrefix(String compressedResourceNamePrefix) {
            this.compressedResourceNamePrefix = compressedResourceNamePrefix;
            return this;
        }

        public Builder observabilityStackName(String observabilityStackName) {
            this.observabilityStackName = observabilityStackName;
            return this;
        }

        public Builder devStackName(String devStackName) {
            this.devStackName = devStackName;
            return this;
        }

        public Builder appStackName(String appStackName) {
            this.appStackName = appStackName;
            return this;
        }

        public Builder webStackName(String webStackName) {
            this.webStackName = webStackName;
            return this;
        }

        public Builder edgeStackName(String edgeStackName) {
            this.edgeStackName = edgeStackName;
            return this;
        }

        public Builder publishStackName(String publishStackName) {
            this.publishStackName = publishStackName;
            return this;
        }

        public Builder opsStackName(String opsStackName) {
            this.opsStackName = opsStackName;
            return this;
        }

        public Builder selfDestructDelayHours(String selfDestructDelayHours) {
            this.selfDestructDelayHours = selfDestructDelayHours;
            return this;
        }

        public Builder selfDestructHandlerSource(String selfDestructHandlerSource) {
            this.selfDestructHandlerSource = selfDestructHandlerSource;
            return this;
        }

        public SelfDestructStackProps build() {
            return new SelfDestructStackProps(this);
        }
    }
}
