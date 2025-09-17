package com.antonycc.oidc.stacks;

import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.RuleTargetInput;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.lambda.Tracing;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.antonycc.oidc.utils.ResourceNameUtils.generateIamCompatibleName;

public class SelfDestructStack extends Stack {
    public final LogGroup logGroup;
    public final Role functionRole;
    public final Function selfDestructFunction;
    public final Rule selfDestructSchedule;

    public SelfDestructStack(final Construct scope, final String id, final SelfDestructStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName);
        Tags.of(this).add("Application", "oidc-provider");
        Tags.of(this).add("CostCenter", "@antonycc/oidc");
        Tags.of(this).add("Owner", "@antonycc/oidc");
        Tags.of(this).add("Project", "oidc-provider");
        Tags.of(this).add("DeploymentName", props.deploymentName);
        Tags.of(this).add("Stack", "SelfDestructStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-oidc");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "true");

        // Log group for self-destruct function
        String functionName = props.resourceNamePrefix + "-self-destruct";
        this.logGroup = LogGroup.Builder.create(this, props.resourceNamePrefix + "-SelfDestructLogGroup")
                .logGroupName("/aws/lambda/" + functionName)
                .retention(RetentionDays.ONE_WEEK) // Longer retention for operations
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // IAM role for the self-destruct Lambda function
        String roleName = generateIamCompatibleName(props.resourceNamePrefix, "-self-destruct-role");
        this.functionRole = Role.Builder.create(this, props.resourceNamePrefix + "-SelfDestructRole")
                .roleName(roleName)
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .managedPolicies(List.of(
                        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
                        ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess")))
                .inlinePolicies(Map.of(
                        "SelfDestructPolicy",
                        software.amazon.awscdk.services.iam.PolicyDocument.Builder.create()
                                .statements(List.of(
                                        // CloudFormation permissions to delete stacks
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of(
                                                        "cloudformation:DeleteStack",
                                                        "cloudformation:DescribeStacks",
                                                        "cloudformation:DescribeStackEvents",
                                                        "cloudformation:ListStacks"))
                                                .resources(List.of("*"))
                                                .build(),
                                        // Allow deletion of all resources that might be in the stacks
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of(
                                                        "lambda:*",
                                                        "dynamodb:*",
                                                        "s3:*",
                                                        "cloudfront:*",
                                                        "route53:*",
                                                        "logs:*",
                                                        "iam:*",
                                                        "ecr:*",
                                                        "cloudwatch:*",
                                                        "acm:*",
                                                        "events:*"))
                                                .resources(List.of("*"))
                                                .build()))
                                .build()))
                .build();

        // Environment variables for the function
        Map<String, String> environment = new HashMap<>();
        environment.put("AWS_XRAY_TRACING_NAME", functionName);
        environment.put("OBSERVABILITY_STACK_NAME", props.observabilityStackName);
        environment.put("DEV_STACK_NAME", props.devStackName);
        environment.put("APP_STACK_NAME", props.appStackName);
        environment.put("WEB_STACK_NAME", props.webStackName);
        environment.put("EDGE_STACK_NAME", props.edgeStackName);
        environment.put("PUBLISH_STACK_NAME", props.publishStackName);
        environment.put("OPS_STACK_NAME", props.opsStackName);
        environment.put("SELF_DESTRUCT_STACK_NAME", this.getStackName());

        // Lambda function for self-destruction
        this.selfDestructFunction = Function.Builder.create(this, props.resourceNamePrefix + "-SelfDestructFunction")
                .functionName(functionName)
                .runtime(Runtime.JAVA_21)
                .handler("com.antonycc.oidc.functions.SelfDestructHandler::handleRequest")
                .code(Code.fromAsset(props.selfDestructHandlerSource))
                .timeout(Duration.minutes(15)) // Allow time for stack deletions
                .memorySize(512) // Increased memory for Java runtime
                .role(this.functionRole)
                .environment(environment)
                .tracing(Tracing.ACTIVE)
                .logGroup(this.logGroup)
                .build();

        // Create EventBridge rule to trigger self-destruct after specified delay
        int delayHours = Integer.parseInt(props.selfDestructDelayHours);
        String ruleName = generateIamCompatibleName(props.compressedResourceNamePrefix, "sd-schedule");
        this.selfDestructSchedule = Rule.Builder.create(this, props.resourceNamePrefix + "-SelfDestructSchedule")
                .ruleName(ruleName)
                .description("Automatically triggers self-destruct after " + delayHours + " hours")
                .schedule(Schedule.rate(Duration.hours(delayHours)))
                .targets(List.of(LambdaFunction.Builder.create(this.selfDestructFunction)
                        .event(RuleTargetInput.fromObject(Map.of(
                                "source",
                                "eventbridge-schedule",
                                "deploymentName",
                                props.deploymentName,
                                "delayHours",
                                delayHours)))
                        .build()))
                .build();

        // Output the function ARN for manual invocation
        new CfnOutput(
                this,
                "SelfDestructFunctionArn",
                CfnOutputProps.builder()
                        .value(this.selfDestructFunction.getFunctionArn())
                        .description("ARN of the self-destruct Lambda function")
                        .build());

        new CfnOutput(
                this,
                "SelfDestructScheduleArn",
                CfnOutputProps.builder()
                        .value(this.selfDestructSchedule.getRuleArn())
                        .description("ARN of the EventBridge rule for scheduled self-destruct")
                        .build());

        new CfnOutput(
                this,
                "SelfDestructScheduleInfo",
                CfnOutputProps.builder()
                        .value("Self-destruct will trigger automatically after " + delayHours + " hours")
                        .description("Automatic self-destruct schedule information")
                        .build());

        new CfnOutput(
                this,
                "SelfDestructInstructions",
                CfnOutputProps.builder()
                        .value("aws lambda invoke --function-name " + functionName + " /tmp/response.json")
                        .description("Command to trigger immediate manual self-destruction")
                        .build());
    }
}
