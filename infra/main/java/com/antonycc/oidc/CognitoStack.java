package com.antonycc.oidc;

import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.cognito.CfnUserPoolIdentityProvider;
import software.amazon.awscdk.services.cognito.CognitoDomainOptions;
import software.amazon.awscdk.services.cognito.OAuthFlows;
import software.amazon.awscdk.services.cognito.OAuthScope;
import software.amazon.awscdk.services.cognito.OAuthSettings;
import software.amazon.awscdk.services.cognito.SignInAliases;
import software.amazon.awscdk.services.cognito.UserPool;
import software.amazon.awscdk.services.cognito.UserPoolClient;
import software.amazon.awscdk.services.cognito.UserPoolClientIdentityProvider;
import software.amazon.awscdk.services.cognito.UserPoolClientOptions;
import software.amazon.awscdk.services.cognito.UserPoolDomain;
import software.amazon.awscdk.services.cognito.UserPoolDomainOptions;
import software.constructs.Construct;

import java.util.List;
import java.util.Map;

public class CognitoStack extends Stack {
    
    public CognitoStack(final Construct scope, final String id, final CognitoStackProps props) {
        super(scope, id, props);

        String domainName = props.domainName;
        String baseUrl = "https://" + domainName;

        // Cognito User Pool that federates to our OP (discovery served from CloudFront)
        UserPool pool = UserPool.Builder.create(this, "UserPool")
                .selfSignUpEnabled(false).signInAliases(SignInAliases.builder().username(true).build())
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        UserPoolDomain domain = pool.addDomain("CognitoDomain", UserPoolDomainOptions.builder()
                .cognitoDomain(CognitoDomainOptions.builder().domainPrefix(props.cognitoDomainPrefix).build())
                .build());

        UserPoolClient client = pool.addClient("WebClient", UserPoolClientOptions.builder()
                .oAuth(OAuthSettings.builder()
                        .flows(OAuthFlows.builder().authorizationCodeGrant(true).build())
                        .scopes(List.of(OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE))
                        .callbackUrls(List.of(baseUrl + "/post-auth.html"))
                        .logoutUrls(List.of(baseUrl + "/"))
                        .build())
                .supportedIdentityProviders(List.of(UserPoolClientIdentityProvider.custom("OIDC")))
                .build());

        // OIDC IdP pointing to our issuer endpoints
        CfnUserPoolIdentityProvider oidcIdp = CfnUserPoolIdentityProvider.Builder.create(this, "OidcIdp")
                .providerName("OIDC")
                .providerType("OIDC")
                .userPoolId(pool.getUserPoolId())
                .providerDetails(Map.of(
                        "attributes_request_method", "GET",
                        "oidc_issuer", baseUrl,
                        "authorize_scopes", "openid email profile",
                        "authorize_url", baseUrl + "/authorize",
                        "token_url", baseUrl + "/token",
                        "attributes_url", baseUrl + "/userinfo",
                        // This is the client_id Cognito will use with our OIDC provider. It must NOT reference the UserPoolClient.
                        // Using a static value avoids a CloudFormation dependency cycle between the IdP and the UserPoolClient.
                        "client_id", "cognito-web"))
                .attributeMapping(Map.of(
                        "email", "email",
                        "given_name", "name"))
                .build();

        // Ensure the OIDC identity provider is created before the client that references it
        client.getNode().addDependency(oidcIdp);

        // Outputs
        new CfnOutput(this, "CognitoAuthDomain", CfnOutputProps.builder().value(domain.getDomainName()).build());
        new CfnOutput(this, "UserPoolId", CfnOutputProps.builder().value(pool.getUserPoolId()).build());
        new CfnOutput(this, "UserPoolClientId", CfnOutputProps.builder().value(client.getUserPoolClientId()).build());
    }
}