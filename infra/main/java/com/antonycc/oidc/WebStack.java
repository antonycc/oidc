package com.antonycc.oidc;

import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOAIProps;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.constructs.Construct;

public class WebStack extends Stack {
    public final Bucket webBucket;
    public final OriginAccessIdentity originAccessIdentity;
    public final IOrigin origin;
    public final BehaviorOptions behaviorOptions;

    public WebStack(final Construct scope, final String id, final WebStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName);
        Tags.of(this).add("Application", "oidc-provider");
        Tags.of(this).add("CostCenter", "authentication");
        Tags.of(this).add("Owner", "platform-team");
        Tags.of(this).add("Project", "identity-management");
        Tags.of(this).add("DeploymentName", props.deploymentName);
        Tags.of(this).add("Stack", "WebStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-oidc");
        Tags.of(this).add("Criticality", "high");
        Tags.of(this).add("DataClassification", "confidential");
        Tags.of(this).add("BackupRequired", "true");
        Tags.of(this).add("MonitoringEnabled", "true");

        // Bucket

        this.webBucket = Bucket.Builder.create(this, props.resourceNamePrefix + "-WebBucket")
                .bucketName(props.resourceNamePrefix + "-" + "web")
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .enforceSsl(true)
                .encryption(BucketEncryption.S3_MANAGED) // Explicit SSE-S3 encryption (zero cost)
                .autoDeleteObjects(true)
                .removalPolicy(RemovalPolicy.DESTROY)
                .serverAccessLogsPrefix("s3/web/")
                .build();

        // Create the OriginAccessIdentity for CloudFront access
        this.originAccessIdentity = OriginAccessIdentity.Builder.create(
                        this, props.resourceNamePrefix + "-OriginAccessIdentity")
                // .comment(props.oaiComment)
                .build();

        // Grant read access to the OAI
        this.webBucket.grantRead(this.originAccessIdentity);

        // Create the S3BucketOrigin
        this.origin = S3BucketOrigin.withOriginAccessIdentity(
                this.webBucket,
                S3BucketOriginWithOAIProps.builder()
                        .originAccessIdentity(this.originAccessIdentity)
                        .build());

        this.behaviorOptions = BehaviorOptions.builder()
                .origin(this.origin)
                .compress(true)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .build();

        // Outputs
        new CfnOutput(
                this,
                "WebOriginBucketName",
                CfnOutputProps.builder().value(this.webBucket.getBucketName()).build());
        new CfnOutput(
                this,
                "WebOriginAccessIdentity",
                CfnOutputProps.builder()
                        .value(this.originAccessIdentity.getOriginAccessIdentityName())
                        .build());
        new CfnOutput(
                this,
                "WebOriginId",
                CfnOutputProps.builder().value(this.origin.toString()).build());
        new CfnOutput(
                this,
                "WebBehaviorOptions",
                CfnOutputProps.builder().value(this.behaviorOptions.toString()).build());
    }
}
