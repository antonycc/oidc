package com.antonycc.oidc;

import java.util.AbstractMap;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

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
        sb.append('-').append(deploymentName);
        return sb.toString();
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

    public static String convertCamelCaseToDashSeparated(String input) {
        if (input == null || input.isEmpty()) {
            // return input;
            throw new IllegalArgumentException("Input cannot be null or empty");
        } else {
            String result = input.chars()
                    .mapToObj(c ->
                            Character.isUpperCase(c) ? "-" + Character.toLowerCase((char) c) : String.valueOf((char) c))
                    .collect(Collectors.joining())
                    .replaceAll("[ .\\-_]+", "-")
                    .replaceAll("-http", "")
                    .replaceAll("-handler", "");
            return result.startsWith("-") ? result.substring(1) : result;
        }
    }

    public static String convertDotSeparatedToDashSeparated(String input) {
        return convertDotSeparatedToDashSeparated(input, Collections.emptyList());
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
