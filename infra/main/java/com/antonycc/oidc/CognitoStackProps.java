package com.antonycc.oidc;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

public class CognitoStackProps implements StackProps {
  public final Environment env;
  public final String envName;
  public final String domainName;
  public final String cognitoDomainPrefix;

  private CognitoStackProps(Builder builder) {
    this.env = builder.env;
    this.envName = builder.envName;
    this.domainName = builder.domainName;
    this.cognitoDomainPrefix = builder.cognitoDomainPrefix;
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

    public CognitoStackProps build() {
      return new CognitoStackProps(this);
    }
  }
}
