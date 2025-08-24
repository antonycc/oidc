package com.antonycc.oidc;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

public class OidcProviderStackProps implements StackProps {
  public final Environment env;
  public final String envName;
  public final String hostedZoneName;
  public final String hostedZoneId;
  public final String domainName;
  public final String certificateArn;

  private OidcProviderStackProps(Builder builder) {
    this.env = builder.env;
    this.envName = builder.envName;
    this.hostedZoneName = builder.hostedZoneName;
    this.hostedZoneId = builder.hostedZoneId;
    this.domainName = builder.domainName;
    this.certificateArn = builder.certificateArn;
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
    private String hostedZoneName;
    private String hostedZoneId;
    private String domainName;
    private String certificateArn;
    
    public Builder env(Environment env) {
      this.env = env;
      return this;
    }
    
    public Builder envName(String envName) {
      this.envName = envName;
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
    
    public OidcProviderStackProps build() {
      return new OidcProviderStackProps(this);
    }
  }
}