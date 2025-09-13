package com.antonycc.oidc;

import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.assertions.Template;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class S3OriginConstructTest {

    @Test
    void s3OriginBucketCreatesExpectedResources() {
        App app = new App();
        Environment env = Environment.builder()
                .account("123456789012")
                .region("us-east-1")
                .build();

        // Create a test stack with necessary components
        Stack testStack =
                new Stack(app, "TestStack", StackProps.builder().env(env).build());

        // Create a logs bucket (dependency)
        Bucket logsBucket = Bucket.Builder.create(testStack, "LogsBucket")
                .bucketName("test-logs")
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .enforceSsl(true)
                .autoDeleteObjects(true)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // Create our S3OriginConstruct construct
        S3OriginConstruct s3OriginConstruct = new S3OriginConstruct(
                testStack,
                "test-prefix-WebBucket",
                S3OriginConstructProps.builder()
                        .bucketNameSuffix("web")
                        .logsPrefix("s3/web/")
                        .bucketType(S3OriginBucketType.WEB)
                        .build());

        // Verify the construct exposes the expected resources
        assertNotNull(s3OriginConstruct.bucket, "Bucket should be created and exposed");
        assertNotNull(s3OriginConstruct.origin, "Origin should be created and exposed");
        assertNotNull(s3OriginConstruct.behaviorOptions, "BehaviorOptions should be created and exposed");
        assertNull(s3OriginConstruct.cachePolicy, "CachePolicy should be null for WEB bucket type");

        // Generate CloudFormation template for verification
        Template template = Template.fromStack(testStack);

        // Verify S3 bucket properties
        template.hasResourceProperties(
                "AWS::S3::Bucket",
                Map.of(
                        "BucketName", "test-prefix-web",
                        "PublicAccessBlockConfiguration",
                                Map.of(
                                        "BlockPublicAcls", true,
                                        "BlockPublicPolicy", true,
                                        "IgnorePublicAcls", true,
                                        "RestrictPublicBuckets", true),
                        "LoggingConfiguration", Map.of("LogFilePrefix", "s3/web/")));

        // Verify bucket policy for OAI read access is created
        template.hasResourceProperties("AWS::S3::BucketPolicy", Map.of());

        // Verify we have exactly one bucket and one OAI
        template.resourceCountIs("AWS::S3::Bucket", 2); // LogsBucket + our bucket
    }

    @Test
    void s3OriginBucketWorksWithDifferentSuffixes() {
        App app = new App();
        Environment env = Environment.builder()
                .account("123456789012")
                .region("us-east-1")
                .build();

        Stack testStack =
                new Stack(app, "TestStack", StackProps.builder().env(env).build());

        Bucket logsBucket = Bucket.Builder.create(testStack, "LogsBucket")
                .bucketName("test-logs")
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .enforceSsl(true)
                .autoDeleteObjects(true)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // Create well-known bucket variant
        S3OriginConstruct wellKnownBucket = new S3OriginConstruct(
                testStack,
                "test-prefix-WellKnownBucket",
                S3OriginConstructProps.builder()
                        .bucketNameSuffix("well-known")
                        .logsPrefix("s3/well-known/")
                        .bucketType(S3OriginBucketType.WELL_KNOWN)
                        .build());

        assertNotNull(wellKnownBucket.bucket);
        assertNotNull(wellKnownBucket.origin);
        assertNotNull(wellKnownBucket.behaviorOptions);
        assertNotNull(wellKnownBucket.cachePolicy, "CachePolicy should be created for WELL_KNOWN bucket type");

        Template template = Template.fromStack(testStack);

        // Verify the well-known bucket has correct properties
        template.hasResourceProperties(
                "AWS::S3::Bucket",
                Map.of(
                        "BucketName",
                        "test-prefix-well-known",
                        "LoggingConfiguration",
                        Map.of("LogFilePrefix", "s3/well-known/")));

        // Verify that CachePolicy is created for WELL_KNOWN bucket type
        template.hasResourceProperties(
                "AWS::CloudFront::CachePolicy",
                Map.of(
                        "CachePolicyConfig",
                        Map.of(
                                "Name", "test-prefix-short-ttl",
                                "DefaultTTL", 60,
                                "MinTTL", 0,
                                "MaxTTL", 300)));
    }
}
