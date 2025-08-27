# Docker Build Determinism

This document explains how Docker builds are kept deterministic in this project and how to maintain this when updating dependencies.

## Problem

Docker builds were previously non-deterministic because the base `Dockerfile` downloaded the "latest" AWS OpenTelemetry Lambda layer:

```dockerfile
# Non-deterministic - downloads whatever is "latest" at build time
RUN wget -O /tmp/layer.zip \
  https://github.com/aws-observability/aws-otel-js-instrumentation/releases/latest/download/layer.zip
```

This caused issues where:
- Two builds with identical source code would produce different Docker images
- CDK would detect "changes" and redeploy even when no actual code changed
- Build reproducibility was not guaranteed

## Solution

The `Dockerfile` now pins to a specific version and validates with SHA256 checksum:

```dockerfile
# Deterministic - pins to specific version with checksum validation
RUN wget -O /tmp/layer.zip \
  https://github.com/aws-observability/aws-otel-js-instrumentation/releases/download/v0.7.0/layer.zip \
  && echo "f2b41be774d2352c5a2fe32f0309d1a49c500c964353219347b25dc3c915dffa  /tmp/layer.zip" | sha256sum -c -
```

## Updating the OpenTelemetry Layer

When a new version of the AWS OpenTelemetry Lambda layer is available:

1. **Check for new releases**:
   ```bash
   curl -s https://api.github.com/repos/aws-observability/aws-otel-js-instrumentation/releases/latest | jq -r '.tag_name'
   ```

2. **Download and get checksum**:
   ```bash
   cd /tmp
   curl -L -s https://github.com/aws-observability/aws-otel-js-instrumentation/releases/download/vX.X.X/layer.zip -o layer.zip
   sha256sum layer.zip
   ```

3. **Update Dockerfile**:
   - Change the version in the URL (e.g., `v0.7.0` → `vX.X.X`)
   - Update the SHA256 checksum
   - Update the comment with the new version

4. **Test determinism**:
   ```bash
   ./scripts/test-docker-determinism.sh
   ```

5. **Verify build works**:
   ```bash
   docker build -t oidc-base:latest -f Dockerfile .
   ```

## Testing Build Determinism

Use the provided script to verify builds are deterministic:

```bash
./scripts/test-docker-determinism.sh
```

This script builds the same Dockerfile twice and compares the resulting image digests. They should be identical for deterministic builds.

## Current Pinned Versions

- **AWS OpenTelemetry Lambda Layer**: v0.7.0
  - SHA256: `f2b41be774d2352c5a2fe32f0309d1a49c500c964353219347b25dc3c915dffa`
  - Last updated: 2025-08-27

## Why This Matters

- **Reproducible builds**: Essential for security and debugging
- **CDK efficiency**: Prevents unnecessary redeployments
- **CI/CD reliability**: Builds produce consistent results
- **Security**: Checksum validation prevents supply chain attacks