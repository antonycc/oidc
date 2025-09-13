package com.antonycc.oidc;

import software.amazon.awscdk.StackProps;

public class DevStackProps implements StackProps {
    public final String env;
    public final String domainName;
    public final String dashedDomainName;
    public final String resourceNamePrefix;
    public final String compressedResourceNamePrefix;
    public final String hostedZoneName;

    private DevStackProps(Builder b) {
        this.env = b.env;
        this.domainName = b.domainName;
        this.dashedDomainName = b.dashedDomainName;
        this.resourceNamePrefix = b.resourceNamePrefix;
        this.compressedResourceNamePrefix = b.compressedResourceNamePrefix;
        this.hostedZoneName = b.hostedZoneName;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String env;
        private String domainName;
        private String dashedDomainName;
        private String resourceNamePrefix;
        private String compressedResourceNamePrefix;
        private String hostedZoneName;

        public Builder env(String v) {
            this.env = v;
            return this;
        }

        public Builder domainName(String v) {
            this.domainName = v;
            return this;
        }

        public Builder dashedDomainName(String v) {
            this.dashedDomainName = v;
            return this;
        }

        public Builder resourceNamePrefix(String v) {
            this.resourceNamePrefix = v;
            return this;
        }

        public Builder compressedResourceNamePrefix(String v) {
            this.compressedResourceNamePrefix = v;
            return this;
        }

        public Builder hostedZoneName(String v) {
            this.hostedZoneName = v;
            return this;
        }

        public DevStackProps build() {
            return new DevStackProps(this);
        }
    }
}
