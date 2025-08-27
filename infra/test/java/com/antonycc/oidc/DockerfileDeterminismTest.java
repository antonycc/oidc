package com.antonycc.oidc;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * Test to verify that the base Dockerfile uses pinned versions for deterministic builds.
 */
class DockerfileDeterminismTest {

  @Test
  void dockerfileUsesPinnedOtelVersion() throws IOException {
    Path dockerfilePath = Path.of("Dockerfile");
    assertTrue(Files.exists(dockerfilePath), "Dockerfile should exist at repository root");

    String dockerfileContent = Files.readString(dockerfilePath);

    // Verify that we don't use "latest" for the OpenTelemetry layer
    assertFalse(
        dockerfileContent.contains("releases/latest/download"),
        "Dockerfile should not download 'latest' OpenTelemetry release for deterministic builds");

    // Verify that we use a pinned version
    assertTrue(
        dockerfileContent.contains("releases/download/v"),
        "Dockerfile should download a pinned version (e.g., v0.7.0) of OpenTelemetry layer");

    // Verify that we have checksum validation
    assertTrue(
        dockerfileContent.contains("sha256sum -c"),
        "Dockerfile should validate downloaded layer with SHA256 checksum");

    // Verify we're still downloading from the correct repository
    assertTrue(
        dockerfileContent.contains("aws-observability/aws-otel-js-instrumentation"),
        "Dockerfile should download from the official AWS OpenTelemetry repository");
  }
}