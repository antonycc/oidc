package com.antonycc.oidc;

import static com.antonycc.oidc.ResourceNameUtils.generateIamCompatibleName;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.RuleProps;
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
        Tags.of(this).add("CostCenter", "authentication");
        Tags.of(this).add("Owner", "platform-team");
        Tags.of(this).add("Project", "identity-management");
        Tags.of(this).add("DeploymentName", props.deploymentName);
        Tags.of(this).add("Stack", "SelfDestructStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-oidc");
        Tags.of(this).add("Criticality", "high");
        Tags.of(this).add("DataClassification", "confidential");
        Tags.of(this).add("BackupRequired", "true");
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
                .inlinePolicies(Map.of("SelfDestructPolicy", 
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
        environment.put("OPS_STACK_NAME", props.opsStackName);
        environment.put("SELF_DESTRUCT_STACK_NAME", this.getStackName());

        // Lambda function for self-destruction
        this.selfDestructFunction = Function.Builder.create(this, props.resourceNamePrefix + "-SelfDestructFunction")
                .functionName(functionName)
                .runtime(Runtime.NODEJS_20_X)
                .handler("index.handler")
                .code(Code.fromInline(generateSelfDestructCode()))
                .timeout(Duration.minutes(15)) // Allow time for stack deletions
                .memorySize(256)
                .role(this.functionRole)
                .environment(environment)
                .tracing(Tracing.ACTIVE)
                .logGroup(this.logGroup)
                .build();

        // Create EventBridge rule to trigger self-destruct after specified delay
        int delayHours = Integer.parseInt(props.selfDestructDelayHours);
        this.selfDestructSchedule = Rule.Builder.create(this, props.resourceNamePrefix + "-SelfDestructSchedule")
                .ruleName(props.resourceNamePrefix + "-self-destruct-schedule")
                .description("Automatically triggers self-destruct after " + delayHours + " hours")
                .schedule(Schedule.rate(Duration.hours(delayHours)))
                .targets(List.of(LambdaFunction.Builder.create(this.selfDestructFunction)
                        .event(RuleTargetInput.fromObject(
                                Map.of("source", "eventbridge-schedule",
                                       "deploymentName", props.deploymentName,
                                       "delayHours", delayHours)))
                        .build()))
                .build();

        // Output the function ARN for manual invocation
        new CfnOutput(this, "SelfDestructFunctionArn", CfnOutputProps.builder()
                .value(this.selfDestructFunction.getFunctionArn())
                .description("ARN of the self-destruct Lambda function")
                .build());

        new CfnOutput(this, "SelfDestructScheduleArn", CfnOutputProps.builder()
                .value(this.selfDestructSchedule.getRuleArn())
                .description("ARN of the EventBridge rule for scheduled self-destruct")
                .build());

        new CfnOutput(this, "SelfDestructScheduleInfo", CfnOutputProps.builder()
                .value("Self-destruct will trigger automatically after " + delayHours + " hours")
                .description("Automatic self-destruct schedule information")
                .build());

        new CfnOutput(this, "SelfDestructInstructions", CfnOutputProps.builder()
                .value("aws lambda invoke --function-name " + functionName + " /tmp/response.json")
                .description("Command to trigger immediate manual self-destruction")
                .build());
    }

    private String generateSelfDestructCode() {
        return """
                const { CloudFormationClient, DeleteStackCommand, DescribeStacksCommand } = require('@aws-sdk/client-cloudformation');

                const cloudformation = new CloudFormationClient({});

                exports.handler = async (event) => {
                    console.log('Starting self-destruct sequence...');
                    
                    // Stack deletion order (reverse of creation dependency order)
                    const stacksToDelete = [
                        process.env.OPS_STACK_NAME,
                        process.env.EDGE_STACK_NAME,
                        process.env.WEB_STACK_NAME,
                        process.env.APP_STACK_NAME,
                        process.env.DEV_STACK_NAME,
                        process.env.OBSERVABILITY_STACK_NAME,
                        process.env.SELF_DESTRUCT_STACK_NAME // Delete self last
                    ].filter(name => name); // Filter out any undefined stack names
                    
                    console.log('Stacks to delete in order:', stacksToDelete);
                    
                    const results = [];
                    
                    for (const stackName of stacksToDelete) {
                        try {
                            console.log(`Checking if stack ${stackName} exists...`);
                            
                            // Check if stack exists
                            try {
                                await cloudformation.send(new DescribeStacksCommand({ StackName: stackName }));
                            } catch (err) {
                                if (err.name === 'ValidationError') {
                                    console.log(`Stack ${stackName} does not exist, skipping`);
                                    results.push({ stackName, status: 'not_found' });
                                    continue;
                                }
                                throw err;
                            }
                            
                            console.log(`Deleting stack: ${stackName}`);
                            await cloudformation.send(new DeleteStackCommand({ StackName: stackName }));
                            
                            results.push({ stackName, status: 'deletion_initiated' });
                            console.log(`Deletion initiated for stack: ${stackName}`);
                            
                            // Wait between deletions to avoid conflicts
                            if (stackName !== process.env.SELF_DESTRUCT_STACK_NAME) {
                                await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second delay
                            }
                            
                        } catch (error) {
                            console.error(`Error deleting stack ${stackName}:`, error);
                            results.push({ stackName, status: 'error', error: error.message });
                        }
                    }
                    
                    console.log('Self-destruct sequence completed');
                    
                    return {
                        statusCode: 200,
                        body: JSON.stringify({
                            message: 'Self-destruct sequence completed',
                            results: results,
                            timestamp: new Date().toISOString()
                        })
                    };
                };
                """;
    }
}