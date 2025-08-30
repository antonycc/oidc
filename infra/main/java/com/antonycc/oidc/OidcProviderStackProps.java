package com.antonycc.oidc;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.xray.CfnGroup;

public class OidcProviderStackProps implements StackProps {
  public final Environment env;
  public final String envName;
  public final String deploymentName;
  public final String domainName;
  public final Bucket logsBucket;
  public final LogGroup trailLogGroup;
  public final Trail auditTrail;
  public final CfnGroup xrayGroup;
  public final LogGroup bucketDeploymentLogGroup;
  // Edge resources from EdgeStack
  public final S3OriginBucket webOriginBucket;
  public final S3OriginBucket wellKnownOriginBucket;
  public final Bucket webBucket;
  public final OriginAccessIdentity webOriginAccessIdentity;
  public final Bucket wellKnownBucket;
  public final OriginAccessIdentity wellKnownOriginAccessIdentity;
  public final CachePolicy shortTtl;
  public final BehaviorOptions webOriginBehaviorOptions;
  public final BehaviorOptions wellKnownOriginBehaviorOptions;

  private OidcProviderStackProps(Builder builder) {
    this.env = builder.env;
    this.envName = builder.envName;
    this.deploymentName = builder.deploymentName;
    this.domainName = builder.domainName;
    this.logsBucket = builder.logsBucket;
    this.trailLogGroup = builder.trailLogGroup;
    this.auditTrail = builder.auditTrail;
    this.xrayGroup = builder.xrayGroup;
    this.bucketDeploymentLogGroup = builder.bucketDeploymentLogGroup;
    // Edge resources
    this.webOriginBucket = builder.webOriginBucket;
    this.wellKnownOriginBucket = builder.wellKnownOriginBucket;
    this.webBucket = builder.webBucket;
    this.webOriginAccessIdentity = builder.webOriginAccessIdentity;
    this.wellKnownBucket = builder.wellKnownBucket;
    this.wellKnownOriginAccessIdentity = builder.wellKnownOriginAccessIdentity;
    this.shortTtl = builder.shortTtl;
    this.webOriginBehaviorOptions = builder.webOriginBehaviorOptions;
    this.wellKnownOriginBehaviorOptions = builder.wellKnownOriginBehaviorOptions;
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
    private Bucket logsBucket;
    private LogGroup trailLogGroup;
    private Trail auditTrail;
    private CfnGroup xrayGroup;
    private LogGroup bucketDeploymentLogGroup;
    // Edge resources
    private S3OriginBucket webOriginBucket;
    private S3OriginBucket wellKnownOriginBucket;
    private Bucket webBucket;
    private OriginAccessIdentity webOriginAccessIdentity;
    private Bucket wellKnownBucket;
    private OriginAccessIdentity wellKnownOriginAccessIdentity;
    private CachePolicy shortTtl;
    private BehaviorOptions webOriginBehaviorOptions;
    private BehaviorOptions wellKnownOriginBehaviorOptions;

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

    // Edge resources builders
    public Builder webOriginBucket(S3OriginBucket webOriginBucket) {
      this.webOriginBucket = webOriginBucket;
      return this;
    }

    public Builder wellKnownOriginBucket(S3OriginBucket wellKnownOriginBucket) {
      this.wellKnownOriginBucket = wellKnownOriginBucket;
      return this;
    }

    public Builder webBucket(Bucket webBucket) {
      this.webBucket = webBucket;
      return this;
    }

    public Builder webOriginAccessIdentity(OriginAccessIdentity webOriginAccessIdentity) {
      this.webOriginAccessIdentity = webOriginAccessIdentity;
      return this;
    }

    public Builder wellKnownBucket(Bucket wellKnownBucket) {
      this.wellKnownBucket = wellKnownBucket;
      return this;
    }

    public Builder wellKnownOriginAccessIdentity(OriginAccessIdentity wellKnownOriginAccessIdentity) {
      this.wellKnownOriginAccessIdentity = wellKnownOriginAccessIdentity;
      return this;
    }

    public Builder shortTtl(CachePolicy shortTtl) {
      this.shortTtl = shortTtl;
      return this;
    }

    public Builder webOriginBehaviorOptions(BehaviorOptions webOriginBehaviorOptions) {
      this.webOriginBehaviorOptions = webOriginBehaviorOptions;
      return this;
    }

    public Builder wellKnownOriginBehaviorOptions(BehaviorOptions wellKnownOriginBehaviorOptions) {
      this.wellKnownOriginBehaviorOptions = wellKnownOriginBehaviorOptions;
      return this;
    }

    public OidcProviderStackProps build() {
      return new OidcProviderStackProps(this);
    }
  }
}
