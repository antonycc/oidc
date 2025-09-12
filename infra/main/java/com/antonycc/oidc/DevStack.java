package com.antonycc.oidc;

import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
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

import java.util.AbstractMap;
import java.util.List;
import java.util.regex.Pattern;

/**
 * DevStack for Docker container development and deployment infrastructure.
 * Creates ECR repositories with comprehensive logging and publishing facilities.
 */
public class DevStack extends Stack {

    // Public properties for stack outputs
    public final IRepository ecrRepository;
    public final LogGroup ecrLogGroup;
    public final Role ecrPublishRole;

    public DevStack(Construct scope, String id, DevStack.Builder builder) {
        this(scope, id, null, builder);
    }

    public DevStack(Construct scope, String id, StackProps props, DevStack.Builder builder) {
        super(scope, id, props);

        // Values are provided via WebApp after context/env resolution

        // Build naming using same patterns as WebStack
        //String domainName = Builder.buildDomainName(builder.env, builder.domainName, builder.hostedZoneName);
        String dashedDomainName =
                Builder.buildDashedDomainName(builder.env, builder.domainName, builder.hostedZoneName);

        // ECR Repository with lifecycle rules
        String ecrRepositoryName = Builder.buildEcrRepositoryName(dashedDomainName);
        this.ecrRepository = Repository.Builder.create(this, "EcrRepository")
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
                .removalPolicy(builder.retainEcrRepository ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY)
                .build();

        // CloudWatch Log Group for ECR operations with 7-day retention
        String ecrLogGroupName = Builder.buildEcrLogGroupName(dashedDomainName);
        this.ecrLogGroup = LogGroup.Builder.create(this, "EcrLogGroup")
                .logGroupName(ecrLogGroupName)
                .retention(RetentionDays.ONE_WEEK) // 7-day retention as requested
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // IAM Role for ECR publishing with comprehensive permissions
        this.ecrPublishRole = Role.Builder.create(this, "EcrPublishRole")
                .roleName(Builder.buildEcrPublishRoleName(dashedDomainName))
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .inlinePolicies(java.util.Map.of(
                        "EcrPublishPolicy",
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

        CfnOutput.Builder.create(this, "EcrRepositoryUri")
                .value(this.ecrRepository.getRepositoryUri())
                .description("URI of the ECR repository")
                .build();

        CfnOutput.Builder.create(this, "EcrLogGroupArn")
                .value(this.ecrLogGroup.getLogGroupArn())
                .description("ARN of the ECR CloudWatch Log Group")
                .build();

        CfnOutput.Builder.create(this, "EcrPublishRoleArn")
                .value(this.ecrPublishRole.getRoleArn())
                .description("ARN of the ECR publish role")
                .build();
    }

    /**
     * Builder class following the same pattern as WebStack.Builder
     */
    public static class Builder {
        private Construct scope;
        private String id;
        private StackProps props;

        // Environment configuration
        public String env;
        public String domainName;
        public String hostedZoneName;
        public boolean retainEcrRepository = false;

        private Builder() {}

        public static Builder create(Construct scope, String id) {
            Builder builder = new Builder();
            builder.scope = scope;
            builder.id = id;
            return builder;
        }

        public Builder props(StackProps props) {
            this.props = props;
            return this;
        }

        public Builder env(String env) {
            this.env = env;
            return this;
        }

        public Builder domainName(String domainName) {
            this.domainName = domainName;
            return this;
        }

        public Builder hostedZoneName(String hostedZoneName) {
            this.hostedZoneName = hostedZoneName;
            return this;
        }

        public Builder retainEcrRepository(String retainEcrRepository) {
            this.retainEcrRepository = Boolean.parseBoolean(retainEcrRepository);
            return this;
        }

        public Builder props(DevStackProps p) {
            if (p == null) return this;
            this.env = p.env;
            this.domainName = p.domainName;
            this.hostedZoneName = p.hostedZoneName;
            this.retainEcrRepository = Boolean.parseBoolean(p.retainEcrRepository);
            return this;
        }

        public DevStack build() {
            return new DevStack(this.scope, this.id, this.props, this);
        }

        // Naming utility methods following WebStack patterns
        public static String buildDomainName(String env, String subDomainName, String hostedZoneName) {
            return env.equals("prod")
                    ? Builder.buildProdDomainName(subDomainName, hostedZoneName)
                    : Builder.buildNonProdDomainName(env, subDomainName, hostedZoneName);
        }

        public static String buildProdDomainName(String subDomainName, String hostedZoneName) {
            return "%s.%s".formatted(subDomainName, hostedZoneName);
        }

        public static String buildNonProdDomainName(String env, String subDomainName, String hostedZoneName) {
            return "%s.%s.%s".formatted(env, subDomainName, hostedZoneName);
        }

        public static String buildDashedDomainName(String env, String subDomainName, String hostedZoneName) {
            return ResourceNameUtils.convertDotSeparatedToDashSeparated(
                    "%s.%s.%s".formatted(env, subDomainName, hostedZoneName), domainNameMappings);
        }

        public static String buildEcrRepositoryName(String dashedDomainName) {
            return "%s-ecr".formatted(dashedDomainName);
        }

        public static String buildEcrLogGroupName(String dashedDomainName) {
            return "/aws/ecr/%s".formatted(dashedDomainName);
        }

        public static String buildEcrPublishRoleName(String dashedDomainName) {
            return "%s-ecr-publish-role".formatted(dashedDomainName);
        }
    }

    // Use same domain name mappings as WebStack
    public static final List<AbstractMap.SimpleEntry<Pattern, String>> domainNameMappings = List.of();
}
