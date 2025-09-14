package com.antonycc.oidc;

import java.util.List;
import java.util.Map;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.logs.FilterPattern;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.MetricFilter;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketAccessControl;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.ObjectOwnership;
import software.amazon.awscdk.services.xray.CfnGroup;
import software.constructs.Construct;

public class ObservabilityStack extends Stack {
    public final Bucket logsBucket;
    public final LogGroup trailLogGroup;
    public final Trail auditTrail;
    public final CfnGroup xrayGroup;
    public final MetricFilter authFailureMetricFilter;
    public final Alarm authFailureAlarm;
    public final MetricFilter securityEventMetricFilter;
    public final Alarm securityEventAlarm;

    public ObservabilityStack(final Construct scope, final String id, final ObservabilityStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        applyCostAllocationTags(props);

        // Log bucket for CloudFront and S3 access logs
        this.logsBucket = Bucket.Builder.create(this, props.resourceNamePrefix + "-LogsBucket")
                .bucketName(props.resourceNamePrefix + "-logs")
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .enforceSsl(true)
                .encryption(BucketEncryption.S3_MANAGED) // Explicit SSE-S3 encryption (zero cost)
                .autoDeleteObjects(true)
                .removalPolicy(RemovalPolicy.DESTROY)
                .objectOwnership(ObjectOwnership.BUCKET_OWNER_PREFERRED)
                .accessControl(BucketAccessControl.LOG_DELIVERY_WRITE)
                .lifecycleRules(List.of(software.amazon.awscdk.services.s3.LifecycleRule.builder()
                        .expiration(Duration.days(7))
                        .enabled(true)
                        .build()))
                .build();

        // Allow CloudFront log delivery to write objects with bucket-owner-full-control ACL
        final String accountId = Stack.of(this).getAccount();
        final String bucketName = this.logsBucket.getBucketName();
        this.logsBucket.addToResourcePolicy(PolicyStatement.Builder.create()
                .sid("AllowCloudFrontStandardLogs")
                .effect(Effect.ALLOW)
                .principals(List.of(new ServicePrincipal("delivery.logs.amazonaws.com")))
                .actions(List.of("s3:PutObject"))
                .resources(List.of(String.format("arn:aws:s3:::%s/AWSLogs/%s/*", bucketName, accountId)))
                .conditions(Map.of("StringEquals", Map.of("s3:x-amz-acl", "bucket-owner-full-control")))
                .build());

        // CloudTrail - capture management events and deliver to S3 and CloudWatch Logs
        this.trailLogGroup = LogGroup.Builder.create(this, props.resourceNamePrefix + "-CloudTrailLogGroup")
                .logGroupName("/aws/cloudtrail/" + props.resourceNamePrefix)
                .retention(RetentionDays.ONE_DAY) // Reduced from ONE_WEEK for cost optimization
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        this.auditTrail = Trail.Builder.create(this, props.resourceNamePrefix + "-AuditTrail")
                .trailName(props.resourceNamePrefix + "-audit-trail")
                .bucket(this.logsBucket)
                .cloudWatchLogGroup(this.trailLogGroup)
                .build();

        // X-Ray Group for Lambda traces
        this.xrayGroup = CfnGroup.Builder.create(this, props.resourceNamePrefix + "-XRayGroup")
                .groupName(props.compressedResourceNamePrefix + "-lambda-traces")
                .filterExpression("service(\"lambda\")")
                .insightsConfiguration(CfnGroup.InsightsConfigurationProperty.builder()
                        .insightsEnabled(true)
                        .build())
                .build();

        // Security Monitoring: Metric Filters and Alarms for authentication failures
        this.authFailureMetricFilter = MetricFilter.Builder.create(
                        this, props.resourceNamePrefix + "-AuthFailureMetricFilter")
                .logGroup(this.trailLogGroup)
                .metricNamespace("OIDC/Security")
                .metricName("AuthenticationFailures")
                .filterPattern(FilterPattern.anyTerm("invalid_client", "invalid_grant", "invalid_request"))
                .metricValue("1")
                .build();

        this.authFailureAlarm = Alarm.Builder.create(this, props.resourceNamePrefix + "-AuthFailureAlarm")
                .metric(Metric.Builder.create()
                        .namespace("OIDC/Security")
                        .metricName("AuthenticationFailures")
                        .statistic("Sum")
                        .period(Duration.minutes(5))
                        .build())
                .threshold(5.0) // Alert on 5+ auth failures in 5 minutes
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .evaluationPeriods(1)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("Multiple authentication failures detected - possible attack")
                .build();

        // Security Monitoring: Metric Filter for general security events
        this.securityEventMetricFilter = MetricFilter.Builder.create(
                        this, props.resourceNamePrefix + "-SecurityEventMetricFilter")
                .logGroup(this.trailLogGroup)
                .metricNamespace("OIDC/Security")
                .metricName("SecurityEvents")
                .filterPattern(FilterPattern.anyTerm("client_not_found", "redirect_validation", "scope_validation"))
                .metricValue("1")
                .build();

        this.securityEventAlarm = Alarm.Builder.create(this, props.resourceNamePrefix + "-SecurityEventAlarm")
                .metric(Metric.Builder.create()
                        .namespace("OIDC/Security")
                        .metricName("SecurityEvents")
                        .statistic("Sum")
                        .period(Duration.minutes(15))
                        .build())
                .threshold(10.0) // Alert on 10+ security events in 15 minutes
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .evaluationPeriods(1)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("Unusual security activity detected - review logs")
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
                CfnOutputProps.builder()
                        .value(this.trailLogGroup.getLogGroupArn())
                        .build());
        new CfnOutput(
                this,
                "TrailLogGroupName",
                CfnOutputProps.builder()
                        .value(this.trailLogGroup.getLogGroupName())
                        .build());
        new CfnOutput(
                this,
                "AuditTrailArn",
                CfnOutputProps.builder().value(this.auditTrail.getTrailArn()).build());
        new CfnOutput(
                this,
                "XRayGroupName",
                CfnOutputProps.builder().value(this.xrayGroup.getGroupName()).build());
    }

    /**
     * Apply comprehensive cost allocation tags for all resources in the stack
     */
    private void applyCostAllocationTags(ObservabilityStackProps props) {
        Tags.of(this).add("Environment", props.envName);
        Tags.of(this).add("Application", "oidc-provider");
        Tags.of(this).add("CostCenter", "authentication");
        Tags.of(this).add("Owner", "platform-team");
        Tags.of(this).add("Project", "identity-management");
        Tags.of(this).add("Stack", "ObservabilityStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");
    }
}
