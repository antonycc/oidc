# Operations Manual

This document provides operational procedures, monitoring guidance, and runbooks for managing the OIDC provider in production.

## Quick Reference

### Emergency Contacts
- **Primary Maintainer**: antony@antonycc.com
- **GitHub Issues**: https://github.com/antonycc/oidc/issues
- **Status Page**: Monitor via CloudWatch dashboards

### Critical URLs
- **Production**: https://oidc.antonycc.com
- **Staging**: https://ci.oidc.antonycc.com  
- **Health Check**: `/.well-known/openid-configuration`
- **Metrics**: AWS CloudWatch Console

## Monitoring and Alerting

### Key Metrics to Monitor

#### Application Metrics
| Metric | Normal Range | Warning Threshold | Critical Threshold |
|--------|-------------|-------------------|-------------------|
| HTTP Error Rate | < 1% | > 5% | > 10% |
| Average Response Time | < 200ms | > 500ms | > 1000ms |
| Lambda Duration | < 5000ms | > 10000ms | > 30000ms |
| DynamoDB Throttles | 0 | > 0 | > 10/min |

#### Infrastructure Metrics
| Metric | Normal Range | Warning Threshold | Critical Threshold |
|--------|-------------|-------------------|-------------------|
| Lambda Errors | < 0.1% | > 1% | > 5% |
| Lambda Concurrent Executions | < 100 | > 500 | > 800 |
| DynamoDB Consumed Capacity | Variable | Baseline + 200% | Baseline + 500% |
| CloudFront 4xx Errors | < 2% | > 5% | > 10% |

### CloudWatch Dashboards

#### Primary Dashboard Widgets
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/Lambda", "Invocations", "FunctionName", "OidcProviderStack-prod-AuthorizeFunction"],
          [".", "Errors", ".", "."],
          [".", "Duration", ".", "."]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "Authorization Function"
      }
    }
  ]
}
```

#### Custom Metrics
```bash
# Publish custom metrics from application
aws cloudwatch put-metric-data \
  --namespace "OIDC/Application" \
  --metric-data MetricName=AuthenticationSuccess,Value=1,Unit=Count
```

### CloudWatch Alarms

#### High Error Rate Alarm
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "OIDC-HighErrorRate" \
  --alarm-description "OIDC provider error rate > 5%" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 5.0 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=FunctionName,Value=OidcProviderStack-prod-AuthorizeFunction \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:oidc-alerts
```

#### High Latency Alarm
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "OIDC-HighLatency" \
  --alarm-description "OIDC provider latency > 1 second" \
  --metric-name Duration \
  --namespace AWS/Lambda \
  --statistic Average \
  --period 300 \
  --threshold 1000.0 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

### Log Monitoring

#### Structured Log Analysis
```bash
# Find authentication failures
aws logs filter-log-events \
  --log-group-name "/aws/lambda/OidcProviderStack-prod-AuthorizeFunction" \
  --filter-pattern '{ $.msg = "*invalid_credentials*" }'

# Monitor error patterns
aws logs filter-log-events \
  --log-group-name "/aws/lambda/OidcProviderStack-prod-TokenFunction" \
  --filter-pattern '{ $.level = "error" }' \
  --start-time $(date -d '1 hour ago' +%s)000
```

#### Log Insights Queries
```sql
-- Error rate by function
fields @timestamp, @message
| filter @message like /error/
| stats count() by bin(5m)

-- Slowest requests
fields @timestamp, @duration
| filter @type = "REPORT"
| sort @duration desc
| limit 10

-- Authentication patterns
fields @timestamp, msg
| filter msg like /authorize/
| stats count() by bin(1h)
```

## Deployment Operations

### Production Deployment Process

#### Pre-Deployment Checklist
- [ ] All tests passing in CI
- [ ] Staging environment validated
- [ ] Deployment window scheduled
- [ ] Rollback plan prepared
- [ ] Monitoring alerts configured

#### Deployment Steps
```bash
# 1. Set production environment variables
export ENV_NAME=prod
export DOMAIN_NAME=oidc.antonycc.com
export CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/prod

# 2. Synthesize and validate CDK
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
npx cdk synth OidcProviderStack-prod

# 3. Deploy infrastructure
npx cdk deploy OidcProviderStack-prod --require-approval never

# 4. Wait for deployment completion
aws cloudformation describe-stacks \
  --stack-name OidcProviderStack-prod \
  --query 'Stacks[0].StackStatus'

# 5. Validate deployment
curl -s https://oidc.antonycc.com/.well-known/openid-configuration | jq .

# 6. Run smoke tests
npm run test:smoke
```

#### Post-Deployment Validation
```bash
# Health check
curl -f https://oidc.antonycc.com/.well-known/openid-configuration

# Check all endpoints
curl -f https://oidc.antonycc.com/jwks
curl -f https://oidc.antonycc.com/login.html

# Monitor logs for errors
aws logs tail /aws/lambda/OidcProviderStack-prod-AuthorizeFunction --follow
```

### Rollback Procedures

#### Immediate Rollback (Infrastructure)
```bash
# 1. Identify previous good version
git log --oneline -10

# 2. Checkout previous version
git checkout <previous-good-commit>

# 3. Deploy previous version
npx cdk deploy OidcProviderStack-prod --require-approval never

# 4. Validate rollback
curl -f https://oidc.antonycc.com/.well-known/openid-configuration
```

#### Emergency Rollback (DNS)
```bash
# Point domain to maintenance page
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456789ABCDEFG \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "oidc.antonycc.com",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "maintenance.example.com",
          "EvaluateTargetHealth": false,
          "HostedZoneId": "Z123456789ABCDEFG"
        }
      }
    }]
  }'
```

### Configuration Management

#### Environment Variables Update
```bash
# 1. Update CDK stack with new environment variables
# Edit infra/main/java/com/antonycc/oidc/OidcProviderStack.java

# 2. Deploy configuration change
npx cdk deploy OidcProviderStack-prod

# 3. Restart Lambda functions to pick up new variables
aws lambda update-function-configuration \
  --function-name OidcProviderStack-prod-AuthorizeFunction \
  --environment Variables='{}'
```

#### Client Configuration Update
```bash
# 1. Update client registry in app/lib/clients.mjs
# 2. Deploy application update
npm run build
npx cdk deploy OidcProviderStack-prod

# 3. Validate client configuration
# Test with updated client credentials
```

## Incident Response

### Incident Classification

#### Severity Levels
- **P0 (Critical)**: Complete service outage, security breach
- **P1 (High)**: Partial service degradation, affecting multiple users
- **P2 (Medium)**: Single component failure, limited user impact
- **P3 (Low)**: Minor issues, cosmetic problems

### P0 Incident Response

#### Immediate Actions (< 5 minutes)
1. **Acknowledge incident** in monitoring system
2. **Notify stakeholders** via appropriate channels
3. **Assess impact** and gather initial information
4. **Implement immediate mitigation** if available

#### Investigation Phase (< 30 minutes)
```bash
# 1. Check service status
curl -f https://oidc.antonycc.com/.well-known/openid-configuration

# 2. Review CloudWatch alarms
aws cloudwatch describe-alarms --state-value ALARM

# 3. Check recent deployments
aws cloudformation describe-stack-events \
  --stack-name OidcProviderStack-prod \
  --max-items 20

# 4. Review error logs
aws logs filter-log-events \
  --log-group-name "/aws/lambda/OidcProviderStack-prod-AuthorizeFunction" \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000
```

#### Resolution Phase
1. **Identify root cause** through log analysis and metrics
2. **Implement fix** via code change or configuration update
3. **Test fix** in staging environment
4. **Deploy to production** following deployment procedures
5. **Validate resolution** through monitoring and testing

#### Post-Incident Activities
1. **Document timeline** and root cause analysis
2. **Update runbooks** with lessons learned
3. **Implement preventive measures**
4. **Schedule post-mortem review**

### Common Incident Scenarios

#### Scenario 1: High Error Rate
**Symptoms**: CloudWatch alarms, user reports of authentication failures

**Investigation**:
```bash
# Check error distribution
aws logs filter-log-events \
  --log-group-name "/aws/lambda/OidcProviderStack-prod-AuthorizeFunction" \
  --filter-pattern '{ $.level = "error" }' \
  --start-time $(date -d '30 minutes ago' +%s)000

# Check DynamoDB errors
aws logs filter-log-events \
  --filter-pattern "ProvisionedThroughputExceededException"
```

**Common Causes**:
- DynamoDB throttling (rare with on-demand)
- Lambda timeout or memory issues
- Invalid client configurations
- Expired certificates

#### Scenario 2: Complete Service Outage
**Symptoms**: All endpoints returning errors, CloudFront 5xx responses

**Investigation**:
```bash
# Check CloudFormation stack status
aws cloudformation describe-stacks --stack-name OidcProviderStack-prod

# Check Lambda function status
aws lambda get-function --function-name OidcProviderStack-prod-AuthorizeFunction

# Check CloudFront distribution status
aws cloudfront get-distribution --id E123456789ABCD
```

**Common Causes**:
- Failed deployment
- AWS service outage
- Certificate expiration
- DNS configuration issues

#### Scenario 3: Performance Degradation
**Symptoms**: Slow response times, timeout errors

**Investigation**:
```bash
# Check Lambda duration metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=OidcProviderStack-prod-AuthorizeFunction \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum

# Check DynamoDB latency
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name UserErrors \
  --dimensions Name=TableName,Value=OidcProviderStack-prod-CodesTable
```

## Maintenance Procedures

### Regular Maintenance Tasks

#### Weekly Tasks
- [ ] Review CloudWatch metrics and trends
- [ ] Check for AWS service health issues  
- [ ] Validate certificate expiration dates
- [ ] Review security logs for anomalies

#### Monthly Tasks  
- [ ] Update dependencies (`npm audit`, security patches)
- [ ] Review and optimize CloudWatch log retention
- [ ] Analyze cost trends and optimization opportunities
- [ ] Update disaster recovery procedures

#### Quarterly Tasks
- [ ] Security audit and penetration testing
- [ ] Performance load testing
- [ ] DR drills and backup validation
- [ ] Architecture review and optimization planning

### Certificate Management

#### Certificate Renewal
```bash
# Check certificate expiration
aws acm describe-certificate \
  --certificate-arn $CERTIFICATE_ARN \
  --region us-east-1 \
  --query 'Certificate.NotAfter'

# Request new certificate (if needed)
aws acm request-certificate \
  --domain-name oidc.antonycc.com \
  --subject-alternative-names "*.oidc.antonycc.com" \
  --validation-method DNS \
  --region us-east-1
```

#### Certificate Deployment
```bash
# Update CDK with new certificate ARN
export CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/new-cert

# Deploy update
npx cdk deploy OidcProviderStack-prod

# Validate new certificate
echo | openssl s_client -servername oidc.antonycc.com -connect oidc.antonycc.com:443 2>/dev/null | openssl x509 -noout -dates
```

### Database Maintenance

#### DynamoDB Table Maintenance
```bash
# Check table metrics
aws dynamodb describe-table --table-name OidcProviderStack-prod-CodesTable

# Monitor consumed capacity
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=OidcProviderStack-prod-CodesTable \
  --start-time $(date -d '24 hours ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum
```

#### Data Cleanup
```bash
# TTL handles automatic cleanup, but manual cleanup if needed:

# List expired authorization codes (manual inspection only)
aws dynamodb scan \
  --table-name OidcProviderStack-prod-CodesTable \
  --filter-expression "attribute_exists(#ttl) AND #ttl < :now" \
  --expression-attribute-names '{"#ttl": "ttl"}' \
  --expression-attribute-values '{":now": {"N": "'$(date +%s)'"}}'
```

### Backup and Recovery

#### Data Backup
```bash
# DynamoDB point-in-time recovery is enabled by default
# Create on-demand backup for major changes
aws dynamodb create-backup \
  --table-name OidcProviderStack-prod-CodesTable \
  --backup-name "pre-migration-$(date +%Y%m%d)"

# Export table for external backup
aws dynamodb export-table-to-point-in-time \
  --table-arn arn:aws:dynamodb:us-east-1:123456789012:table/OidcProviderStack-prod-CodesTable \
  --s3-bucket my-backup-bucket \
  --s3-prefix oidc-backup/
```

#### Infrastructure Backup
```bash
# CDK template backup (infrastructure as code)
npx cdk synth OidcProviderStack-prod > oidc-infrastructure-backup.yaml

# Store in version control and S3
aws s3 cp oidc-infrastructure-backup.yaml s3://my-backup-bucket/oidc/
```

#### Disaster Recovery Testing
```bash
# Test recovery in different region
export AWS_DEFAULT_REGION=us-west-2
export ENV_NAME=dr-test

# Deploy to DR region
npx cdk deploy OidcProviderStack-dr-test

# Test functionality
curl -f https://dr-test.oidc.antonycc.com/.well-known/openid-configuration

# Cleanup DR test
npx cdk destroy OidcProviderStack-dr-test
```

## Security Operations

### Security Monitoring

#### CloudTrail Analysis
```bash
# Monitor API access patterns
aws logs filter-log-events \
  --log-group-name CloudTrail/APIActivity \
  --filter-pattern '{ $.sourceIPAddress != "expected-ip-range" }'

# Check for unusual authentication patterns
aws logs filter-log-events \
  --log-group-name "/aws/lambda/OidcProviderStack-prod-AuthorizeFunction" \
  --filter-pattern '{ $.msg = "*invalid_credentials*" }' \
  --start-time $(date -d '24 hours ago' +%s)000
```

#### Security Audit
```bash
# Check IAM policies for excessive permissions
aws iam get-role-policy \
  --role-name OidcProviderStack-prod-AuthorizeFunctionRole \
  --policy-name OidcProviderStack-prod-AuthorizeFunctionRoleDefaultPolicy

# Review security groups (if VPC deployed)
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=OidcProviderStack-*"
```

### Incident Response - Security

#### Security Incident Escalation
1. **P0 Security Incident**: Potential data breach, unauthorized access
   - Immediately disable affected resources
   - Notify security team and leadership
   - Begin forensic investigation

2. **Investigation Tools**:
   ```bash
   # CloudTrail forensics
   aws logs filter-log-events \
     --log-group-name CloudTrail/APIActivity \
     --start-time $(date -d '7 days ago' +%s)000 \
     --filter-pattern '{ $.sourceIPAddress = "suspicious-ip" }'
   
   # Application log forensics
   aws logs filter-log-events \
     --log-group-name "/aws/lambda/OidcProviderStack-prod-AuthorizeFunction" \
     --filter-pattern '{ $.msg = "*user-of-interest*" }'
   ```

#### Security Response Actions
```bash
# Rotate JWT signing keys immediately
aws dynamodb delete-item \
  --table-name OidcProviderStack-prod-CodesTable \
  --key '{"code": {"S": "jwk-key-store"}}'

# Invalidate all active sessions (if session management implemented)
# Update client secrets (if confidential clients)
# Review and update security policies
```

## Performance Optimization

### Performance Monitoring
```bash
# Lambda performance analysis
aws logs filter-log-events \
  --log-group-name "/aws/lambda/OidcProviderStack-prod-AuthorizeFunction" \
  --filter-pattern "REPORT" \
  --start-time $(date -d '1 hour ago' +%s)000

# X-Ray trace analysis
aws xray get-trace-summaries \
  --time-range-type TimeRangeByStartTime \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s)
```

### Optimization Actions
```bash
# Increase Lambda memory for better performance
aws lambda update-function-configuration \
  --function-name OidcProviderStack-prod-AuthorizeFunction \
  --memory-size 1024

# Enable provisioned concurrency for consistent performance
aws lambda put-provisioned-concurrency-config \
  --function-name OidcProviderStack-prod-AuthorizeFunction \
  --qualifier '$LATEST' \
  --provisioned-concurrency-executions 10
```

---

## Quick Action Reference

**Service Health Check**:
```bash
curl -f https://oidc.antonycc.com/.well-known/openid-configuration
```

**Recent Error Check**:
```bash
aws logs filter-log-events \
  --log-group-name "/aws/lambda/OidcProviderStack-prod-AuthorizeFunction" \
  --filter-pattern "ERROR" \
  --start-time $(date -d '30 minutes ago' +%s)000
```

**Emergency Rollback**:
```bash
git checkout <previous-good-commit>
npx cdk deploy OidcProviderStack-prod --require-approval never
```

**Force Key Rotation**:
```bash
aws dynamodb delete-item \
  --table-name OidcProviderStack-prod-CodesTable \
  --key '{"code": {"S": "jwk-key-store"}}'
```

For additional support, consult the troubleshooting guide (`TROUBLESHOOTING.md`) or create a GitHub issue with operational context and log excerpts.