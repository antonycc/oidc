# OpenTelemetry Logging Configuration

This document explains the configuration applied to reduce OpenTelemetry startup noise in CloudWatch logs.

## Problem

When deploying Lambda functions with the AWS OpenTelemetry Lambda layer, CloudWatch logs showed duplicated warning messages including:

1. `ExperimentalWarning: '--experimental-loader' may be removed in the future`
2. `Provided instrumentation name "@opentelemetry/instrumentation-none" not found`
3. `Setting TraceProvider for instrumentations at the end of initialization`
4. `[DEP0040] DeprecationWarning: The 'punycode' module is deprecated`

These messages create noise that makes it difficult to focus on application-specific log entries.

## Solution

The configuration has been updated to suppress these startup warnings while preserving the functionality of OpenTelemetry tracing, metrics, and logging:

### Environment Variables Added

1. **`OTEL_LOG_LEVEL: "error"`** - Suppresses OpenTelemetry SDK internal debug and info messages
2. **`NODE_NO_WARNINGS: "1"`** - Suppresses Node.js process warnings including experimental loader and deprecation warnings

### Configuration Location

These environment variables are set in `infra/main/java/com/antonycc/oidc/OidcEndpointFunction.java` within the `otelEnv` map that configures all OpenTelemetry-related settings for Lambda functions.

## Functionality Preserved

- OpenTelemetry tracing remains active with 100% sampling
- Metrics export to CloudWatch via Application Signals continues to work
- Logs are still exported via OTLP
- AWS X-Ray integration remains functional
- All instrumentations continue to work

## Alternative Approaches Considered

1. **Upgrading OTEL layer**: Currently using v0.7.0 which is the latest available
2. **Specific warning suppression**: Could use `--disable-warning=ExperimentalWarning --disable-warning=DeprecationWarning` but `NODE_NO_WARNINGS` is more comprehensive
3. **Disable instrumentations**: Could set `OTEL_NODE_DISABLED_INSTRUMENTATIONS` to specific modules, but this would reduce tracing coverage

## Impact

- Reduces CloudWatch log noise significantly
- Preserves all OpenTelemetry functionality
- Maintains debugging capability for application-specific issues
- Does not affect performance or cold start times