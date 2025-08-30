package com.antonycc.oidc;

import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.DistributionAttributes;
import software.amazon.awscdk.services.cognito.CfnUserPool;
import software.amazon.awscdk.services.cognito.CfnUserPoolClient;
import software.amazon.awscdk.services.cognito.CfnUserPoolDomain;
import software.amazon.awscdk.services.cognito.CfnUserPoolIdentityProvider;
import software.amazon.awscdk.services.cognito.CfnUserPoolUICustomizationAttachment;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.ARecordProps;
import software.amazon.awscdk.services.route53.AaaaRecord;
import software.amazon.awscdk.services.route53.AaaaRecordProps;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.RecordTarget;
import software.amazon.awscdk.services.route53.targets.CloudFrontTarget;
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
    String cognitoDomainName = props.authDomainName;
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
            // Enhanced password policy for better frontend UX
            .policies(
                CfnUserPool.PoliciesProperty.builder()
                    .passwordPolicy(
                        CfnUserPool.PasswordPolicyProperty.builder()
                            .minimumLength(8)
                            .requireLowercase(true)
                            .requireNumbers(true)
                            .requireSymbols(false)
                            .requireUppercase(true)
                            .temporaryPasswordValidityDays(7)
                            .build())
                    .build())
            // User attributes for enhanced profile management
            .autoVerifiedAttributes(List.of("email"))
            .schema(List.of(
                CfnUserPool.SchemaAttributeProperty.builder()
                    .attributeDataType("String")
                    .name("given_name")
                    .required(false)
                    .mutable(true)
                    .build(),
                CfnUserPool.SchemaAttributeProperty.builder()
                    .attributeDataType("String")
                    .name("family_name")
                    .required(false)
                    .mutable(true)
                    .build()))
            // MFA configuration for enhanced security
            .mfaConfiguration("OPTIONAL")
            .enabledMfas(List.of("EMAIL_OTP"))
            // Enhanced verification messages
            .emailVerificationMessage("Welcome! Your verification code is {####}. Please enter this code to verify your email address.")
            .emailVerificationSubject("Welcome - Verify your account")
            .smsVerificationMessage("Your verification code is {####}")
            .verificationMessageTemplate(
                CfnUserPool.VerificationMessageTemplateProperty.builder()
                    .defaultEmailOption("CONFIRM_WITH_CODE")
                    .emailMessage("Welcome! Your verification code is {####}. Please enter this code to verify your email address.")
                    .emailSubject("Welcome - Verify your account")
                    .emailMessageByLink("Welcome! Please click the link below to verify your email address: {##Click Here##}")
                    .emailSubjectByLink("Welcome - Verify your account")
                    .smsMessage("Your verification code is {####}")
                    .build())
            // User pool add-ons for enhanced functionality
            .userPoolAddOns(
                CfnUserPool.UserPoolAddOnsProperty.builder()
                    .advancedSecurityMode("AUDIT")
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
/*
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
            .hostedZoneId(props.hostedZoneId)
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
            .hostedZoneId(props.hostedZoneId)
            .build())
        .build();*/

      // Create A and AAAA records pointing to the CloudFront distribution
      var hostedZone = HostedZone.fromHostedZoneAttributes(this, "HostedZone",
              HostedZoneAttributes.builder()
                      .hostedZoneId(props.hostedZoneId)
                      .zoneName(domainName) // e.g. example.com
                      .build());
      var distributionDomainName = this.domain.getAttrCloudFrontDistribution();
      var distribution = Distribution.fromDistributionAttributes(this, "CognitoDistribution",
              DistributionAttributes.builder()
                      .domainName(distributionDomainName)
                      .distributionId(distributionDomainName) // Using domain name as ID since we don't have the actual ID
                      .build());
      new ARecord(this, "CognitoARecord",
              ARecordProps.builder()
                      .zone(hostedZone)
                      .recordName(cognitoDomainName + ".")
                      .target(RecordTarget.fromAlias(new CloudFrontTarget(distribution)))
                      .build());
      new AaaaRecord(this, "CognitoAaaaRecord",
              AaaaRecordProps.builder()
                      .zone(hostedZone)
                      .recordName(cognitoDomainName + ".")
                      .target(RecordTarget.fromAlias(new CloudFrontTarget(distribution)))
                      .build());

    this.client =
        CfnUserPoolClient.Builder.create(this, resourceNamePrefix + "-WebClient")
            .userPoolId(this.pool.getRef())
            .clientName(resourceNamePrefix + "-web-client")
            // OAuth flow configuration
            .allowedOAuthFlows(List.of("code"))
            .allowedOAuthFlowsUserPoolClient(true)
            .allowedOAuthScopes(List.of("openid", "email", "profile", "aws.cognito.signin.user.admin"))
            .callbackUrLs(List.of(baseUrl + "/post-auth.html"))
            .logoutUrLs(List.of(baseUrl + "/"))
            .supportedIdentityProviders(List.of("OIDC"))
            // Enhanced frontend UI settings
            .generateSecret(false) // For public clients (SPAs, mobile apps)
            .explicitAuthFlows(List.of(
                "ALLOW_USER_SRP_AUTH",
                "ALLOW_REFRESH_TOKEN_AUTH",
                "ALLOW_USER_PASSWORD_AUTH"))
            // Token validity configuration for better UX
            .accessTokenValidity(1) // 1 hour
            .idTokenValidity(1) // 1 hour  
            .refreshTokenValidity(30) // 30 days
            .tokenValidityUnits(
                CfnUserPoolClient.TokenValidityUnitsProperty.builder()
                    .accessToken("hours")
                    .idToken("hours")
                    .refreshToken("days")
                    .build())
            // Prevent user existence errors for better security UX
            .preventUserExistenceErrors("ENABLED")
            // Enable refresh token rotation for security
            .enableTokenRevocation(true)
            .build();

    // Add UI customization for better frontend user experience
    var uiCustomization = CfnUserPoolUICustomizationAttachment.Builder.create(
        this, resourceNamePrefix + "-UICustomization")
        .userPoolId(this.pool.getRef())
        .clientId(this.client.getRef())
        // Custom CSS for better branding and UX
        .css("""
            .banner-customizable {
                padding: 25px 0px 25px 0px;
                background-color: #2196F3;
            }
            .label-customizable {
                font-weight: 400;
                color: #333;
            }
            .textDescription-customizable {
                padding-top: 10px;
                padding-bottom: 10px;
                display: block;
                font-size: 16px;
                color: #555;
            }
            .submitButton-customizable {
                font-size: 14px;
                font-weight: bold;
                margin: 20px 0px 10px 0px;
                height: 40px;
                width: 100%;
                color: #fff;
                background-color: #2196F3;
                border: none;
                border-radius: 4px;
            }
            .submitButton-customizable:hover {
                background-color: #1976D2;
            }
            .errorMessage-customizable {
                padding: 5px;
                font-size: 14px;
                width: 100%;
                background: #F5F5F5;
                border: 2px solid #D32F2F;
                color: #D32F2F;
            }
            .inputField-customizable {
                width: 100%;
                height: 34px;
                color: #555;
                background-color: #fff;
                border: 1px solid #ccc;
                border-radius: 4px;
                box-shadow: inset 0 1px 1px rgba(0,0,0,.075);
                box-sizing: border-box;
                padding: 6px 12px;
            }
            .inputField-customizable:focus {
                border-color: #2196F3;
                box-shadow: inset 0 1px 1px rgba(0,0,0,.075), 0 0 0 3px rgba(33, 150, 243, .1);
            }
            .idpButton-customizable {
                height: 40px;
                width: 100%;
                text-align: center;
                margin-bottom: 15px;
                color: #fff;
                background-color: #5bc0de;
                border: 1px solid #46b8da;
                border-radius: 4px;
            }
            .idpButton-customizable:hover {
                background-color: #31b0d5;
            }
            """)
        .build();

    // Ensure UI customization is created after both pool and client
    uiCustomization.getNode().addDependency(this.pool);
    uiCustomization.getNode().addDependency(this.client);

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
