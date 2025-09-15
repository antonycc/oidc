# Self-Destruct Stack

## Overview

The SelfDestructStack is a special CDK stack that provides a Lambda function capable of deleting the entire cluster of OIDC provider stacks in the proper dependency order. This is particularly useful for non-production environments where you want to easily clean up all resources.

## When is it created?

The SelfDestructStack is **only created for non-production deployments**. It will not be created when `DEPLOYMENT_NAME=prod`.

## How it works

The SelfDestructStack creates:

1. **Lambda Function**: A Node.js 20.x function that calls CloudFormation APIs to delete stacks
2. **IAM Role**: With comprehensive permissions to delete all AWS resources used by the OIDC provider
3. **CloudWatch Log Group**: For monitoring the deletion process

## Stack deletion order

The Lambda function deletes stacks in the reverse order of their dependencies:

1. OpsStack
2. EdgeStack  
3. WebStack
4. AppStack
5. DevStack
6. ObservabilityStack
7. SelfDestructStack (deletes itself last)

## Usage

### Option 1: AWS CLI
```bash
aws lambda invoke --function-name <deployment-name>-<resource-prefix>-self-destruct /tmp/response.json
```

### Option 2: AWS Console
1. Navigate to Lambda in the AWS Console
2. Find the self-destruct function (named `<deployment-name>-<resource-prefix>-self-destruct`)
3. Click "Test" to invoke the function

### Option 3: Get exact command from CDK outputs
After deployment, the exact command is provided in the CDK outputs:
```bash
npx cdk deploy <deployment-name>-SelfDestructStack --outputs-file outputs.json
# Look for "SelfDestructInstructions" in the outputs
```

## Monitoring

The function logs all actions to CloudWatch Logs. You can monitor:
- Which stacks are being deleted
- Any errors during deletion
- The overall progress of the self-destruct sequence

## Safety features

- **Prod protection**: Never created for production deployments
- **Existence checks**: Skips stacks that don't exist
- **Error handling**: Continues with remaining stacks if one fails
- **Comprehensive logging**: All actions are logged for troubleshooting
- **Gradual deletion**: 30-second delays between stack deletions to avoid conflicts

## Limitations

- The function has a 15-minute timeout
- Manual intervention may be required if stacks have dependencies outside the OIDC provider
- Some resources with termination protection may need manual intervention

## Example output

```json
{
  "statusCode": 200,
  "body": {
    "message": "Self-destruct sequence completed",
    "results": [
      {"stackName": "dev-OpsStack", "status": "deletion_initiated"},
      {"stackName": "dev-EdgeStack", "status": "deletion_initiated"},
      {"stackName": "dev-WebStack", "status": "deletion_initiated"},
      {"stackName": "dev-AppStack", "status": "deletion_initiated"},
      {"stackName": "dev-DevStack", "status": "deletion_initiated"},
      {"stackName": "dev-ObservabilityStack", "status": "deletion_initiated"},
      {"stackName": "dev-SelfDestructStack", "status": "deletion_initiated"}
    ],
    "timestamp": "2025-09-14T18:41:00.000Z"
  }
}
```