package com.antonycc.oidc;

import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;

class SynthTest {

    private static Map<String, String> parseDotEnv(Path file) {
        Map<String, String> map = new HashMap<>();
        if (Files.notExists(file)) return map;
        try {
            List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
            for (String raw : lines) {
                if (raw == null) continue;
                String line = raw.trim();
                if (line.isEmpty() || line.startsWith("#")) continue;
                int idx = line.indexOf('=');
                if (idx <= 0) continue;
                String key = line.substring(0, idx).trim();
                String value = line.substring(idx + 1).trim();
                // Remove optional surrounding quotes
                if ((value.startsWith("\"") && value.endsWith("\""))
                        || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.substring(1, value.length() - 1);
                }
                map.put(key, value);
            }
        } catch (IOException ignored) {
            // ignore missing/not readable
        }
        return map;
    }

    private static void setProps(Map<String, String> props) {
        if (props == null) return;
        for (Map.Entry<String, String> e : props.entrySet()) {
            if (e.getKey() != null && e.getValue() != null) {
                System.setProperty(e.getKey(), e.getValue());
            }
        }
    }

    @Test
    void cdkSynthCompilesAllStacksWithEnvFile() {
        // Load env vars from .env.test at repo root
        Path root = Path.of("").toAbsolutePath();
        Map<String, String> envVars = parseDotEnv(root.resolve(".env.test"));
        // Sensible defaults for account/region used by CDK
        envVars.putIfAbsent("CDK_DEFAULT_ACCOUNT", "123456789012");
        envVars.putIfAbsent("CDK_DEFAULT_REGION", "us-east-1");
        setProps(envVars);

        App app = new App();
        Environment env = Environment.builder()
                .account(System.getProperty("CDK_DEFAULT_ACCOUNT"))
                .region(System.getProperty("CDK_DEFAULT_REGION"))
                .build();

        ProviderApplication application = ProviderApplication.builder(app, env).build();

        // All stacks should be constructed
        assertNotNull(application.observabilityStack);
        assertNotNull(application.devStack);
        assertNotNull(application.appStack);
        assertNotNull(application.webStack);
        assertNotNull(application.edgeStack);
        assertNotNull(application.opsStack);
        
        // SelfDestructStack is only created for non-prod deployments when JAR exists
        // During testing, the JAR may not exist yet, so we check conditionally
        String envName = System.getProperty("ENV_NAME", "test");
        if (!"prod".equals(System.getProperty("DEPLOYMENT_NAME", envName))) {
            String handlerSource = System.getProperty("SELF_DESTRUCT_HANDLER_SOURCE", "target/self-destruct-lambda.jar");
            if (java.nio.file.Files.exists(java.nio.file.Paths.get(handlerSource))) {
                assertNotNull(application.selfDestructStack);
            }
            // If JAR doesn't exist, selfDestructStack should be null (which is fine)
        }
    }
}
