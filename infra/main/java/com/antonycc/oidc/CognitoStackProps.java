package com.antonycc.oidc;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.cloudfront.Distribution;

public class CognitoStackProps implements StackProps {
  public final Environment env;
  public final String envName;
  public final String domainName;
  public final String authDomainName;
  public final String authCertificateArn;
  public final String hostedZoneName;
  public final String hostedZoneId;
  public final Bucket webBucket;
  public final Distribution distribution;

  private CognitoStackProps(Builder builder) {
    this.env = builder.env;
    this.envName = builder.envName;
    this.domainName = builder.domainName;
    this.authDomainName = builder.authDomainName;
    this.authCertificateArn = builder.authCertificateArn;
    this.hostedZoneName = builder.hostedZoneName;
    this.hostedZoneId = builder.hostedZoneId;
    this.webBucket = builder.webBucket;
    this.distribution = builder.distribution;
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
    private String authDomainName;
    private String authCertificateArn;
    private String hostedZoneName;
    private String hostedZoneId;
    private Bucket webBucket;
    private Distribution distribution;

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

    public Builder authDomainName(String authDomainName) {
      this.authDomainName = authDomainName;
      return this;
    }

    public Builder authCertificateArn(String authCertificateArn) {
      this.authCertificateArn = authCertificateArn;
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

    public Builder webBucket(Bucket webBucket) {
      this.webBucket = webBucket;
      return this;
    }

    public Builder distribution(Distribution distribution) {
      this.distribution = distribution;
      return this;
    }

    public CognitoStackProps build() {
      return new CognitoStackProps(this);
    }
  }
}
