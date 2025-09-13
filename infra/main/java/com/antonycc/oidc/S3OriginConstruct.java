package com.antonycc.oidc;

import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOACProps;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.constructs.Construct;

/**
 * Construct that creates an S3 bucket with CloudFront behavior options and S3 Origin Access Control (OAC).
 * Encapsulates the common configuration for web and well-known buckets including their CloudFront origins.
 */
public class S3OriginConstruct extends Construct {
    // Exposed created resources/objects
    public final Bucket bucket;
    public final IOrigin origin;
    public final BehaviorOptions behaviorOptions;
    public final CachePolicy cachePolicy;
    //public final OriginAccessIdentity originAccessIdentity;

    public S3OriginConstruct(final Construct scope, final String id, final S3OriginConstructProps props) {
        super(scope, id);

        // Extract resource name prefix from the parent construct ID
        String resourceNamePrefix = extractResourceNamePrefix(id);

        // Create the S3 bucket with common configuration
        var bucketBuilder = Bucket.Builder.create(this, id + "-Bucket")
                .bucketName(resourceNamePrefix + "-" + props.bucketNameSuffix)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .enforceSsl(true)
                .encryption(BucketEncryption.S3_MANAGED) // Explicit SSE-S3 encryption (zero cost)
                .autoDeleteObjects(true)
                .removalPolicy(RemovalPolicy.DESTROY)
                .serverAccessLogsPrefix(props.logsPrefix);
        if (props.logsBucket != null) {
            bucketBuilder.serverAccessLogsBucket(props.logsBucket);
        }
        this.bucket = bucketBuilder.build();

        // Create the S3BucketOrigin using Origin Access Control (OAC)
        this.origin = S3BucketOrigin.withOriginAccessControl(
                this.bucket,
                S3BucketOriginWithOACProps.builder().build());

        // Create cache policy if needed for WELL_KNOWN bucket type
        if (props.bucketType == S3OriginBucketType.WELL_KNOWN) {
            this.cachePolicy = CachePolicy.Builder.create(this, resourceNamePrefix + "-ShortTTL")
                    .cachePolicyName(resourceNamePrefix + "-short-ttl")
                    .defaultTtl(Duration.seconds(60))
                    .minTtl(Duration.seconds(0))
                    .maxTtl(Duration.minutes(5))
                    .enableAcceptEncodingBrotli(true)
                    .enableAcceptEncodingGzip(true)
                    .build();
        } else {
            this.cachePolicy = null;
        }

        // Create BehaviorOptions based on bucket type
        BehaviorOptions.Builder behaviorBuilder = BehaviorOptions.builder()
                .origin(this.origin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(
                        ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS);

        // Add type-specific behavior options
        if (props.bucketType == S3OriginBucketType.WEB) {
            behaviorBuilder.compress(true);
        } else if (props.bucketType == S3OriginBucketType.WELL_KNOWN) {
            behaviorBuilder.cachePolicy(this.cachePolicy);
        }

        this.behaviorOptions = behaviorBuilder.build();
    }

    /**
     * Extract the resource name prefix from the construct ID by removing the suffix.
     * This assumes the pattern used in AppStack where IDs end with bucket type.
     */
    private String extractResourceNamePrefix(String constructId) {
        // Remove common suffixes to get the resource name prefix
        if (constructId.endsWith("-WebBucket")) {
            return constructId.substring(0, constructId.length() - "-WebBucket".length());
        } else if (constructId.endsWith("-WellKnownBucket")) {
            return constructId.substring(0, constructId.length() - "-WellKnownBucket".length());
        }
        // Fallback: assume the entire ID is the prefix (for future extensibility)
        return constructId;
    }
}
