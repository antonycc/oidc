package com.antonycc.oidc;

import java.util.AbstractMap;
import java.util.List;
import java.util.regex.Pattern;

public class ResourceNameUtils {

    private static final List<AbstractMap.SimpleEntry<Pattern, String>> dashSeparatedMappings =
            List.of(new AbstractMap.SimpleEntry<>(Pattern.compile("\\."), "-"));

    /**
     * Generate a predictable resource name prefix based on domain name and deployment name.
     * Converts domain like "oidc.example.com" to "oidc-example-com" and adds deployment name.
     */
    public static String generateResourceNamePrefix(String domainName, String deploymentName) {
        String dashedDomainName = domainName.replace('.', '-');
        return dashedDomainName + "-" + deploymentName;
    }

    /**
     * Generate a shortened predictable resource name prefix based on domain and deployment name.
     * Steps:
     * 1. Replace dots with dashes.
     * 2. Split on dashes.
     * 3. Keep segment "oidc" intact; compress all other non-empty segments to their first letter.
     * 4. Append '-' + deployment name (deployment name kept whole).
     *
     * Examples:
     *   domain=oidc.example.com, deployment=dev  -> oidc-e-c-dev
     *   domain=login.auth.service.example.com, deployment=prod -> l-a-s-e-c-prod
     *
     * @param domainName fully qualified domain name (e.g. "oidc.example.com")
     * @param deploymentName deployment name (e.g. "dev", "ci", "ci-branchname")
     * @return compressed resource name prefix
     */
    public static String generateCompressedResourceNamePrefix(String domainName, String deploymentName) {
        if (domainName == null || domainName.isBlank()) {
            throw new IllegalArgumentException("domainName must be non-empty");
        }
        if (deploymentName == null || deploymentName.isBlank()) {
            throw new IllegalArgumentException("deploymentName must be non-empty");
        }

        String dashed = domainName.replace('.', '-').toLowerCase();
        String[] parts = dashed.split("-+");
        StringBuilder sb = new StringBuilder();
        for (String part : parts) {
            if (part.isEmpty()) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append('-');
            }
            if ("oidc".equals(part)) {
                sb.append("oidc");
            } else {
                sb.append(part.charAt(0));
            }
        }
        var derivedResourceName = sb.append('-').append(deploymentName).toString();
        var truncatedResourceName = derivedResourceName.length() > 16
                ? derivedResourceName.substring(0, 16)
                : derivedResourceName;

        return truncatedResourceName;
    }

    public static String buildDashedDomainName(String env, String domainName) {
        return ResourceNameUtils.convertDotSeparatedToDashSeparated(
                "%s.%s".formatted(env, domainName), domainNameMappings);
    }

    public static String buildDashedDomainName(String env, String subDomainName, String domainName) {
        return ResourceNameUtils.convertDotSeparatedToDashSeparated(
                "%s.%s.%s".formatted(env, subDomainName, domainName), domainNameMappings);
    }

    public static final List<AbstractMap.SimpleEntry<Pattern, String>> domainNameMappings = List.of();

    /**
     * Generate AWS IAM-compatible resource names by replacing invalid characters.
     * AWS IAM role names can only contain: alphanumeric characters, plus (+), equals (=),
     * comma (,), period (.), at (@), and hyphen (-).
     * Length must be between 1 and 64 characters.
     *
     * @param resourceNamePrefix base resource name prefix
     * @param suffix additional suffix for the resource name
     * @return IAM-compatible resource name, truncated to 64 characters if needed
     */
    public static String generateIamCompatibleName(String resourceNamePrefix, String suffix) {
        if (resourceNamePrefix == null || resourceNamePrefix.isBlank()) {
            throw new IllegalArgumentException("resourceNamePrefix must be non-empty");
        }
        if (suffix == null || suffix.isBlank()) {
            throw new IllegalArgumentException("suffix must be non-empty");
        }

        // Replace any invalid characters with dashes and normalize
        String cleanPrefix = resourceNamePrefix.replaceAll("[^a-zA-Z0-9+=,.@-]", "-")
            .replaceAll("-+", "-") // Collapse multiple dashes
            .replaceAll("^-+|-+$", ""); // Remove leading/trailing dashes

        String cleanSuffix = suffix.replaceAll("[^a-zA-Z0-9+=,.@-]", "-")
            .replaceAll("-+", "-")
            .replaceAll("^-+|-+$", "");

        String fullName = cleanPrefix + "-" + cleanSuffix;

        // Truncate to 64 characters if needed
        if (fullName.length() > 64) {
            fullName = fullName.substring(0, 64);
            // Ensure we don't end with a dash after truncation
            fullName = fullName.replaceAll("-+$", "");
        }

        return fullName;
    }

    public static String convertDotSeparatedToDashSeparated(
            String input, List<AbstractMap.SimpleEntry<Pattern, String>> mappings) {
        return applyMappings(applyMappings(input, mappings), dashSeparatedMappings);
    }

    public static String applyMappings(String input, List<AbstractMap.SimpleEntry<Pattern, String>> mappings) {
        String result = input;
        for (AbstractMap.SimpleEntry<Pattern, String> mapping : mappings) {
            result = mapping.getKey().matcher(result).replaceAll(mapping.getValue());
        }
        return result;
    }
}
