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
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.lambda.AssetImageCodeProps;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.FunctionUrlOptions;
import software.amazon.awscdk.services.lambda.InvokeMode;
import software.amazon.awscdk.services.lambda.Tracing;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Construct bundling a Lambda Docker image function exposed via Function URL and a
 * CloudFront HttpOrigin + BehaviorOptions. Only per-endpoint differences are configurable.
 */
public class OidcEndpointFunction extends Construct {
  // Exposed created resources/objects
  public final LogGroup logGroup;
  public final DockerImageFunction function;
  public final FunctionUrl functionUrl;
  public final HttpOrigin httpOrigin;
  public final BehaviorOptions behaviorOptions;
  public final String pathPattern;

  public OidcEndpointFunction(final Construct scope, final String id, final OidcEndpointFunctionProps props) {
    super(scope, id);

    this.pathPattern = props.pathPattern;

    // Log group
    this.logGroup = LogGroup.Builder.create(this, props.functionName + "LogGroup")
        .logGroupName("/aws/lambda/" + props.functionName)
        .removalPolicy(RemovalPolicy.DESTROY)
        .retention(RetentionDays.ONE_WEEK)
        .build();

    // Build args are constant currently but can be extended later
    Map<String, String> buildArgs = Map.of("BUILDKIT_INLINE_CACHE", "1");

    AssetImageCodeProps imageCodeProps = AssetImageCodeProps.builder()
        .file(props.dockerfilePath)
        .cmd(props.cmd)
        .buildArgs(buildArgs)
        .build();

    // Environment: allow only extra/differing vars through props; add tracing name by default
    Map<String, String> environment = new HashMap<>();
    if (props.extraEnv != null) environment.putAll(props.extraEnv);
    environment.put("AWS_XRAY_TRACING_NAME", props.functionName);

    // Add OTEL environment
    var otelEnv = Map.of(
          "AWS_LAMBDA_EXEC_WRAPPER", "/opt/otel-instrument", // enable auto-instrumentation
          "OTEL_SERVICE_NAME", "oidc-provider",              // group functions in App Signals
          "OTEL_TRACES_SAMPLER", "parentbased_traceidratio", // optional
          "OTEL_TRACES_SAMPLER_ARG", "0.3",                  // optional sampling
          "OTEL_NODE_DISABLED_INSTRUMENTATIONS", "none"      // enable all Node libs (cold-start tradeoff)
    );
    environment.putAll(otelEnv);

    this.function = DockerImageFunction.Builder.create(this, props.functionName + "Lambda")
        .code(DockerImageCode.fromImageAsset(".", imageCodeProps))
        .memorySize(256)
        .environment(environment)
        .functionName(props.functionName)
        .timeout(Duration.seconds(15))
        .tracing(Tracing.ACTIVE)
        .logGroup(this.logGroup)
        .build();

      var managedPolicy = ManagedPolicy.fromAwsManagedPolicyName("CloudWatchLambdaApplicationSignalsExecutionRolePolicy");
      var functionRole = Objects.requireNonNull(this.function.getRole());
      functionRole.addManagedPolicy(managedPolicy);

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
        .allowedMethods(props.allowedMethods == null ? AllowedMethods.ALLOW_GET_HEAD_OPTIONS : props.allowedMethods)
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
