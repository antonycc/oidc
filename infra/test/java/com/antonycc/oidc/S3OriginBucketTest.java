package com.antonycc.oidc;

import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.assertions.Template;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class S3OriginBucketTest {

  @Test
  void s3OriginBucketCreatesExpectedResources() {
    App app = new App();
    Environment env = Environment.builder().account("123456789012").region("us-east-1").build();
    
    // Create a test stack with necessary components
    Stack testStack = new Stack(app, "TestStack", StackProps.builder().env(env).build());
    
    // Create a logs bucket (dependency)
    Bucket logsBucket = Bucket.Builder.create(testStack, "LogsBucket")
        .bucketName("test-logs")
        .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
        .enforceSsl(true)
        .autoDeleteObjects(true)
        .removalPolicy(RemovalPolicy.DESTROY)
        .build();

    // Create our S3OriginBucket construct
    S3OriginBucket s3OriginBucket = new S3OriginBucket(
        testStack,
        "test-prefix-WebBucket",
        S3OriginBucketProps.builder()
            .bucketNameSuffix("web")
            .logsPrefix("s3/web/")
            .oaiComment("Test OAI comment for web bucket")
            .logsBucket(logsBucket)
            .build());

    // Verify the construct exposes the expected resources
    assertNotNull(s3OriginBucket.bucket, "Bucket should be created and exposed");
    assertNotNull(s3OriginBucket.originAccessIdentity, "OAI should be created and exposed");

    // Generate CloudFormation template for verification
    Template template = Template.fromStack(testStack);

    // Verify S3 bucket properties
    template.hasResourceProperties("AWS::S3::Bucket", Map.of(
        "BucketName", "test-prefix-web",
        "PublicAccessBlockConfiguration", Map.of(
            "BlockPublicAcls", true,
            "BlockPublicPolicy", true,
            "IgnorePublicAcls", true,
            "RestrictPublicBuckets", true
        ),
        "LoggingConfiguration", Map.of(
            "LogFilePrefix", "s3/web/"
        )
    ));

    // Verify OriginAccessIdentity properties
    template.hasResourceProperties("AWS::CloudFront::CloudFrontOriginAccessIdentity", Map.of(
        "CloudFrontOriginAccessIdentityConfig", Map.of(
            "Comment", "Test OAI comment for web bucket"
        )
    ));

    // Verify bucket policy for OAI read access is created
    template.hasResourceProperties("AWS::S3::BucketPolicy", Map.of());
    
    // Verify we have exactly one bucket and one OAI
    template.resourceCountIs("AWS::S3::Bucket", 2); // LogsBucket + our bucket
    template.resourceCountIs("AWS::CloudFront::CloudFrontOriginAccessIdentity", 1);
  }

  @Test
  void s3OriginBucketWorksWithDifferentSuffixes() {
    App app = new App();
    Environment env = Environment.builder().account("123456789012").region("us-east-1").build();
    
    Stack testStack = new Stack(app, "TestStack", StackProps.builder().env(env).build());
    
    Bucket logsBucket = Bucket.Builder.create(testStack, "LogsBucket")
        .bucketName("test-logs")
        .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
        .enforceSsl(true)
        .autoDeleteObjects(true)
        .removalPolicy(RemovalPolicy.DESTROY)
        .build();

    // Create well-known bucket variant
    S3OriginBucket wellKnownBucket = new S3OriginBucket(
        testStack,
        "test-prefix-WellKnownBucket",
        S3OriginBucketProps.builder()
            .bucketNameSuffix("well-known")
            .logsPrefix("s3/well-known/")
            .oaiComment("Test OAI comment for well-known bucket")
            .logsBucket(logsBucket)
            .build());

    assertNotNull(wellKnownBucket.bucket);
    assertNotNull(wellKnownBucket.originAccessIdentity);

    Template template = Template.fromStack(testStack);

    // Verify the well-known bucket has correct properties
    template.hasResourceProperties("AWS::S3::Bucket", Map.of(
        "BucketName", "test-prefix-well-known",
        "LoggingConfiguration", Map.of(
            "LogFilePrefix", "s3/well-known/"
        )
    ));

    template.hasResourceProperties("AWS::CloudFront::CloudFrontOriginAccessIdentity", Map.of(
        "CloudFrontOriginAccessIdentityConfig", Map.of(
            "Comment", "Test OAI comment for well-known bucket"
        )
    ));
  }
}