package com.antonycc.oidc;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

public class ObservabilityStackProps implements StackProps {
  public final Environment env;
  public final String envName;
  public final String domainName;

  private ObservabilityStackProps(Builder builder) {
    this.env = builder.env;
    this.envName = builder.envName;
    this.domainName = builder.domainName;
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

    public ObservabilityStackProps build() {
      return new ObservabilityStackProps(this);
    }
  }
}