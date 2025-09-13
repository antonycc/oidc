package com.antonycc.oidc;

import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.s3.Bucket;
import software.constructs.Construct;

public class WebStack extends Stack {
    public final S3OriginConstruct webOriginBucket;
    public final Bucket webBucket;

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

        // Buckets
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

        // Outputs
        new CfnOutput(
                this,
                "WebOriginBucketName",
                CfnOutputProps.builder().value(this.webBucket.getBucketName()).build());
    }
}
