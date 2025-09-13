# Production Deployment Guide: Serverless OIDC Provider

## Overview

This guide provides step-by-step instructions for deploying the refactored serverless OIDC provider to production environments with AWS Well-Architected best practices.

## Prerequisites

### Required AWS Services
- **AWS CLI** configured with appropriate permissions
- **AWS CDK v2** installed globally
- **Route 53 Hosted Zone** for your domain
- **ACM Certificate** in us-east-1 region (for CloudFront)
- **IAM Permissions** for CDK deployment

### Development Environment
```bash
# Install Node 22 (required)
nvm install 22 && nvm use 22

# Install Java 21 (required for CDK)
sudo apt install openjdk-21-jdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64

# Install dependencies
npm ci
npx playwright install --with-deps
```

## Production Environment Setup

### 1. Domain and Certificate Preparation

#### Request ACM Certificate (us-east-1 region required for CloudFront)
```bash
aws acm request-certificate \
  --domain-name oidc.yourcompany.com \
  --validation-method DNS \
  --region us-east-1
```

#### Get Route 53 Hosted Zone Details
```bash
aws route53 list-hosted-zones --query 'HostedZones[?Name==`yourcompany.com.`]'
```

### 2. Environment Configuration

Create production environment file:
```bash
# .env.prod
ENV_NAME=prod
DEPLOYMENT_NAME=prod
DOMAIN_NAME=oidc.yourcompany.com
HOSTED_ZONE_NAME=yourcompany.com
HOSTED_ZONE_ID=Z1234567890ABC
CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012
BASE_IMAGE_TAG=latest
CDK_DEFAULT_ACCOUNT=123456789012
CDK_DEFAULT_REGION=us-east-1
```

### 3. Production Deployment Process

#### Step 1: Bootstrap CDK (One-time per account/region)
```bash
source .env.prod
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION
```

#### Step 2: Build Container Images
```bash
# Build and push Lambda container images
./scripts/build-images.sh prod
```

#### Step 3: Deploy Infrastructure Stacks
```bash
source .env.prod

# Deploy in dependency order
npx cdk deploy ObservabilityStack-prod --require-approval never
npx cdk deploy DevStack-prod --require-approval never  
npx cdk deploy AppStack-prod --require-approval never
npx cdk deploy WebStack-prod --require-approval never
npx cdk deploy OpsStack-prod --require-approval never
```

#### Step 4: Verify Deployment
```bash
# Check stack outputs
npx cdk list
aws cloudformation describe-stacks --stack-name AppStack-prod --query 'Stacks[0].Outputs'

# Test endpoints
curl https://oidc.yourcompany.com/.well-known/openid_configuration
curl https://oidc.yourcompany.com/.well-known/jwks.json
```

## Production Hardening Checklist

### Security Enhancements

#### 1. WAF Protection (Recommended)
```java
// Add to WebStack.java - see implementation guide
CfnWebACL webAcl = CfnWebACL.Builder.create(this, "WebAcl")
    .scope("CLOUDFRONT")
    .defaultAction(CfnWebACL.DefaultActionProperty.builder()
        .allow(CfnWebACL.ActionProperty.builder().build())
        .build())
    .rules(List.of(
        // Rate limiting rule
        rateLimitRule,
        // AWS Managed Common Rule Set  
        commonRuleSet,
        // Known bad inputs rule
        knownBadInputsRule
    ))
    .build();
```

#### 2. Secrets Manager Integration
```java
// Replace environment variables with Secrets Manager
import software.amazon.awscdk.services.secretsmanager.Secret;

Secret jwtSecret = Secret.Builder.create(this, "JwtSecret")
    .description("JWT signing keys for OIDC provider")
    .generateSecretString(SecretStringGenerator.builder()
        .secretStringTemplate("{\"algorithm\":\"RS256\"}")
        .generateStringKey("private_key")
        .passwordLength(4096)
        .excludeCharacters(" %+~`#$&*()|[]{}:;<>?!'/\"@\\")
        .build())
    .build();
```

#### 3. GuardDuty Enable
```bash
# Enable GuardDuty for threat detection
aws guardduty create-detector --enable
```

### Monitoring and Alerting

#### 1. Enhanced CloudWatch Alarms
```java
// High-priority production alarms
Alarm criticalErrorAlarm = Alarm.Builder.create(this, "CriticalErrorAlarm")
    .alarmName("OIDC-Production-Critical-Errors")
    .metric(tokenEndpointFunction.metricErrors())
    .threshold(1.0) // Any error in token endpoint
    .evaluationPeriods(1)
    .treatMissingData(TreatMissingData.NOT_BREACHING)
    .build();

// SNS notification for critical alerts
Topic alertTopic = Topic.Builder.create(this, "AlertTopic")
    .displayName("OIDC Production Alerts")
    .build();

criticalErrorAlarm.addAlarmAction(new SnsAction(alertTopic));
```

#### 2. Operational Dashboard
The refactor branch includes comprehensive operational dashboards in `OpsStack`:
- Lambda invocation and error metrics
- DynamoDB throttling and performance metrics
- CloudFront request patterns and cache hit rates
- Cost allocation and resource utilization

### Backup and Recovery

#### 1. DynamoDB Point-in-Time Recovery (Already Enabled)
```java
// Verify PITR is enabled in AppStack
Table.Builder.create(this, "UsersTable")
    .pointInTimeRecovery(true)
    .build();
```

#### 2. Cross-Region Backup (Optional)
```bash
# Enable cross-region replication for critical data
aws dynamodb create-global-table \
  --global-table-name oidc-users-prod \
  --replication-group RegionName=us-east-1 RegionName=us-west-2
```

## Performance Optimization

### Lambda Configuration
```java
// Optimize Lambda memory and timeout settings
Function.Builder.create(this, "TokenEndpoint")
    .memorySize(512) // Tune based on load testing
    .timeout(Duration.seconds(30))
    .reservedConcurrentExecutions(100) // Prevent runaway costs
    .build();
```

### CloudFront Caching
```java
// Cache .well-known endpoints for better performance
BehaviorOptions.builder()
    .origin(origin)
    .cachePolicy(CachePolicy.CACHING_OPTIMIZED)
    .allowedMethods(AllowedMethods.ALLOW_GET_HEAD)
    .build();
```

## Cost Management

### Budget Alerts
```java
// Monthly budget with SNS alerts
Budget.Builder.create(this, "ProductionBudget")
    .budget(BudgetProps.builder()
        .budgetName("OIDC-Production-Monthly")
        .budgetLimit(BudgetLimit.builder()
            .amount(500.0) // $500/month threshold
            .unit("USD")
            .build())
        .timeUnit(TimeUnit.MONTHLY)
        .budgetType(BudgetType.COST)
        .build())
    .subscribers(List.of(
        Subscriber.builder()
            .subscriptionType(SubscriptionType.EMAIL)
            .address("billing@yourcompany.com")
            .build()
    ))
    .build();
```

### Cost Allocation Tags
The refactor branch includes comprehensive tagging:
```java
Tags.of(this).add("Environment", "prod");
Tags.of(this).add("Application", "oidc-provider");
Tags.of(this).add("CostCenter", "authentication");
Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
Tags.of(this).add("Criticality", "high");
```

## Scaling Considerations

### Expected Performance Characteristics
- **Cold Start Time**: ~1-2 seconds (container-based Lambda)
- **Warm Request Latency**: <100ms for token operations
- **Concurrent Users**: 1000+ with default Lambda limits
- **Throughput**: 10,000+ authentications/minute

### Auto-Scaling Behavior
- **Lambda**: Automatic scaling up to account limits
- **DynamoDB**: On-demand scaling handles any reasonable load
- **CloudFront**: Global edge network provides worldwide performance

### Cost Projections
| Monthly Authentications | Estimated Cost | Cost per Auth |
|-------------------------|----------------|---------------|
| 10,000                  | $2-3           | $0.0002       |
| 100,000                 | $15-20         | $0.0002       |
| 1,000,000               | $100-150       | $0.00015      |
| 10,000,000              | $800-1200      | $0.00012      |

## Disaster Recovery

### Recovery Time Objectives (RTO)
- **Infrastructure**: 15-30 minutes (CDK redeploy)
- **Data**: Near-zero (DynamoDB multi-AZ)
- **DNS**: 5-15 minutes (Route 53 propagation)

### Recovery Point Objectives (RPO)
- **Point-in-Time Recovery**: 5 minutes
- **Cross-Region Backup**: 15 minutes (if enabled)

### DR Procedures
```bash
# Complete infrastructure recovery in new region
export CDK_DEFAULT_REGION=us-west-2
source .env.prod

# Bootstrap new region
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION

# Deploy all stacks
npx cdk deploy --all --require-approval never

# Restore data from backup (if needed)
aws dynamodb restore-table-from-backup \
  --target-table-name oidc-users-prod-recovered \
  --backup-arn arn:aws:dynamodb:us-east-1:account:table/oidc-users-prod/backup/backup-id
```

## Maintenance Procedures

### Regular Maintenance Tasks
1. **Weekly**: Review CloudWatch alarms and metrics
2. **Monthly**: Analyze cost reports and optimize
3. **Quarterly**: Update dependencies and security patches
4. **Annually**: Disaster recovery testing

### Update Procedures
```bash
# Update application code
git pull origin main
npm ci

# Update dependencies
npm audit fix
npm run formatting-fix

# Deploy updates
source .env.prod
npx cdk deploy --all --require-approval never
```

### Rollback Procedures
```bash
# Quick rollback to previous version
aws lambda update-function-code \
  --function-name oidc-token-endpoint-prod \
  --image-uri $ECR_REPO:previous-tag

# Full infrastructure rollback
git checkout previous-stable-commit
npx cdk deploy --all --require-approval never
```

## Compliance and Security

### Security Scanning
```bash
# NPM security audit
npm audit

# Container security scanning
aws ecr start-image-scan --repository-name oidc-provider-repo --image-id imageTag=latest

# Infrastructure security assessment
npx cdk-nag
```

### Compliance Documentation
- **SOC 2**: Audit trails via CloudTrail
- **GDPR**: Data retention policies via DynamoDB TTL
- **HIPAA**: Encryption at rest and in transit
- **PCI DSS**: Secure authentication flows

## Troubleshooting Guide

### Common Issues and Solutions

#### 1. Lambda Cold Starts
```bash
# Check Lambda metrics
aws logs filter-log-events \
  --log-group-name /aws/lambda/oidc-token-endpoint-prod \
  --filter-pattern "INIT_START"

# Solution: Enable provisioned concurrency for critical functions
```

#### 2. DynamoDB Throttling
```bash
# Check DynamoDB metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ThrottledRequests \
  --dimensions Name=TableName,Value=oidc-users-prod

# Solution: Already using on-demand billing mode for auto-scaling
```

#### 3. Certificate Issues
```bash
# Verify certificate status
aws acm describe-certificate \
  --certificate-arn $CERTIFICATE_ARN \
  --region us-east-1

# Solution: Ensure certificate is validated and in us-east-1
```

## Support and Contact Information

### Technical Support
- **Primary Contact**: Platform Team (platform@yourcompany.com)
- **Emergency Escalation**: On-call rotation via PagerDuty
- **Documentation**: Internal wiki and AWS documentation

### Monitoring Dashboards
- **CloudWatch Dashboard**: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=oidc-prod-operations
- **Cost Dashboard**: AWS Cost Explorer with OIDC tags filter
- **Security Dashboard**: GuardDuty findings and CloudTrail insights

---

This production deployment guide ensures your OIDC provider is deployed with enterprise-grade security, monitoring, and operational practices following AWS Well-Architected principles.