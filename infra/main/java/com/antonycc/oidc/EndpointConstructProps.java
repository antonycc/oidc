package com.antonycc.oidc;

import java.util.List;
import java.util.Map;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;

public class EndpointConstructProps {
    public final String functionName; // e.g., "AuthorizeFn"
    public final String ecrRepositoryArn;
    public final String ecrRepositoryName;
    public final String baseImageTag; // e.g., "latest"
    public final List<String> handler; // e.g., List.of("app/functions/authorize.handler")
    public final String pathPattern; // e.g., "/authorize" or "/token"
    public final AllowedMethods allowedMethods; // e.g., AllowedMethods.ALLOW_GET_HEAD_OPTIONS
    public final Map<String, String> extraEnv; // per-lambda additional environment variables

    private EndpointConstructProps(Builder b) {
        this.functionName = b.functionName;
        this.ecrRepositoryArn = b.ecrRepositoryArn;
        this.ecrRepositoryName = b.ecrRepositoryName;
        this.baseImageTag = b.baseImageTag;
        this.handler = b.handler;
        this.pathPattern = b.pathPattern;
        this.allowedMethods = b.allowedMethods;
        this.extraEnv = b.extraEnv;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String functionName;
        private String ecrRepositoryArn;
        private String ecrRepositoryName;
        private String baseImageTag;
        private List<String> handler;
        private String pathPattern;
        private AllowedMethods allowedMethods;
        private Map<String, String> extraEnv = Map.of();

        public Builder functionName(String v) {
            this.functionName = v;
            return this;
        }

        public Builder ecrRepositoryArn(String v) {
            this.ecrRepositoryArn = v;
            return this;
        }

        public Builder ecrRepositoryName(String v) {
            this.ecrRepositoryName = v;
            return this;
        }

        public Builder baseImageTag(String v) {
            this.baseImageTag = v;
            return this;
        }

        public Builder handler(List<String> v) {
            this.handler = v;
            return this;
        }

        public Builder pathPattern(String v) {
            this.pathPattern = v;
            return this;
        }

        public Builder allowedMethods(AllowedMethods v) {
            this.allowedMethods = v;
            return this;
        }

        public Builder extraEnv(Map<String, String> v) {
            this.extraEnv = v;
            return this;
        }

        public EndpointConstructProps build() {
            java.util.List<String> missingFields = new java.util.ArrayList<>();
            if (functionName == null) missingFields.add("functionName");
            if (ecrRepositoryArn == null) missingFields.add("ecrRepositoryArn");
            if (baseImageTag == null) missingFields.add("baseImageTag");
            if (handler == null) missingFields.add("handler");
            if (pathPattern == null) missingFields.add("pathPattern");
            if (allowedMethods == null) missingFields.add("allowedMethods");
            if (!missingFields.isEmpty()) {
                throw new IllegalArgumentException("Required fields missing: " + String.join(", ", missingFields));
            }
            return new EndpointConstructProps(this);
        }
    }
}
