#!/usr/bin/env bash
# scripts/deep-clean.sh
# Usage: ./scripts/deep-clean.sh
# 
# Performs a complete clean and rebuild of the project

set -euo pipefail

# Clean test artifacts
./scripts/clean-tests.sh

# Node clean and reinstall
echo "Cleaning Node.js artifacts..."
rm -rf node_modules package-lock.json
npm ci
npm run build
npm test

# Java/CDK clean
echo "Cleaning Java/CDK artifacts..."
rm -rf target cdk.out cdk.log .aws-sam
./mvnw clean package
