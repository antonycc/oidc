package com.antonycc.oidc;

import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.constructs.Construct;

/**
 * Construct that creates an S3 bucket with OriginAccessIdentity for CloudFront distribution.
 * Encapsulates the common configuration for web and well-known buckets.
 */
public class S3OriginBucket extends Construct {
  // Exposed created resources/objects
  public final Bucket bucket;
  public final OriginAccessIdentity originAccessIdentity;

  public S3OriginBucket(final Construct scope, final String id, final S3OriginBucketProps props) {
    super(scope, id);

    // Extract resource name prefix from the parent construct ID
    String resourceNamePrefix = extractResourceNamePrefix(id);

    // Create the S3 bucket with common configuration
    this.bucket = Bucket.Builder.create(this, id + "-Bucket")
        .bucketName(resourceNamePrefix + "-" + props.bucketNameSuffix)
        .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
        .enforceSsl(true)
        .autoDeleteObjects(true)
        .removalPolicy(RemovalPolicy.DESTROY)
        .serverAccessLogsBucket(props.logsBucket)
        .serverAccessLogsPrefix(props.logsPrefix)
        .build();

    // Create the OriginAccessIdentity for CloudFront access
    this.originAccessIdentity = OriginAccessIdentity.Builder.create(this, id + "-OriginAccessIdentity")
        .comment(props.oaiComment)
        .build();

    // Grant read access to the OAI
    this.bucket.grantRead(this.originAccessIdentity);
  }

  /**
   * Extract the resource name prefix from the construct ID by removing the suffix.
   * This assumes the pattern used in OidcProviderStack where IDs end with bucket type.
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