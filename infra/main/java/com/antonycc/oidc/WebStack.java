package com.antonycc.oidc;

import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOACProps;
import software.amazon.awscdk.services.s3.Bucket;
import software.constructs.Construct;

import java.util.HashMap;

public class WebStack extends Stack {
    public final S3OriginConstruct webOriginBucket;
    public final Bucket webBucket;
    public final BehaviorOptions webOriginBehaviorOptions;

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

        var additionalOriginsBehaviourMappings = new HashMap<String, BehaviorOptions>();

        // Use Resources from the passed props

        // Buckets

        // Web origin bucket
        this.webOriginBucket = new S3OriginConstruct(
                this,
                props.resourceNamePrefix + "-WebBucket",
                S3OriginConstructProps.builder()
                        .bucketNameSuffix("web")
                        .logsPrefix("s3/web/")
                        // .logsBucket(logsBucket)
                        .bucketType(S3OriginBucketType.WEB)
                        .build());
        this.webBucket = this.webOriginBucket.bucket;

        // CloudFront Origin and Behavior Options for the web bucket
        IOrigin webBucketOrigin = S3BucketOrigin.withOriginAccessControl(webBucket, S3BucketOriginWithOACProps.builder().build());
        this.webOriginBehaviorOptions = BehaviorOptions.builder()
            .origin(webBucketOrigin)
            .compress(true)
            .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
            .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
            .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
            .responseHeadersPolicy(
                ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
            .build();

        // Outputs
        new CfnOutput(
                this,
                "WebOriginBucketName",
                CfnOutputProps.builder().value(this.webBucket.getBucketName()).build());
    }
}
