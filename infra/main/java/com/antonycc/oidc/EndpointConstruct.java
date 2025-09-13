package com.antonycc.oidc;

import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Fn;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.HttpOrigin;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.RepositoryAttributes;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.EcrImageCodeProps;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.FunctionUrlOptions;
import software.amazon.awscdk.services.lambda.InvokeMode;
import software.amazon.awscdk.services.lambda.Tracing;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class EndpointConstruct extends Construct {
    public final LogGroup logGroup;
    public final Role functionRole;
    public final DockerImageCode dockerImage;
    public final DockerImageFunction function;
    public final FunctionUrl functionUrl;
    public final HttpOrigin httpOrigin;
    public final BehaviorOptions behaviorOptions;
    public final String pathPattern;

    public EndpointConstruct(final Construct scope, final String id, final EndpointConstructProps props) {
        super(scope, id);

        this.pathPattern = props.pathPattern;

        // Log group
        this.logGroup = LogGroup.Builder.create(this, props.functionName + "-LogGroup")
                .logGroupName("/aws/lambda/" + props.functionName)
                .removalPolicy(RemovalPolicy.DESTROY)
                .retention(RetentionDays.ONE_DAY) // Reduced from ONE_WEEK for cost optimization
                .build();

        // IAM role for the Lambda function with deterministic name
        this.functionRole = Role.Builder.create(this, props.functionName + "-ServiceRole")
                .roleName(props.functionName + "-service-role")
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .managedPolicies(List.of(
                        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
                        ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess"),
                        ManagedPolicy.fromAwsManagedPolicyName(
                                "CloudWatchLambdaApplicationSignalsExecutionRolePolicy")))
                .build();

        // Environment: allow only extra/differing vars through props; add tracing name by default
        Map<String, String> environment = new HashMap<>();
        if (props.extraEnv != null) environment.putAll(props.extraEnv);
        environment.put("AWS_XRAY_TRACING_NAME", props.functionName);

        // Add OTEL environment
        var otelEnv = Map.of(
                "AWS_LAMBDA_EXEC_WRAPPER", "/opt/otel-instrument", // enable auto-instrumentation
                "OTEL_SERVICE_NAME", "oidc-provider", // group functions in Application Signals
                "OTEL_TRACES_EXPORTER", "otlp", // explicit traces exporter (reduces startup noise)
                "OTEL_METRICS_EXPORTER", "otlp", // enable metrics export to CloudWatch via Application Signals
                "OTEL_LOGS_EXPORTER", "otlp", // explicit logs exporter (reduces startup noise)
                "OTEL_TRACES_SAMPLER", "parentbased_traceidratio", // optional
                "OTEL_TRACES_SAMPLER_ARG", "1.0", // 100% sampling as requested
                "OTEL_NODE_DISABLED_INSTRUMENTATIONS", "none", // enable all Node libs (cold-start tradeoff)
                "OTEL_LOG_LEVEL", "error", // suppress OTEL internal debug/info logs
                "NODE_NO_WARNINGS", "1" // suppress Node.js warnings (experimental loader, deprecation)
                );
        environment.putAll(otelEnv);
        var imageCodeProps = EcrImageCodeProps.builder()
                .tagOrDigest(props.baseImageTag) // e.g. "latest" or specific digest for immutability
                .cmd(props.handler)
                .build();
        // var ecrRepositoryArnWithoutName = props.ecrRepositoryArn.replaceAll("/.*$", "/");
        var repositoryAttributes = RepositoryAttributes.builder()
                .repositoryArn(props.ecrRepositoryArn)
                .repositoryName(props.ecrRepositoryName)
                .build();
        IRepository repository =
                Repository.fromRepositoryAttributes(this, props.functionName + "-EcrRepo", repositoryAttributes);
        this.dockerImage = DockerImageCode.fromEcr(repository, imageCodeProps);
        this.function = DockerImageFunction.Builder.create(this, props.functionName + "-Lambda")
                .code(this.dockerImage)
                .memorySize(256)
                .environment(environment)
                .functionName(props.functionName)
                .timeout(Duration.seconds(15))
                .tracing(Tracing.ACTIVE)
                .logGroup(this.logGroup)
                .role(this.functionRole)
                .build();

        this.functionUrl = this.function.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(FunctionUrlAuthType.NONE)
                .invokeMode(InvokeMode.BUFFERED)
                .build());

        this.httpOrigin = HttpOrigin.Builder.create(getLambdaUrlHostToken(this.functionUrl))
                .protocolPolicy(software.amazon.awscdk.services.cloudfront.OriginProtocolPolicy.HTTPS_ONLY)
                .build();

        // CloudFront behavior: mostly constant with only allowedMethods varying
        this.behaviorOptions = BehaviorOptions.builder()
                .origin(this.httpOrigin)
                .allowedMethods(
                        props.allowedMethods == null ? AllowedMethods.ALLOW_GET_HEAD_OPTIONS : props.allowedMethods)
                .cachePolicy(CachePolicy.CACHING_DISABLED)
                .responseHeadersPolicy(ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS)
                .originRequestPolicy(OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .build();
    }

    private static String getLambdaUrlHostToken(FunctionUrl functionUrl) {
        return Fn.select(2, Fn.split("/", functionUrl.getUrl()));
    }
}
