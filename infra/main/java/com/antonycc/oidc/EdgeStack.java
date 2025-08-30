package com.antonycc.oidc;

import software.amazon.awscdk.AssetHashType;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CfnOutputProps;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Expiration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.OriginAccessIdentity;
import software.amazon.awscdk.services.cloudfront.SSLMethod;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.route53.ARecord;
import software.amazon.awscdk.services.route53.ARecordProps;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.route53.RecordTarget;
import software.amazon.awscdk.services.route53.targets.CloudFrontTarget;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.constructs.Construct;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class EdgeStack extends Stack {
  // Certificate resources  
  public final ICertificate certificate;
  public final ICertificate authCertificate;
  // DNS resources
  public final IHostedZone hostedZone;
  // CloudFront distribution - will be created by OidcProviderStack
  public final Distribution distribution;
  public final ARecord aliasRecord;
  // S3 origin resources
  public final S3OriginBucket webOriginBucket;
  public final S3OriginBucket wellKnownOriginBucket;
  public final Bucket webBucket;
  public final OriginAccessIdentity webOriginAccessIdentity;
  public final Bucket wellKnownBucket;
  public final OriginAccessIdentity wellKnownOriginAccessIdentity;
  public final CachePolicy shortTtl;
  public final BehaviorOptions webOriginBehaviorOptions;
  public final BehaviorOptions wellKnownOriginBehaviorOptions;

  // Store for later use in distribution creation
  private final String domainName;
  private final String hostedZoneName;
  private final Bucket logsBucket;

  public EdgeStack(final Construct scope, final String id, final EdgeStackProps props) {
    super(scope, id, props);

    // Store values for later use
    this.domainName = props.domainName;
    this.hostedZoneName = props.hostedZoneName;
    this.logsBucket = props.logsBucket;

    // Generate predictable resource name prefix based on domain and environment
    String resourceNamePrefix = generateResourceNamePrefix(props.domainName, props.envName);
    String compressedResourceNamePrefix = generateCompressedResourceNamePrefix(props.domainName, props.envName);

    // Create certificates from ARNs - these are stable, environment-scoped resources
    this.certificate = Certificate.fromCertificateArn(this, resourceNamePrefix + "-Certificate", props.certificateArn);
    // Auth certificate for Cognito custom domain (if provided)
    this.authCertificate = props.authCertificateArn != null 
        ? Certificate.fromCertificateArn(this, resourceNamePrefix + "-AuthCertificate", props.authCertificateArn)
        : null;

    // Create DNS hosted zone reference - stable, environment-scoped resource
    this.hostedZone = HostedZone.fromHostedZoneAttributes(
        this,
        resourceNamePrefix + "-HostedZone",
        HostedZoneAttributes.builder()
            .hostedZoneId(props.hostedZoneId)
            .zoneName(props.hostedZoneName)
            .build());

    // Web origin bucket
    this.webOriginBucket = new S3OriginBucket(
        this,
        resourceNamePrefix + "-WebBucket",
        S3OriginBucketProps.builder()
            .bucketNameSuffix("web")
            .logsPrefix("s3/web/")
            .oaiComment("Identity created for access to the website origin bucket via the CloudFront"
                + " distribution")
            .logsBucket(props.logsBucket)
            .bucketType(S3OriginBucketType.WEB)
            .build());
    this.webBucket = this.webOriginBucket.bucket;
    this.webOriginAccessIdentity = this.webOriginBucket.originAccessIdentity;
    this.webOriginBehaviorOptions = this.webOriginBucket.behaviorOptions;

    // Well-known origin bucket
    this.wellKnownOriginBucket = new S3OriginBucket(
        this,
        resourceNamePrefix + "-WellKnownBucket",
        S3OriginBucketProps.builder()
            .bucketNameSuffix("well-known")
            .logsPrefix("s3/well-known/")
            .oaiComment("Identity created for access to the Well Known origin bucket via the CloudFront"
                + " distribution")
            .logsBucket(props.logsBucket)
            .bucketType(S3OriginBucketType.WELL_KNOWN)
            .build());
    this.wellKnownBucket = this.wellKnownOriginBucket.bucket;
    this.wellKnownOriginAccessIdentity = this.wellKnownOriginBucket.originAccessIdentity;
    this.shortTtl = this.wellKnownOriginBucket.cachePolicy;
    this.wellKnownOriginBehaviorOptions = this.wellKnownOriginBucket.behaviorOptions;

    // Distribution will be created by OidcProviderStack using EdgeStack resources
    // This avoids the circular dependency while still centralizing edge resources
    this.distribution = null;
    this.aliasRecord = null;

    // Outputs for cross-stack references
    new CfnOutput(
        this,
        "WebBucketName",
        CfnOutputProps.builder().value(this.webBucket.getBucketName()).build());
    new CfnOutput(
        this,
        "WellKnownBucketName",
        CfnOutputProps.builder().value(this.wellKnownBucket.getBucketName()).build());
    new CfnOutput(
        this,
        "CertificateArn", 
        CfnOutputProps.builder().value(this.certificate.getCertificateArn()).build());
    new CfnOutput(
        this,
        "HostedZoneId",
        CfnOutputProps.builder().value(this.hostedZone.getHostedZoneId()).build());
    new CfnOutput(
        this,
        "HostedZoneName",
        CfnOutputProps.builder().value(this.hostedZone.getZoneName()).build());
  }



  /**
   * Generate a predictable resource name prefix based on domain name and environment.
   * Converts domain like "oidc.example.com" to "oidc-example-com" and adds environment.
   */
  private static String generateResourceNamePrefix(String domainName, String envName) {
    String dashedDomainName = domainName.replace('.', '-');
    return dashedDomainName + "-" + envName;
  }

  /**
   * Generate a shortened predictable resource name prefix based on domain and environment.
   * Steps:
   * 1. Replace dots with dashes.
   * 2. Split on dashes.
   * 3. Keep segment "oidc" intact; compress all other non-empty segments to their first letter.
   * 4. Append '-' + environment name (environment kept whole).
   *
   * Examples:
   *   domain=oidc.example.com, env=dev  -> oidc-e-c-dev
   *   domain=login.auth.service.example.com, env=prod -> l-a-s-e-c-prod
   *
   * @param domainName fully qualified domain name (e.g. "oidc.example.com")
   * @param envName environment name (e.g. "dev")
   * @return compressed resource name prefix
   */
  private static String generateCompressedResourceNamePrefix(String domainName, String envName) {
    if (domainName == null || domainName.isBlank()) {
      throw new IllegalArgumentException("domainName must be non-empty");
    }
    if (envName == null || envName.isBlank()) {
      throw new IllegalArgumentException("envName must be non-empty");
    }

    String dashed = domainName.replace('.', '-').toLowerCase();
    String[] parts = dashed.split("-+");
    StringBuilder sb = new StringBuilder();
    for (String part : parts) {
      if (part.isEmpty()) {
        continue;
      }
      if (sb.length() > 0) {
        sb.append('-');
      }
      if ("oidc".equals(part)) {
        sb.append("oidc");
      } else {
        sb.append(part.charAt(0));
      }
    }
    sb.append('-').append(envName);
    return sb.toString();
  }

  /**
   * Compute the record name for Route53 A record based on domain and hosted zone names.
   * If domain matches hosted zone, returns null for root record.
   * If domain is a subdomain of hosted zone, returns the subdomain part.
   * Otherwise returns the full domain name.
   */
  private static String computeRecordName(String domainName, String hostedZoneName) {
    if (hostedZoneName.equals(domainName)) {
      return null; // Root record
    } else if (domainName.endsWith("." + hostedZoneName)) {
      // Extract subdomain part
      return domainName.substring(0, domainName.length() - (hostedZoneName.length() + 1));
    } else {
      return domainName; // Full domain name
    }
  }
}