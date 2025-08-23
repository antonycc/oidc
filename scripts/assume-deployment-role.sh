#!/usr/bin/env bash
# scripts/assume-deployment-role.sh
# Usage: source scripts/assume-deployment-role.sh

# assume and export into your shell
read AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN < <(
  aws sts assume-role --role-arn "$DEPLOY_ROLE_ARN" --role-session-name oid \
    --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' --output text
)
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
export AWS_REGION='eu-west-2'  # or your region

# verify you’re the role
aws sts get-caller-identity
