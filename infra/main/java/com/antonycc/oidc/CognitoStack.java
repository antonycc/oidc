package com.antonycc.oidc;

import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.cognito.CfnUserPool;
import software.amazon.awscdk.services.cognito.CfnUserPoolClient;
import software.amazon.awscdk.services.cognito.CfnUserPoolDomain;
import software.amazon.awscdk.services.cognito.CfnUserPoolIdentityProvider;
import software.amazon.awscdk.services.route53.CfnRecordSet;
import software.constructs.Construct;

import java.util.List;
import java.util.Map;

public class CognitoStack extends Stack {
  public final CfnUserPool pool;
  public final CfnUserPoolDomain domain;
  public final CfnUserPoolClient client;
  public final CfnUserPoolIdentityProvider oidcIdp;

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
        CfnUserPool.Builder.create(this, resourceNamePrefix + "-UserPool")
            .userPoolName(resourceNamePrefix + "-user-pool")
            .accountRecoverySetting(
                CfnUserPool.AccountRecoverySettingProperty.builder()
                    .recoveryMechanisms(List.of(
                        CfnUserPool.RecoveryOptionProperty.builder()
                            .name("verified_phone_number")
                            .priority(1)
                            .build(),
                        CfnUserPool.RecoveryOptionProperty.builder()
                            .name("verified_email")
                            .priority(2)
                            .build()))
                    .build())
            .adminCreateUserConfig(
                CfnUserPool.AdminCreateUserConfigProperty.builder()
                    .allowAdminCreateUserOnly(true)
                    .build())
            .emailVerificationMessage("The verification code to your new account is {####}")
            .emailVerificationSubject("Verify your new account")
            .smsVerificationMessage("The verification code to your new account is {####}")
            .verificationMessageTemplate(
                CfnUserPool.VerificationMessageTemplateProperty.builder()
                    .defaultEmailOption("CONFIRM_WITH_CODE")
                    .emailMessage("The verification code to your new account is {####}")
                    .emailSubject("Verify your new account")
                    .smsMessage("The verification code to your new account is {####}")
                    .build())
            .build();

    this.domain =
        CfnUserPoolDomain.Builder.create(this, resourceNamePrefix + "-CognitoDomain")
            .userPoolId(this.pool.getRef())
            .domain(cognitoDomainName)
            .customDomainConfig(
                CfnUserPoolDomain.CustomDomainConfigTypeProperty.builder()
                    .certificateArn(props.authCertificateArn)
                    .build())
            .build();

    // Create Route53 records for the Cognito custom domain
    // AWS Cognito creates a CloudFront distribution for custom domains, but doesn't create the DNS records

    // Create A and AAAA alias records pointing to the Cognito CloudFront distribution
    // A record for IPv4
    CfnRecordSet cognitoARecord = CfnRecordSet.Builder.create(
        this,
        resourceNamePrefix + "CognitoARecord")
        .name(cognitoDomainName + ".")
        .type("A")
        .hostedZoneId(props.hostedZoneId)
        .aliasTarget(CfnRecordSet.AliasTargetProperty.builder()
            .dnsName(this.domain.getAttrCloudFrontDistribution())
            .hostedZoneId(props.cloudFrontHostedZoneId)
            .build())
        .build();

    // AAAA record for IPv6
    CfnRecordSet cognitoAaaaRecord = CfnRecordSet.Builder.create(
        this,
        resourceNamePrefix + "CognitoAAAARecord")
        .name(cognitoDomainName + ".")
        .type("AAAA")
        .hostedZoneId(props.hostedZoneId)
        .aliasTarget(CfnRecordSet.AliasTargetProperty.builder()
            .dnsName(this.domain.getAttrCloudFrontDistribution())
            .hostedZoneId(props.cloudFrontHostedZoneId)
            .build())
        .build();

    this.client =
        CfnUserPoolClient.Builder.create(this, resourceNamePrefix + "-WebClient")
            .userPoolId(this.pool.getRef())
            .allowedOAuthFlows(List.of("code"))
            .allowedOAuthFlowsUserPoolClient(true)
            .allowedOAuthScopes(List.of("openid", "email", "profile"))
            .callbackUrLs(List.of(baseUrl + "/post-auth.html"))
            .logoutUrLs(List.of(baseUrl + "/"))
            .supportedIdentityProviders(List.of("OIDC"))
            .build();

    // OIDC IdP pointing to our issuer endpoints
    this.oidcIdp =
        CfnUserPoolIdentityProvider.Builder.create(this, resourceNamePrefix + "-OidcIdp")
            .providerName("OIDC")
            .providerType("OIDC")
            .userPoolId(this.pool.getRef())
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
        this, "CognitoAuthDomain", CfnOutputProps.builder().value(this.domain.getRef()).build());
    new CfnOutput(this, "UserPoolId", CfnOutputProps.builder().value(this.pool.getRef()).build());
    new CfnOutput(
        this,
        "UserPoolClientId",
        CfnOutputProps.builder().value(this.client.getRef()).build());
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
