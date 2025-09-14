package com.antonycc.oidc;

import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.LifecycleRule;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.TagStatus;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyDocument;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

import java.util.List;

import static com.antonycc.oidc.ResourceNameUtils.generateIamCompatibleName;

public class DevStack extends Stack {

    // Public properties for stack outputs
    public final IRepository ecrRepository;
    public final LogGroup ecrLogGroup;
    public final Role ecrPublishRole;

    public DevStack(Construct scope, String id, DevStackProps props) {
        super(scope, id, props);

        // ECR Repository with lifecycle rules
        String ecrRepositoryName = "%s-ecr".formatted(props.dashedDomainName);
        this.ecrRepository = Repository.Builder.create(this, props.resourceNamePrefix + "-EcrRepository")
                .repositoryName(ecrRepositoryName)
                .imageScanOnPush(true) // Enable vulnerability scanning
                .imageTagMutability(software.amazon.awscdk.services.ecr.TagMutability.MUTABLE)
                .lifecycleRules(List.of(
                        // Remove untagged images after 1 day
                        LifecycleRule.builder()
                                .description("Remove untagged images after 1 day")
                                .tagStatus(TagStatus.UNTAGGED)
                                .maxImageAge(Duration.days(1))
                                .build()))
                .emptyOnDelete(true)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // CloudWatch Log Group for ECR operations with 7-day retention
        String ecrLogGroupName = "/aws/ecr/%s".formatted(props.dashedDomainName);
        this.ecrLogGroup = LogGroup.Builder.create(this, props.resourceNamePrefix + "-EcrLogGroup")
                .logGroupName(ecrLogGroupName)
                .retention(RetentionDays.ONE_WEEK) // 7-day retention as requested
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // IAM Role for ECR publishing with comprehensive permissions
        String ecrPublishRoleName = generateIamCompatibleName(props.dashedDomainName, "ecr-publish-role");
        this.ecrPublishRole = Role.Builder.create(this, props.resourceNamePrefix + "-EcrPublishRole")
                .roleName(ecrPublishRoleName)
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .inlinePolicies(java.util.Map.of(
                    props.resourceNamePrefix + "-EcrPublishPolicy",
                        PolicyDocument.Builder.create()
                                .statements(List.of(
                                        // ECR repository permissions
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of(
                                                        "ecr:GetAuthorizationToken",
                                                        "ecr:BatchCheckLayerAvailability",
                                                        "ecr:GetDownloadUrlForLayer",
                                                        "ecr:BatchGetImage",
                                                        "ecr:InitiateLayerUpload",
                                                        "ecr:UploadLayerPart",
                                                        "ecr:CompleteLayerUpload",
                                                        "ecr:PutImage",
                                                        "ecr:ListImages",
                                                        "ecr:DescribeImages",
                                                        "ecr:DescribeRepositories"))
                                                .resources(List.of(this.ecrRepository.getRepositoryArn()))
                                                .build(),
                                        // CloudWatch Logs permissions for verbose logging
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of(
                                                        "logs:CreateLogStream",
                                                        "logs:PutLogEvents",
                                                        "logs:DescribeLogGroups",
                                                        "logs:DescribeLogStreams"))
                                                .resources(List.of(this.ecrLogGroup.getLogGroupArn() + "*"))
                                                .build(),
                                        // Additional ECR permissions for scanning and lifecycle
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of(
                                                        "ecr:DescribeImageScanFindings",
                                                        "ecr:StartImageScan",
                                                        "ecr:GetLifecyclePolicy",
                                                        "ecr:GetLifecyclePolicyPreview"))
                                                .resources(List.of(this.ecrRepository.getRepositoryArn()))
                                                .build()))
                                .build()))
                .build();

        // Output key information
        CfnOutput.Builder.create(this, "EcrRepositoryArn")
                .value(this.ecrRepository.getRepositoryArn())
                .description("ARN of the ECR repository")
                .build();
        CfnOutput.Builder.create(this,  "EcrRepositoryName")
                .value(this.ecrRepository.getRepositoryName())
                .description("Name of the ECR repository")
                .build();
        CfnOutput.Builder.create(this, "EcrRepositoryUri")
                .value(this.ecrRepository.getRepositoryUri())
                .description("URI of the ECR repository")
                .build();

        CfnOutput.Builder.create(this,  "EcrLogGroupArn")
                .value(this.ecrLogGroup.getLogGroupArn())
                .description("ARN of the ECR CloudWatch Log Group")
                .build();

        CfnOutput.Builder.create(this, "EcrPublishRoleArn")
                .value(this.ecrPublishRole.getRoleArn())
                .description("ARN of the ECR publish role")
                .build();
    }
}
