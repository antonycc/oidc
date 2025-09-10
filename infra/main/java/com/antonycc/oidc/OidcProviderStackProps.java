package com.antonycc.oidc;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.xray.CfnGroup;

public class OidcProviderStackProps implements StackProps {
    public final Environment env;
    public final String envName;
    public final String deploymentName;
    public final String hostedZoneName;
    public final String hostedZoneId;
    public final String domainName;
    public final String certificateArn;
    public final Bucket logsBucket;
    public final LogGroup trailLogGroup;
    public final Trail auditTrail;
    public final CfnGroup xrayGroup;
    public final LogGroup bucketDeploymentLogGroup;

    private OidcProviderStackProps(Builder builder) {
        this.env = builder.env;
        this.envName = builder.envName;
        this.deploymentName = builder.deploymentName;
        this.hostedZoneName = builder.hostedZoneName;
        this.hostedZoneId = builder.hostedZoneId;
        this.domainName = builder.domainName;
        this.certificateArn = builder.certificateArn;
        this.logsBucket = builder.logsBucket;
        this.trailLogGroup = builder.trailLogGroup;
        this.auditTrail = builder.auditTrail;
        this.xrayGroup = builder.xrayGroup;
        this.bucketDeploymentLogGroup = builder.bucketDeploymentLogGroup;
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
        private String hostedZoneName;
        private String hostedZoneId;
        private String domainName;
        private String certificateArn;
        private Bucket logsBucket;
        private LogGroup trailLogGroup;
        private Trail auditTrail;
        private CfnGroup xrayGroup;
        private LogGroup bucketDeploymentLogGroup;

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

        public Builder hostedZoneName(String hostedZoneName) {
            this.hostedZoneName = hostedZoneName;
            return this;
        }

        public Builder hostedZoneId(String hostedZoneId) {
            this.hostedZoneId = hostedZoneId;
            return this;
        }

        public Builder domainName(String domainName) {
            this.domainName = domainName;
            return this;
        }

        public Builder certificateArn(String certificateArn) {
            this.certificateArn = certificateArn;
            return this;
        }

        public Builder logsBucket(Bucket logsBucket) {
            this.logsBucket = logsBucket;
            return this;
        }

        public Builder trailLogGroup(LogGroup trailLogGroup) {
            this.trailLogGroup = trailLogGroup;
            return this;
        }

        public Builder auditTrail(Trail auditTrail) {
            this.auditTrail = auditTrail;
            return this;
        }

        public Builder xrayGroup(CfnGroup xrayGroup) {
            this.xrayGroup = xrayGroup;
            return this;
        }

        public Builder bucketDeploymentLogGroup(LogGroup bucketDeploymentLogGroup) {
            this.bucketDeploymentLogGroup = bucketDeploymentLogGroup;
            return this;
        }

        public OidcProviderStackProps build() {
            return new OidcProviderStackProps(this);
        }
    }
}
