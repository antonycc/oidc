package com.antonycc.oidc;

import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.xray.CfnGroup;
import software.constructs.Construct;

import java.util.List;

public class ObservabilityStack extends Stack {
  public final Bucket logsBucket;
  public final LogGroup trailLogGroup;
  public final Trail auditTrail;
  public final CfnGroup xrayGroup;
  public final LogGroup bucketDeploymentLogGroup;

  public ObservabilityStack(final Construct scope, final String id, final ObservabilityStackProps props) {
    super(scope, id, props);

    // Generate predictable resource name prefix based on domain and environment
    String resourceNamePrefix = generateResourceNamePrefix(props.domainName, props.envName);
    String compressedResourceNamePrefix = generateCompressedResourceNamePrefix(props.domainName, props.envName);

    // Log bucket for CloudFront and S3 access logs
    this.logsBucket =
        Bucket.Builder.create(this, resourceNamePrefix + "-LogsBucket")
            .bucketName(resourceNamePrefix + "-logs")
            .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
            .enforceSsl(true)
            .autoDeleteObjects(true)
            .removalPolicy(RemovalPolicy.DESTROY)
            .lifecycleRules(
                List.of(
                    software.amazon.awscdk.services.s3.LifecycleRule.builder()
                        .expiration(Duration.days(7))
                        .enabled(true)
                        .build()))
            .build();

    // CloudTrail - capture management events and deliver to S3 and CloudWatch Logs
    this.trailLogGroup =
        LogGroup.Builder.create(this, resourceNamePrefix + "-CloudTrailLogGroup")
            .logGroupName("/aws/cloudtrail/" + resourceNamePrefix)
            .retention(RetentionDays.ONE_WEEK)
            .removalPolicy(RemovalPolicy.DESTROY)
            .build();
    this.auditTrail =
        Trail.Builder.create(this, resourceNamePrefix + "-AuditTrail")
            .trailName(resourceNamePrefix + "-audit-trail")
            .bucket(this.logsBucket)
            .cloudWatchLogGroup(this.trailLogGroup)
            .build();

    // X-Ray Group for Lambda traces
    this.xrayGroup =
        CfnGroup.Builder.create(this, resourceNamePrefix + "-XRayGroup")
            .groupName(compressedResourceNamePrefix + "-lambda-traces")
            .filterExpression("service(\"lambda\")")
            .insightsConfiguration(
                CfnGroup.InsightsConfigurationProperty.builder().insightsEnabled(true).build())
            .build();

    this.bucketDeploymentLogGroup =
        LogGroup.Builder.create(this, resourceNamePrefix + "-BucketDeploymentLogGroup")
            .logGroupName("/deployment/" + resourceNamePrefix + "-bucket-deployment")
            .retention(RetentionDays.ONE_WEEK)
            .removalPolicy(RemovalPolicy.DESTROY)
            .build();

    // Outputs for the created observability resources
    new CfnOutput(
        this, 
        "LogsBucketArn", 
        CfnOutputProps.builder().value(this.logsBucket.getBucketArn()).build());
    new CfnOutput(
        this, 
        "LogsBucketName", 
        CfnOutputProps.builder().value(this.logsBucket.getBucketName()).build());
    new CfnOutput(
        this, 
        "TrailLogGroupArn", 
        CfnOutputProps.builder().value(this.trailLogGroup.getLogGroupArn()).build());
    new CfnOutput(
        this, 
        "TrailLogGroupName", 
        CfnOutputProps.builder().value(this.trailLogGroup.getLogGroupName()).build());
    new CfnOutput(
        this, 
        "AuditTrailArn", 
        CfnOutputProps.builder().value(this.auditTrail.getTrailArn()).build());
    new CfnOutput(
        this, 
        "XRayGroupName", 
        CfnOutputProps.builder().value(this.xrayGroup.getGroupName()).build());
    new CfnOutput(
        this, 
        "BucketDeploymentLogGroupArn", 
        CfnOutputProps.builder().value(this.bucketDeploymentLogGroup.getLogGroupArn()).build());
    new CfnOutput(
        this, 
        "BucketDeploymentLogGroupName", 
        CfnOutputProps.builder().value(this.bucketDeploymentLogGroup.getLogGroupName()).build());
  }

  /**
   * Generate a predictable resource name prefix based on domain name and environment.
   * Converts domain like "oidc.example.com" to "oidc-example-com" and adds environment.
   */
  private static String generateResourceNamePrefix(String domainName, String envName) {
    String dashedDomainName = domainName.replace('.', '-');
    return dashedDomainName + "-" + envName;
  }

  /**
   * Generate a shortened predictable resource name prefix based on domain and environment.
   * Steps:
   * 1. Replace dots with dashes.
   * 2. Split on dashes.
   * 3. Keep segment "oidc" intact; compress all other non-empty segments to their first letter.
   * 4. Append '-' + environment name (environment kept whole).
   *
   * Examples:
   *   domain=oidc.example.com, env=dev  -> oidc-e-c-dev
   *   domain=login.auth.service.example.com, env=prod -> l-a-s-e-c-prod
   *
   * @param domainName fully qualified domain name (e.g. "oidc.example.com")
   * @param envName environment name (e.g. "dev")
   * @return compressed resource name prefix
   */
  private static String generateCompressedResourceNamePrefix(String domainName, String envName) {
    if (domainName == null || domainName.isBlank()) {
      throw new IllegalArgumentException("domainName must be non-empty");
    }
    if (envName == null || envName.isBlank()) {
      throw new IllegalArgumentException("envName must be non-empty");
    }

    String dashed = domainName.replace('.', '-').toLowerCase();
    String[] parts = dashed.split("-+");
    StringBuilder sb = new StringBuilder();
    for (String part : parts) {
      if (part.isEmpty()) {
        continue;
      }
      if (sb.length() > 0) {
        sb.append('-');
      }
      if ("oidc".equals(part)) {
        sb.append("oidc");
      } else {
        sb.append(part.charAt(0));
      }
    }
    sb.append('-').append(envName);
    return sb.toString();
  }
}