package com.antonycc.oidc;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

public class CognitoStackProps implements StackProps {
  public final Environment env;
  public final String envName;
  public final String domainName;
  public final String cognitoDomainPrefix;
  public final String authCertificateArn;
  public final String hostedZoneName;
  public final String hostedZoneId;
  public final String cloudFrontHostedZoneId;

  private CognitoStackProps(Builder builder) {
    this.env = builder.env;
    this.envName = builder.envName;
    this.domainName = builder.domainName;
    this.cognitoDomainPrefix = builder.cognitoDomainPrefix;
    this.authCertificateArn = builder.authCertificateArn;
    this.hostedZoneName = builder.hostedZoneName;
    this.hostedZoneId = builder.hostedZoneId;
    this.cloudFrontHostedZoneId = builder.cloudFrontHostedZoneId;
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
    private String cognitoDomainPrefix;
    private String authCertificateArn;
    private String hostedZoneName;
    private String hostedZoneId;
    private String cloudFrontHostedZoneId;

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

    public Builder cognitoDomainPrefix(String cognitoDomainPrefix) {
      this.cognitoDomainPrefix = cognitoDomainPrefix;
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

    public Builder cloudFrontHostedZoneId(String cloudFrontHostedZoneId) {
      this.cloudFrontHostedZoneId = cloudFrontHostedZoneId;
      return this;
    }

    public CognitoStackProps build() {
      return new CognitoStackProps(this);
    }
  }
}
