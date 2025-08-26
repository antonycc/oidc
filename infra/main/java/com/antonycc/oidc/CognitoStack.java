package com.antonycc.oidc;

import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.cognito.CfnUserPoolIdentityProvider;
import software.amazon.awscdk.services.cognito.OAuthFlows;
import software.amazon.awscdk.services.cognito.OAuthScope;
import software.amazon.awscdk.services.cognito.OAuthSettings;
import software.amazon.awscdk.services.cognito.SignInAliases;
import software.amazon.awscdk.services.cognito.UserPool;
import software.amazon.awscdk.services.cognito.UserPoolClient;
import software.amazon.awscdk.services.cognito.UserPoolClientIdentityProvider;
import software.amazon.awscdk.services.cognito.UserPoolClientOptions;
import software.amazon.awscdk.services.cognito.UserPoolDomain;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.AaaaRecord;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.RecordTarget;
import software.amazon.awscdk.services.route53.targets.UserPoolDomainTarget;
import software.constructs.Construct;

import java.util.List;
import java.util.Map;

public class CognitoStack extends Stack {
  public final UserPool pool;
  public final UserPoolDomain domain;
  public final UserPoolClient client;
  public final CfnUserPoolIdentityProvider oidcIdp;
  public final ARecord userPoolDomainARecord;
  public final AaaaRecord userPoolDomainAaaaRecord;

  public CognitoStack(final Construct scope, final String id, final CognitoStackProps props) {
    super(scope, id, props);

    String domainName = props.domainName;
    String baseUrl = "https://" + domainName;
    String cognitoDomainName = props.cognitoDomainPrefix + "." + domainName;
    // String dashedDomainName = domainName.replace('.', '-');
    String dashedCognitoDomainName = cognitoDomainName.replace('.', '-');

    // Generate predictable resource name prefix based on domain and environment
    String resourceNamePrefix = generateResourceNamePrefix(props.domainName, props.envName);

    // Cognito User Pool that federates to our OP (discovery served from CloudFront)
    this.pool =
        UserPool.Builder.create(this, resourceNamePrefix + "-UserPool")
            .userPoolName(resourceNamePrefix + "-user-pool")
            .selfSignUpEnabled(false)
            .signInAliases(SignInAliases.builder().username(true).build())
            .removalPolicy(RemovalPolicy.DESTROY)
            .build();

    var authCertificate = Certificate.fromCertificateArn(this, resourceNamePrefix + "-AuthCertificate", props.authCertificateArn);

    this.domain =
            UserPoolDomain.Builder.create(this, resourceNamePrefix + "-CognitoDomain")
                    .userPool(this.pool)
                    .customDomain(
                            software.amazon.awscdk.services.cognito.CustomDomainOptions.builder()
                                    .domainName(cognitoDomainName)
                                    .certificate(authCertificate)
                                    .build())
                    .build();
        // this.pool.addDomain(
        //    "CognitoDomain",
        //    UserPoolDomainOptions.builder()
        //        .cognitoDomain(
        //            CognitoDomainOptions.builder()
        //                    .domainPrefix(props.cognitoDomainPrefix + "-" + dashedDomainName)
        //                    .build())
        //        .build());
      var hostedZone =
              HostedZone.fromHostedZoneAttributes(
                      this,
                      resourceNamePrefix + "-HostedZone",
                      HostedZoneAttributes.builder()
                              .zoneName(props.hostedZoneName)
                              .hostedZoneId(props.hostedZoneId)
                              .build());

      this.userPoolDomainARecord =
              ARecord.Builder.create(
                              this, resourceNamePrefix + "-UserPoolDomainARecord")
                      .zone(hostedZone)
                      .recordName(cognitoDomainName)
                      .target(RecordTarget.fromAlias(new UserPoolDomainTarget(this.domain)))
                      .build();
      this.userPoolDomainAaaaRecord =
              AaaaRecord.Builder.create(
                              this, resourceNamePrefix + "-UserPoolDomainAaaaRecord")
                      .zone(hostedZone)
                      .recordName(cognitoDomainName)
                      .target(RecordTarget.fromAlias(new UserPoolDomainTarget(this.domain)))
                      .build();

    this.client =
        this.pool.addClient(
            resourceNamePrefix + "-WebClient",
            UserPoolClientOptions.builder()
                .oAuth(
                    OAuthSettings.builder()
                        .flows(OAuthFlows.builder().authorizationCodeGrant(true).build())
                        .scopes(List.of(OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE))
                        .callbackUrls(List.of(baseUrl + "/post-auth.html"))
                        .logoutUrls(List.of(baseUrl + "/"))
                        .build())
                .supportedIdentityProviders(List.of(UserPoolClientIdentityProvider.custom("OIDC")))
                .build());

    // OIDC IdP pointing to our issuer endpoints
    this.oidcIdp =
        CfnUserPoolIdentityProvider.Builder.create(this, resourceNamePrefix + "-OidcIdp")
            .providerName("OIDC")
            .providerType("OIDC")
            .userPoolId(this.pool.getUserPoolId())
            .providerDetails(
                Map.of(
                    "attributes_request_method", "GET",
                    "oidc_issuer", baseUrl,
                    "authorize_scopes", "openid email profile",
                    "authorize_url", baseUrl + "/authorize",
                    "token_url", baseUrl + "/token",
                    "attributes_url", baseUrl + "/userinfo",
                    // This is the client_id Cognito will use with our OIDC provider. It must NOT
                    // reference the UserPoolClient.
                    // Using a static value avoids a CloudFormation dependency cycle between the IdP
                    // and the UserPoolClient.
                    "client_id", "cognito-web"))
            .attributeMapping(
                Map.of(
                    "email", "email",
                    "given_name", "name"))
            .build();

    // Ensure the OIDC identity provider is created before the client that references it
    this.client.getNode().addDependency(this.oidcIdp);

    // Outputs
    new CfnOutput(
        this, "CognitoAuthDomain", CfnOutputProps.builder().value(this.domain.getDomainName()).build());
    new CfnOutput(this, "UserPoolId", CfnOutputProps.builder().value(this.pool.getUserPoolId()).build());
    new CfnOutput(
        this,
        "UserPoolClientId",
        CfnOutputProps.builder().value(this.client.getUserPoolClientId()).build());
  }

  /**
   * Generate a predictable resource name prefix based on domain name and environment.
   * Converts domain like "oidc.example.com" to "oidc-example-com" and adds environment.
   */
  private static String generateResourceNamePrefix(String domainName, String envName) {
    String dashedDomainName = domainName.replace('.', '-');
    return dashedDomainName + "-" + envName;
  }
}
