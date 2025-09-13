```java
    /**
     * Create comprehensive operational dashboard for system health monitoring.
     * Provides visibility into Lambda performance, errors, and key system metrics.
     */
    private void createOperationalDashboard(String resourceNamePrefix, String compressedResourceNamePrefix) {
        Dashboard.Builder.create(this, resourceNamePrefix + "-Dashboard")
                .dashboardName(compressedResourceNamePrefix + "-operations")
                .widgets(List.of(
                        // Top row: High-level system health metrics
                        List.of(
                                SingleValueWidget.Builder.create()
                                        .title("Total Lambda Invocations (5m)")
                                        .metrics(List.of(
                                                this.authorizeEndpoint.function.metricInvocations(),
                                                this.tokenEndpoint.function.metricInvocations(),
                                                this.userinfoEndpoint.function.metricInvocations(),
                                                this.jwksEndpoint.function.metricInvocations()
                                        ))
                                        .width(6)
                                        .height(3)
                                        .build(),
                                SingleValueWidget.Builder.create()
                                        .title("Error Count")
                                        .metrics(List.of(
                                                this.authorizeEndpoint.function.metricErrors(),
                                                this.tokenEndpoint.function.metricErrors(),
                                                this.userinfoEndpoint.function.metricErrors(),
                                                this.jwksEndpoint.function.metricErrors()
                                        ))
                                        .width(6)
                                        .height(3)
                                        .build(),
                                SingleValueWidget.Builder.create()
                                        .title("Average Duration (ms)")
                                        .metrics(List.of(
                                                this.authorizeEndpoint.function.metricDuration(),
                                                this.tokenEndpoint.function.metricDuration(),
                                                this.userinfoEndpoint.function.metricDuration(),
                                                this.jwksEndpoint.function.metricDuration()
                                        ))
                                        .width(6)
                                        .height(3)
                                        .build(),
                                SingleValueWidget.Builder.create()
                                        .title("CloudFront Requests")
                                        .metrics(List.of(
                                                this.distribution.metricRequests()
                                        ))
                                        .width(6)
                                        .height(3)
                                        .build()
                        ),
                        // Second row: Lambda performance trends over time
                        List.of(
                                GraphWidget.Builder.create()
                                        .title("Lambda Invocations by Endpoint")
                                        .left(List.of(
                                                this.authorizeEndpoint.function.metricInvocations().with(MetricOptions.builder().label("Authorize").build()),
                                                this.tokenEndpoint.function.metricInvocations().with(MetricOptions.builder().label("Token").build()),
                                                this.userinfoEndpoint.function.metricInvocations().with(MetricOptions.builder().label("UserInfo").build()),
                                                this.jwksEndpoint.function.metricInvocations().with(MetricOptions.builder().label("JWKS").build())
                                        ))
                                        .width(12)
                                        .height(6)
                                        .build(),
                                GraphWidget.Builder.create()
                                        .title("Lambda Duration by Endpoint")
                                        .left(List.of(
                                                this.authorizeEndpoint.function.metricDuration().with(MetricOptions.builder().label("Authorize").build()),
                                                this.tokenEndpoint.function.metricDuration().with(MetricOptions.builder().label("Token").build()),
                                                this.userinfoEndpoint.function.metricDuration().with(MetricOptions.builder().label("UserInfo").build()),
                                                this.jwksEndpoint.function.metricDuration().with(MetricOptions.builder().label("JWKS").build())
                                        ))
                                        .width(12)
                                        .height(6)
                                        .build()
                        ),
                        // Third row: Error monitoring and system reliability
                        List.of(
                                GraphWidget.Builder.create()
                                        .title("Lambda Error Rate")
                                        .left(List.of(
                                                this.authorizeEndpoint.function.metricErrors().with(MetricOptions.builder().label("Authorize Errors").build()),
                                                this.tokenEndpoint.function.metricErrors().with(MetricOptions.builder().label("Token Errors").build()),
                                                this.userinfoEndpoint.function.metricErrors().with(MetricOptions.builder().label("UserInfo Errors").build()),
                                                this.jwksEndpoint.function.metricErrors().with(MetricOptions.builder().label("JWKS Errors").build())
                                        ))
                                        .width(12)
                                        .height(6)
                                        .build(),
                                GraphWidget.Builder.create()
                                        .title("Lambda Throttles and Concurrency")
                                        .left(List.of(
                                                this.authorizeEndpoint.function.metricThrottles().with(MetricOptions.builder().label("Authorize Throttles").build()),
                                                this.tokenEndpoint.function.metricThrottles().with(MetricOptions.builder().label("Token Throttles").build()),
                                                this.userinfoEndpoint.function.metricThrottles().with(MetricOptions.builder().label("UserInfo Throttles").build()),
                                                this.jwksEndpoint.function.metricThrottles().with(MetricOptions.builder().label("JWKS Throttles").build())
                                        ))
                                        .width(12)
                                        .height(6)
                                        .build()
                        )
                        // Note: DynamoDB and log insights can be viewed separately in CloudWatch console
                        // Lambda function log groups are automatically created for detailed debugging
                ))
                .build();
    }

}
```
