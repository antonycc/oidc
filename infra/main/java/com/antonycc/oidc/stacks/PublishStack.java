package com.antonycc.oidc.stacks;

import java.util.List;
import software.amazon.awscdk.AssetHashType;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Expiration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.DistributionAttributes;
import software.amazon.awscdk.services.cloudfront.IDistribution;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.constructs.Construct;

public class PublishStack extends Stack {
    public final BucketDeployment webDeployment;
    public final BucketDeployment wellKnownDeployment;
    public final String baseUrl;

    public PublishStack(final Construct scope, final String id, final PublishStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName);
        Tags.of(this).add("Application", "oidc-provider");
        Tags.of(this).add("CostCenter", "@antonycc/oidc");
        Tags.of(this).add("Owner", "@antonycc/oidc");
        Tags.of(this).add("Project", "oidc-provider");
        Tags.of(this).add("DeploymentName", props.deploymentName);
        Tags.of(this).add("Stack", "EdgeStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-oidc");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "true");

        // Use Resources from the passed props
        this.baseUrl = props.baseUrl;
        DistributionAttributes distributionAttributes = DistributionAttributes.builder()
                .domainName(props.domainName)
                .distributionId(props.distributionId)
                .build();
        IDistribution distribution = Distribution.fromDistributionAttributes(
                this, props.resourceNamePrefix + "-ImportedWebDist", distributionAttributes);

        var deployPostfix = java.util.UUID.randomUUID().toString().substring(0, 8);

        // Deploy the web website files to the web website bucket and invalidate distribution
        var webDocRootSource = Source.asset(
                "web",
                AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
        var webDeploymentLogGroup = LogGroup.Builder.create(this, props.resourceNamePrefix + "-WebDeploymentLogGroup")
                .logGroupName("/deployment/" + props.resourceNamePrefix + "-web-deployment-" + deployPostfix)
                .retention(RetentionDays.ONE_DAY)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        this.webDeployment = BucketDeployment.Builder.create(
                        this, props.resourceNamePrefix + "-DocRootToWebOriginDeployment")
                .sources(List.of(webDocRootSource))
                .destinationBucket(props.webBucket)
                .distribution(distribution)
                .distributionPaths(List.of("/*"))
                .retainOnDelete(false)
                .logGroup(webDeploymentLogGroup)
                .expires(Expiration.after(Duration.minutes(5)))
                .prune(true)
                .build();

        // Deploy the well-known website files to the well-known bucket under /.well-known/ with a random suffix on the
        // Translate "https://oidc.antonycc.com" in well-known/openid-configuration to `baseUrl` using asset bundling
        // options
        // var assetOptions = AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build();
        var wellKnownDirectory = "well-known";
        var openIdConfigFilepath = "openid-configuration"; // inside bundling context root
        var prodBaseUrl = "https://oidc.antonycc.com";
        var assetOptionsCommand = List.of(
                "bash",
                "-c",
                "set -euo pipefail; " + "cp -R /asset-input/* /asset-output/; "
                        + "sed -i \"s|"
                        + prodBaseUrl + "|" + props.baseUrl + "|g\" /asset-output/" + openIdConfigFilepath + ";");
        var assetBundlingImage =
                software.amazon.awscdk.DockerImage.fromRegistry("public.ecr.aws/amazonlinux/amazonlinux:2023");
        var assetOptions = AssetOptions.builder()
                .assetHashType(AssetHashType.OUTPUT)
                .bundling(software.amazon.awscdk.BundlingOptions.builder()
                        .image(assetBundlingImage)
                        .command(assetOptionsCommand)
                        .build())
                .build();
        var wellKnownRootSource = Source.asset(wellKnownDirectory, assetOptions);
        var wellKnownDeploymentLogGroup = LogGroup.Builder.create(
                        this, props.resourceNamePrefix + "-WellKnownDeploymentLogGroup")
                .logGroupName("/deployment/" + props.resourceNamePrefix + "-well-known-deployment-" + deployPostfix)
                .retention(RetentionDays.ONE_DAY)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        this.wellKnownDeployment = BucketDeployment.Builder.create(
                        this, props.resourceNamePrefix + "-DocRootToWellKnownOriginDeployment")
                .sources(List.of(wellKnownRootSource))
                .destinationBucket(props.wellKnownBucket)
                .destinationKeyPrefix("." + wellKnownDirectory + "/")
                .distribution(distribution)
                .distributionPaths(List.of("/." + wellKnownDirectory + "/*"))
                .retainOnDelete(false)
                .logGroup(wellKnownDeploymentLogGroup)
                .expires(Expiration.after(Duration.minutes(5)))
                .prune(true)
                .build();

        // Outputs
    }
}
