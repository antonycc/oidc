package com.antonycc.oidc;

public class DevStackProps {
    public final String env;
    public final String domainName;
    public final String hostedZoneName;
    public final String retainEcrRepository;

    private DevStackProps(Builder b) {
        this.env = b.env;
        this.domainName = b.domainName;
        this.hostedZoneName = b.hostedZoneName;
        this.retainEcrRepository = b.retainEcrRepository;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String env;
        private String domainName;
        private String hostedZoneName;
        private String retainEcrRepository;

        public Builder env(String v) {
            this.env = v;
            return this;
        }

        public Builder domainName(String v) {
            this.domainName = v;
            return this;
        }

        public Builder hostedZoneName(String v) {
            this.hostedZoneName = v;
            return this;
        }

        public Builder retainEcrRepository(String v) {
            this.retainEcrRepository = v;
            return this;
        }

        public DevStackProps build() {
            return new DevStackProps(this);
        }
    }
}
