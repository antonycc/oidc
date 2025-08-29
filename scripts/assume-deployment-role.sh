#!/usr/bin/env bash
# scripts/assume-deployment-role.sh
# Usage: source scripts/assume-deployment-role.sh

DEFAULTED_DEPLOY_ROLE_ARN=${DEPLOY_ROLE_ARN-arn:aws:iam::403027849202:role/oidc-github-actions-deploy-role}

# Reset, assume and export into shell
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
read AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN < <(
  aws sts assume-role --role-arn "${DEFAULTED_DEPLOY_ROLE_ARN?}" --role-session-name oidc \
    --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' --output text
)
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
export AWS_REGION=us-east-1

# Report region and identity
echo "AWS_REGION=${AWS_REGION?}"
aws sts get-caller-identity
