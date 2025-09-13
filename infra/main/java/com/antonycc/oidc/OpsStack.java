package com.antonycc.oidc;

import java.util.List;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.DistributionAttributes;
import software.amazon.awscdk.services.cloudfront.IDistribution;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Dashboard;
import software.amazon.awscdk.services.cloudwatch.GraphWidget;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Operation;
import software.amazon.awscdk.services.dynamodb.OperationsMetricOptions;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionAttributes;
import software.amazon.awscdk.services.lambda.IFunction;
import software.constructs.Construct;

public class OpsStack extends Stack {
    public final Alarm authorizeErrorAlarm;
    public final Alarm authorizeDurationAlarm;
    public final Alarm tokenErrorAlarm;
    public final Alarm lambdaThrottleAlarm;
    public final Alarm dynamoDbUserThrottleAlarm;
    public final Alarm dynamoDbAuthCodeThrottleAlarm;
    public final Alarm dynamoDbRefreshTokenThrottleAlarm;
    public final Dashboard operationalDashboard;

    public OpsStack(final Construct scope, final String id, final OpsStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName);
        Tags.of(this).add("Application", "oidc-provider");
        Tags.of(this).add("CostCenter", "authentication");
        Tags.of(this).add("Owner", "platform-team");
        Tags.of(this).add("Project", "identity-management");
        Tags.of(this).add("DeploymentName", props.deploymentName);
        Tags.of(this).add("Stack", "OpsStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-oidc");
        Tags.of(this).add("Criticality", "high");
        Tags.of(this).add("DataClassification", "confidential");
        Tags.of(this).add("BackupRequired", "true");
        Tags.of(this).add("MonitoringEnabled", "true");

        // Use resources from the passed props
        IFunction jwksEndpointFunction = Function.fromFunctionAttributes(
                this,
                "JwksEndpointFunction",
                FunctionAttributes.builder()
                        .functionArn(props.jwksEndpointFunctionArn)
                        .sameEnvironment(true)
                        .build());
        IFunction authorizeEndpointFunction = Function.fromFunctionAttributes(
                this,
                "AuthorizeEndpointFunction",
                FunctionAttributes.builder()
                        .functionArn(props.authorizeEndpointFunctionArn)
                        .sameEnvironment(true)
                        .build());
        IFunction tokenEndpointFunction = Function.fromFunctionAttributes(
                this,
                "TokenEndpointFunction",
                FunctionAttributes.builder()
                        .functionArn(props.tokenEndpointFunctionArn)
                        .sameEnvironment(true)
                        .build());
        IFunction userinfoEndpointFunction = Function.fromFunctionAttributes(
                this,
                "UserinfoEndpointFunction",
                FunctionAttributes.builder()
                        .functionArn(props.userinfoEndpointFunctionArn)
                        .sameEnvironment(true)
                        .build());
        ITable usersTable = Table.fromTableArn(this, "UsersTable", props.usersTableArn);
        ITable authCodesTable = Table.fromTableArn(this, "AuthCodesTable", props.authCodesTableArn);
        ITable refreshTokensTable = Table.fromTableArn(this, "RefreshTokensTable", props.refreshTokensTableArn);
        IDistribution distribution = Distribution.fromDistributionAttributes(
                this,
                "CloudFrontDistribution",
                DistributionAttributes.builder()
                        .distributionId(props.distributionId)
                        .domainName(props.domainName)
                        .build());

        // Error rate alarm for authorize endpoint
        this.authorizeErrorAlarm = Alarm.Builder.create(this, props.resourceNamePrefix + "-AuthorizeErrorAlarm")
                .alarmName(props.compressedResourceNamePrefix + "-authorize-errors")
                .metric(authorizeEndpointFunction.metricErrors())
                .threshold(3.0) // Alert on 3+ errors in evaluation period
                .evaluationPeriods(2) // Over 2 evaluation periods (10 minutes)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("High error rate detected in authorize endpoint")
                .build();

        // Duration alarm for authorize endpoint (cold start monitoring)
        this.authorizeDurationAlarm = Alarm.Builder.create(this, props.resourceNamePrefix + "-AuthorizeDurationAlarm")
                .alarmName(props.compressedResourceNamePrefix + "-authorize-duration")
                .metric(authorizeEndpointFunction.metricDuration())
                .threshold(10000.0) // Alert if duration > 10 seconds
                .evaluationPeriods(3) // Over 3 evaluation periods (15 minutes)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("High duration detected in authorize endpoint - possible cold start issues")
                .build();

        // Error rate alarm for token endpoint (most critical)
        this.tokenErrorAlarm = Alarm.Builder.create(this, props.resourceNamePrefix + "-TokenErrorAlarm")
                .alarmName(props.compressedResourceNamePrefix + "-token-errors")
                .metric(tokenEndpointFunction.metricErrors())
                .threshold(2.0) // Lower threshold for critical token endpoint
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("High error rate detected in token endpoint - critical for authentication flow")
                .build();

        // Throttle alarm for all endpoints (simplified approach)
        this.lambdaThrottleAlarm = Alarm.Builder.create(this, props.resourceNamePrefix + "-LambdaThrottleAlarm")
                .alarmName(props.compressedResourceNamePrefix + "-lambda-throttles")
                .metric(authorizeEndpointFunction.metricThrottles())
                .threshold(1.0) // Alert on any throttling
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("Lambda function throttling detected - may need reserved concurrency")
                .build();

        OperationsMetricOptions dynamoDbMetricOptions = OperationsMetricOptions.builder()
                .operations(List.of(
                        Operation.GET_ITEM,
                        Operation.PUT_ITEM,
                        Operation.UPDATE_ITEM,
                        Operation.DELETE_ITEM,
                        Operation.QUERY,
                        Operation.SCAN))
                .build();

        // DynamoDB user table throttling alarm
        this.dynamoDbUserThrottleAlarm = Alarm.Builder.create(
                        this, props.resourceNamePrefix + "-DynamoDbUserThrottleAlarm")
                .alarmName(props.compressedResourceNamePrefix + "-dynamodb-user-throttles")
                .metric(usersTable.metricThrottledRequestsForOperations(dynamoDbMetricOptions))
                .threshold(1.0) // Alert on any throttling
                .evaluationPeriods(2) // Over 2 evaluation periods (10 minutes)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("DynamoDB throttling detected on users table - may need on-demand scaling review")
                .build();

        // DynamoDB auth codes table throttling alarm
        this.dynamoDbAuthCodeThrottleAlarm = Alarm.Builder.create(
                        this, props.resourceNamePrefix + "-DynamoDbAuthCodesThrottleAlarm")
                .alarmName(props.compressedResourceNamePrefix + "-dynamodb-auth-codes-throttles")
                .metric(authCodesTable.metricThrottledRequestsForOperations(dynamoDbMetricOptions))
                .threshold(1.0)
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("DynamoDB throttling detected on auth codes table - critical for authentication flow")
                .build();

        // DynamoDB refresh tokens table throttling alarm
        this.dynamoDbRefreshTokenThrottleAlarm = Alarm.Builder.create(
                        this, props.resourceNamePrefix + "-DynamoDbRefreshTokensThrottleAlarm")
                .alarmName(props.compressedResourceNamePrefix + "-dynamodb-refresh-tokens-throttles")
                .metric(refreshTokensTable.metricThrottledRequestsForOperations(dynamoDbMetricOptions))
                .threshold(1.0)
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("DynamoDB throttling detected on refresh tokens table - may impact token refresh")
                .build();

        // Create CloudWatch dashboard with key metrics
        this.operationalDashboard = Dashboard.Builder.create(this, props.resourceNamePrefix + "-OperationalDashboard")
                .dashboardName(props.compressedResourceNamePrefix + "-operations")
                .widgets(List.of(List.of(
                        // Lambda invocation metrics
                        GraphWidget.Builder.create()
                                .title("Lambda Invocations by Endpoint")
                                .region(this.getRegion())
                                .left(List.of(
                                        authorizeEndpointFunction.metricInvocations(),
                                        tokenEndpointFunction.metricInvocations(),
                                        userinfoEndpointFunction.metricInvocations(),
                                        jwksEndpointFunction.metricInvocations()))
                                .width(12)
                                .height(6)
                                .build(),
                        // Lambda error metrics
                        GraphWidget.Builder.create()
                                .title("Lambda Errors by Endpoint")
                                .region(this.getRegion())
                                .left(List.of(
                                        authorizeEndpointFunction.metricErrors(),
                                        tokenEndpointFunction.metricErrors(),
                                        userinfoEndpointFunction.metricErrors(),
                                        jwksEndpointFunction.metricErrors()))
                                .width(12)
                                .height(6)
                                .build(),
                        // Lambda duration metrics
                        GraphWidget.Builder.create()
                                .title("Lambda Duration by Endpoint")
                                .region(this.getRegion())
                                .left(List.of(
                                        authorizeEndpointFunction.metricDuration(),
                                        tokenEndpointFunction.metricDuration(),
                                        userinfoEndpointFunction.metricDuration(),
                                        jwksEndpointFunction.metricDuration()))
                                .width(12)
                                .height(6)
                                .build(),
                        // Lambda throttle metrics
                        GraphWidget.Builder.create()
                                .title("Lambda Throttles")
                                .region(this.getRegion())
                                .left(List.of(
                                        authorizeEndpointFunction.metricThrottles(),
                                        tokenEndpointFunction.metricThrottles(),
                                        userinfoEndpointFunction.metricThrottles(),
                                        jwksEndpointFunction.metricThrottles()))
                                .width(12)
                                .height(6)
                                .build(),
                        // CloudFront metrics
                        // GraphWidget.Builder.create()
                        //    .title("CloudFront Requests and Data Transfer")
                        //    .region(this.getRegion())
                        //    .left(List.of(
                        //        distribution.metricRequests(),
                        //        distribution.metricBytesDownloaded()
                        //    ))
                        //    .width(12)
                        //    .height(6)
                        //    .build(),
                        // DynamoDB metrics
                        GraphWidget.Builder.create()
                                .title("DynamoDB Consumed Capacity")
                                .region(this.getRegion())
                                .left(List.of(
                                        usersTable.metricConsumedReadCapacityUnits(),
                                        authCodesTable.metricConsumedReadCapacityUnits(),
                                        refreshTokensTable.metricConsumedReadCapacityUnits()))
                                .right(List.of(
                                        usersTable.metricConsumedWriteCapacityUnits(),
                                        authCodesTable.metricConsumedWriteCapacityUnits(),
                                        refreshTokensTable.metricConsumedWriteCapacityUnits()))
                                .width(12)
                                .height(6)
                                .build())))
                .build();

        // Outputs
        new CfnOutput(
                this,
                "AuthorizeErrorAlarmArn",
                CfnOutputProps.builder()
                        .value(this.authorizeErrorAlarm.getAlarmArn())
                        .build());
        new CfnOutput(
                this,
                "AuthorizeDurationAlarmArn",
                CfnOutputProps.builder()
                        .value(this.authorizeDurationAlarm.getAlarmArn())
                        .build());
        new CfnOutput(
                this,
                "TokenErrorAlarmArn",
                CfnOutputProps.builder()
                        .value(this.tokenErrorAlarm.getAlarmArn())
                        .build());
        new CfnOutput(
                this,
                "LambdaThrottleAlarmArn",
                CfnOutputProps.builder()
                        .value(this.lambdaThrottleAlarm.getAlarmArn())
                        .build());
        new CfnOutput(
                this,
                "DynamoDbUserThrottleAlarmArn",
                CfnOutputProps.builder()
                        .value(this.dynamoDbUserThrottleAlarm.getAlarmArn())
                        .build());
        new CfnOutput(
                this,
                "DynamoDbAuthCodeThrottleAlarmArn",
                CfnOutputProps.builder()
                        .value(this.dynamoDbAuthCodeThrottleAlarm.getAlarmArn())
                        .build());
        new CfnOutput(
                this,
                "DynamoDbRefreshTokenThrottleAlarmArn",
                CfnOutputProps.builder()
                        .value(this.dynamoDbRefreshTokenThrottleAlarm.getAlarmArn())
                        .build());
        new CfnOutput(
                this,
                "OperationalDashboard",
                CfnOutputProps.builder()
                        .value("https://" + this.getRegion() + ".console.aws.amazon.com/cloudwatch/home?region="
                                + this.getRegion() + "#dashboards:name=" + this.operationalDashboard.getDashboardName())
                        .build());
    }
}
