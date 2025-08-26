package com.antonycc.oidc;

import software.amazon.awscdk.services.s3.Bucket;

/**
 * Types of S3 origin buckets with different CloudFront behavior configurations.
 */
enum S3OriginBucketType {
  WEB,        // Web content bucket with compression enabled
  WELL_KNOWN  // Well-known content bucket with short TTL cache policy
}

/**
 * Props for S3OriginBucket construct.
 * Only include properties that differ between the individual S3 origin buckets.
 */
public class S3OriginBucketProps {
  public final String bucketNameSuffix;     // e.g., "web", "well-known"
  public final String logsPrefix;           // e.g., "s3/web/", "s3/well-known/"
  public final String oaiComment;           // e.g., "Identity created for access to the website origin bucket..."
  public final Bucket logsBucket;           // The logs bucket for server access logging
  public final S3OriginBucketType bucketType;  // Type determining behavior options configuration

  private S3OriginBucketProps(Builder b) {
    this.bucketNameSuffix = b.bucketNameSuffix;
    this.logsPrefix = b.logsPrefix;
    this.oaiComment = b.oaiComment;
    this.logsBucket = b.logsBucket;
    this.bucketType = b.bucketType;
  }

  public static Builder builder() { return new Builder(); }

  public static class Builder {
    private String bucketNameSuffix;
    private String logsPrefix;
    private String oaiComment;
    private Bucket logsBucket;
    private S3OriginBucketType bucketType;

    public Builder bucketNameSuffix(String v) { this.bucketNameSuffix = v; return this; }
    public Builder logsPrefix(String v) { this.logsPrefix = v; return this; }
    public Builder oaiComment(String v) { this.oaiComment = v; return this; }
    public Builder logsBucket(Bucket v) { this.logsBucket = v; return this; }
    public Builder bucketType(S3OriginBucketType v) { this.bucketType = v; return this; }

    public S3OriginBucketProps build() {
      java.util.List<String> missingFields = new java.util.ArrayList<>();
      if (bucketNameSuffix == null) missingFields.add("bucketNameSuffix");
      if (logsPrefix == null) missingFields.add("logsPrefix");
      if (oaiComment == null) missingFields.add("oaiComment");
      if (logsBucket == null) missingFields.add("logsBucket");
      if (bucketType == null) missingFields.add("bucketType");
      if (!missingFields.isEmpty()) {
        throw new IllegalArgumentException("Required fields missing: " + String.join(", ", missingFields));
      }
      return new S3OriginBucketProps(this);
    }
  }
}