#!/bin/bash

# Script to update web configuration with actual Cognito client ID from CDK outputs
# Usage: ./scripts/update-web-config.sh [environment] [cdk-outputs-file]

set -e

ENV_NAME=${1:-dev}
CDK_OUTPUTS_FILE=${2:-cdk.out/cdk-outputs-cognito.json}
CONFIG_FILE="web/config.js"

echo "Updating web configuration for environment: $ENV_NAME"

if [ ! -f "$CDK_OUTPUTS_FILE" ]; then
    echo "Warning: CDK outputs file not found: $CDK_OUTPUTS_FILE"
    echo "Skipping web configuration update."
    exit 0
fi

# Extract Cognito client ID from CDK outputs
COGNITO_CLIENT_ID=$(jq -r ".\"CognitoStack-${ENV_NAME}\".UserPoolClientId // empty" "$CDK_OUTPUTS_FILE" 2>/dev/null || echo "")
COGNITO_DOMAIN=$(jq -r ".\"CognitoStack-${ENV_NAME}\".CognitoAuthDomain // empty" "$CDK_OUTPUTS_FILE" 2>/dev/null || echo "")

if [ -z "$COGNITO_CLIENT_ID" ] || [ "$COGNITO_CLIENT_ID" = "null" ]; then
    echo "Warning: Could not extract Cognito client ID from CDK outputs"
    echo "Outputs file content:"
    cat "$CDK_OUTPUTS_FILE" || echo "Failed to read outputs file"
    exit 0
fi

echo "Found Cognito Client ID: $COGNITO_CLIENT_ID"
echo "Found Cognito Domain: $COGNITO_DOMAIN"

# Create a backup of the original config
cp "$CONFIG_FILE" "$CONFIG_FILE.backup"

# Update the configuration file
if [ -n "$COGNITO_CLIENT_ID" ] && [ "$COGNITO_CLIENT_ID" != "null" ]; then
    # Update cognitoClientId in the auto-detect function
    sed -i.tmp "s/this\.cognitoClientId = null;/this.cognitoClientId = '$COGNITO_CLIENT_ID';/g" "$CONFIG_FILE"
    
    # Update specific environment configurations
    case "$ENV_NAME" in
        "prod")
            sed -i.tmp "s/\/\/ cognitoClientId should be set during deployment/this.cognitoClientId = '$COGNITO_CLIENT_ID';/g" "$CONFIG_FILE"
            ;;
        "ci")
            sed -i.tmp "/this\.cognitoDomain = 'ci\.auth\.oidc\.antonycc\.com';/a\\
      this.cognitoClientId = '$COGNITO_CLIENT_ID';" "$CONFIG_FILE"
            ;;
    esac
    
    # Clean up temporary files
    rm -f "$CONFIG_FILE.tmp"
    
    echo "Successfully updated $CONFIG_FILE with Cognito client ID: $COGNITO_CLIENT_ID"
else
    echo "No valid Cognito client ID found, config file not updated"
fi

echo "Web configuration update complete"