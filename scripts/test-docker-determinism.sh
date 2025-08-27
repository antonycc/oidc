#!/bin/bash
set -euo pipefail

# Test script to verify Docker builds are deterministic
# Builds the same Dockerfile twice and compares the resulting images

echo "Testing Docker build determinism..."

# Build first image
echo "Building first image..."
docker build -t oidc-base:determinism-test-1 -f Dockerfile . > /dev/null 2>&1

# Build second image  
echo "Building second image..."
docker build -t oidc-base:determinism-test-2 -f Dockerfile . > /dev/null 2>&1

# Get image digests (content-based hash)
DIGEST1=$(docker inspect oidc-base:determinism-test-1 --format='{{.Id}}')
DIGEST2=$(docker inspect oidc-base:determinism-test-2 --format='{{.Id}}')

echo "First build digest:  $DIGEST1"
echo "Second build digest: $DIGEST2"

# Compare digests
if [ "$DIGEST1" = "$DIGEST2" ]; then
    echo "✅ PASS: Docker builds are deterministic - identical images produced"
    exit 0
else
    echo "❌ FAIL: Docker builds are NOT deterministic - different images produced"
    echo "This indicates the Dockerfile contains non-deterministic operations"
    exit 1
fi