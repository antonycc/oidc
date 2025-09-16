package com.antonycc.oidc.functions;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import software.amazon.awssdk.services.cloudformation.CloudFormationClient;
import software.amazon.awssdk.services.cloudformation.model.CloudFormationException;
import software.amazon.awssdk.services.cloudformation.model.DeleteStackRequest;
import software.amazon.awssdk.services.cloudformation.model.DescribeStacksRequest;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * AWS Lambda handler for self-destructing CloudFormation stacks.
 * Deletes stacks in the correct order to handle dependencies.
 */
public class SelfDestructHandler implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private static final ObjectMapper objectMapper = new ObjectMapper();
    private final CloudFormationClient cloudFormationClient;

    public SelfDestructHandler() {
        this.cloudFormationClient = CloudFormationClient.builder().build();
    }

    // Constructor for testing with custom client
    public SelfDestructHandler(CloudFormationClient cloudFormationClient) {
        this.cloudFormationClient = cloudFormationClient;
    }

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        context.getLogger().log("Starting self-destruct sequence...");

        // Stack deletion order (reverse of creation dependency order)
        List<String> stacksToDelete = new ArrayList<>();
        addStackNameIfPresent(stacksToDelete, System.getenv("OPS_STACK_NAME"));
        addStackNameIfPresent(stacksToDelete, System.getenv("EDGE_STACK_NAME"));
        addStackNameIfPresent(stacksToDelete, System.getenv("WEB_STACK_NAME"));
        addStackNameIfPresent(stacksToDelete, System.getenv("APP_STACK_NAME"));
        addStackNameIfPresent(stacksToDelete, System.getenv("DEV_STACK_NAME"));
        addStackNameIfPresent(stacksToDelete, System.getenv("OBSERVABILITY_STACK_NAME"));
        addStackNameIfPresent(stacksToDelete, System.getenv("SELF_DESTRUCT_STACK_NAME")); // Delete self last

        context.getLogger().log("Stacks to delete in order: " + String.join(", ", stacksToDelete));

        List<StackDeletionResult> results = new ArrayList<>();

        for (String stackName : stacksToDelete) {
            try {
                context.getLogger().log("Checking if stack " + stackName + " exists...");

                // Check if stack exists
                try {
                    cloudFormationClient.describeStacks(
                            DescribeStacksRequest.builder().stackName(stackName).build());
                } catch (CloudFormationException e) {
                    if (e.getMessage().contains("does not exist")) {
                        context.getLogger().log("Stack " + stackName + " does not exist, skipping");
                        results.add(new StackDeletionResult(stackName, "not_found", null));
                        continue;
                    }
                    throw e;
                }

                context.getLogger().log("Deleting stack: " + stackName);
                cloudFormationClient.deleteStack(
                        DeleteStackRequest.builder().stackName(stackName).build());

                results.add(new StackDeletionResult(stackName, "deletion_initiated", null));
                context.getLogger().log("Deletion initiated for stack: " + stackName);

                // Wait for stack to be fully deleted before proceeding (except for self-destruct stack)
                if (!stackName.equals(System.getenv("SELF_DESTRUCT_STACK_NAME"))) {
                    boolean deleted = waitForStackDeletion(stackName, context, 600); // 10 min timeout
                    if (!deleted) {
                        context.getLogger().log("Stack " + stackName + " did not delete in time.");
                    }
                }

            } catch (Exception error) {
                context.getLogger().log("Error deleting stack " + stackName + ": " + error.getMessage());
                results.add(new StackDeletionResult(stackName, "error", error.getMessage()));
            }
        }

        context.getLogger().log("Self-destruct sequence completed");

        Map<String, Object> response = new HashMap<>();
        response.put("statusCode", 200);

        Map<String, Object> body = new HashMap<>();
        body.put("message", "Self-destruct sequence completed");
        body.put("results", results);
        body.put("timestamp", Instant.now().toString());

        try {
            response.put("body", objectMapper.writeValueAsString(body));
        } catch (Exception e) {
            context.getLogger().log("Error serializing response: " + e.getMessage());
            response.put("body", "{\"error\":\"Failed to serialize response\"}");
        }

        return response;
    }

    private void addStackNameIfPresent(List<String> stackList, String stackName) {
        if (stackName != null && !stackName.trim().isEmpty()) {
            stackList.add(stackName);
        }
    }

    private boolean waitForStackDeletion(String stackName, Context context, int maxWaitSeconds) {
        int waited = 0;
        int interval = 10; // seconds
        while (waited < maxWaitSeconds) {
            try {
                cloudFormationClient.describeStacks(
                        DescribeStacksRequest.builder().stackName(stackName).build());
                context.getLogger().log("Stack " + stackName + " still exists, waiting...");
            } catch (CloudFormationException e) {
                if (e.awsErrorDetails() != null && "ValidationError".equals(e.awsErrorDetails().errorCode())) {
                    context.getLogger().log("Stack " + stackName + " deleted.");
                    return true;
                }
                context.getLogger().log("Error polling stack " + stackName + ": " + e.getMessage());
            }
            try {
                Thread.sleep(interval * 1000L);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                context.getLogger().log("Interrupted while waiting for stack deletion.");
                break;
            }
            waited += interval;
        }
        context.getLogger().log("Timeout waiting for stack " + stackName + " deletion.");
        return false;
    }

    /**
     * Result of a stack deletion operation
     */
    public static class StackDeletionResult {
        @JsonProperty("stackName")
        private final String stackName;

        @JsonProperty("status")
        private final String status;

        @JsonProperty("error")
        private final String error;

        public StackDeletionResult(String stackName, String status, String error) {
            this.stackName = stackName;
            this.status = status;
            this.error = error;
        }

        public String getStackName() {
            return stackName;
        }

        public String getStatus() {
            return status;
        }

        public String getError() {
            return error;
        }
    }
}
