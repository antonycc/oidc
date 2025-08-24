#!/usr/bin/env bash
# scripts/deep-clean.sh
# Usage: ./scripts/deep-clean.sh
#
# This file is part of the Example Suite for `agentic-lib` see: https://github.com/xn-intenton-z2a/agentic-lib
# This file is licensed under the MIT License. For details, see LICENSE-MIT
#

./scripts/clean-tests.sh

# Node clean build and test
if [[ -e 'package.json' ]]; then
  rm -rf build
  rm -rf coverage
  rm -rf dist
  rm -rf node_modules
  rm -rf package-lock.json
  npm install
  npm run build
  npm test
fi

# Shut down any running Docker containers then remove any images
if [[ -e 'Dockerfile' ]]; then
  docker-compose down --rmi all --volumes
  docker system prune --all --force --volumes
fi

# Java/CDK clean
if [[ -e 'pom.xml' ]]; then
  rm -rf target
  rm -rf cdk.out
  rm -rf cdk.log
  rm -rf ~/.m2/repository
  rm -rf .aws-sam
  ./mvnw clean package
fi
