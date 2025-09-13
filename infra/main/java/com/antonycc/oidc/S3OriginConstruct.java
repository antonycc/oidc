package com.antonycc.oidc;

import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.constructs.Construct;

/**
 * Construct that creates an S3 bucket with CloudFront behavior options.
 * Encapsulates the common configuration for web and well-known buckets including their CloudFront origins.
 * <p>
 * Note: This construct does not create or configure S3 Origin Access Control (OAC) itself.
 * It is compatible with OAC if configured externally.
 */
public class S3OriginConstruct extends Construct {
    // Exposed created resources/objects
    public final Bucket bucket;

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
