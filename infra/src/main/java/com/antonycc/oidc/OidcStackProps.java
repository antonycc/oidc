package com.antonycc.oidc;

import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

public class OidcStackProps implements StackProps {
  public final Environment env;
  public final String envName;
  public final String hostedZoneName;
  public final String hostedZoneId;
  public final String subdomain;
  public final String cognitoDomainPrefix;

  private OidcStackProps(Builder builder) {
    this.env = builder.env;
    this.envName = builder.envName;
    this.hostedZoneName = builder.hostedZoneName;
    this.hostedZoneId = builder.hostedZoneId;
    this.subdomain = builder.subdomain;
    this.cognitoDomainPrefix = builder.cognitoDomainPrefix;
  }

  @Override public Environment getEnv() { return env; }
  
  public static Builder builder() {
    return new Builder();
  }
  
  public static class Builder {
    private Environment env;
    private String envName;
    private String hostedZoneName;
    private String hostedZoneId;
    private String subdomain;
    private String cognitoDomainPrefix;
    
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
    
    public Builder subdomain(String subdomain) {
      this.subdomain = subdomain;
      return this;
    }
    
    public Builder cognitoDomainPrefix(String cognitoDomainPrefix) {
      this.cognitoDomainPrefix = cognitoDomainPrefix;
      return this;
    }
    
    public OidcStackProps build() {
      return new OidcStackProps(this);
    }
  }
}