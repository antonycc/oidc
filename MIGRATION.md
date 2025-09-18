# Immutables Migration Guide

This document describes the migration to [Immutables.org](https://immutables.github.io/) for all CDK Java props classes and provides guidelines for adding new props in the future.

## Overview

All CDK stack props classes have been migrated from manual builder patterns to Immutables-generated immutable interfaces. This provides:

- **Immutability by design** - All props objects are immutable
- **Type safety** - Compile-time verification of required fields  
- **Compact code** - Eliminated ~800 lines of boilerplate builder code
- **Consistency** - Uniform pattern across all props classes

## Migration Changes

### Before (Manual Builder)
```java
public class WebStackProps implements StackProps {
    public final Environment env;
    public final String envName;
    // ... more fields
    
    private WebStackProps(Builder builder) {
        this.env = builder.env;
        this.envName = builder.envName;
        // ... field assignment
    }
    
    public static class Builder {
        private Environment env;
        private String envName;
        // ... builder methods (60+ lines)
    }
}
```

### After (Immutables Interface)
```java
@Value.Immutable
public interface WebStackProps extends StackProps {
    Environment environment();  // Renamed to avoid JSII conflicts
    String envName();
    // ... more accessors
    
    @Override
    default Environment getEnv() {
        return environment();
    }
    
    static ImmutableWebStackProps.Builder builder() {
        return ImmutableWebStackProps.builder();
    }
}
```

## Builder Usage Changes

### Creating Props Objects

**Before:**
```java
WebStackProps.builder()
    .env(env)
    .envName("dev")
    .build()
```

**After:**
```java
WebStackProps.builder()
    .environment(env)  // Note: renamed from env()
    .envName("dev")
    .build()
```

### In Stack Implementations

**Before:**
```java
Tags.of(this).add("Environment", props.envName);
String bucketName = props.resourceNamePrefix + "-web";
```

**After:**
```java
Tags.of(this).add("Environment", props.envName());
String bucketName = props.resourceNamePrefix() + "-web";
```

## Key Changes by Props Class

| Props Class | Fields | Special Notes |
|-------------|--------|---------------|
| WebStackProps | 6 | Simple migration, `env` → `environment` |
| ObservabilityStackProps | 5 | Standard Environment pattern |
| DevStackProps | 6 | Uses `envName()` instead of Environment |
| AppStackProps | 12 | Complex with many required fields |
| OpsStackProps | 13 | Multiple ARN string fields |
| PublishStackProps | 9 | Includes S3 Bucket object references |
| SelfDestructStackProps | 15 | Many stack name string fields |
| EdgeStackProps | 18 | Most complex: BehaviorOptions + Map collections |

## Adding New Props Classes

When adding new props classes, follow this pattern:

### 1. Interface Definition
```java
@Value.Immutable
public interface NewStackProps extends StackProps {
    // Use environment() for Environment fields to avoid JSII conflicts
    Environment environment();
    String envName();
    String requiredField();
    
    // Optional fields can have default values
    @Value.Default
    default boolean enableFeature() {
        return false;
    }
    
    // CDK StackProps compatibility
    @Override
    default Environment getEnv() {
        return environment();
    }
    
    // Builder factory method
    static ImmutableNewStackProps.Builder builder() {
        return ImmutableNewStackProps.builder();
    }
}
```

### 2. Builder Usage
```java
NewStackProps props = NewStackProps.builder()
    .environment(env)
    .envName("production")
    .requiredField("value")
    .build();
```

### 3. Stack Implementation
```java
public class NewStack extends Stack {
    public NewStack(Construct scope, String id, NewStackProps props) {
        super(scope, id, props);
        
        // Use method calls, not field access
        String name = props.requiredField();
        boolean enabled = props.enableFeature();
    }
}
```

## JSII Compatibility Notes

### Environment Field Naming
- **Issue**: CDK's `StackProps.getEnv()` conflicts with Immutables `env()` method
- **Solution**: Use `environment()` for the accessor and provide `getEnv()` default implementation

### String vs Environment
- Most props use `Environment environment()` for the CDK environment
- `DevStackProps` uses `String envName()` for the environment name only
- Never use `env()` as it conflicts with JSII serialization

## Best Practices

1. **Required Fields**: All fields are required by default with Immutables
2. **Optional Fields**: Use `@Value.Default` for optional fields with sensible defaults
3. **Collections**: Use `List<T>` and `Map<K,V>` - they work seamlessly with Immutables
4. **Complex Objects**: CDK objects (Bucket, Function, etc.) work directly with Immutables
5. **Naming**: Use descriptive method names that match the field purpose

## Build Configuration

The following dependencies and plugins are configured:

### Maven Dependencies
```xml
<dependency>
    <groupId>org.immutables</groupId>
    <artifactId>value</artifactId>
    <version>2.11.2</version>
    <scope>provided</scope>
</dependency>
```

### Annotation Processing
```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-compiler-plugin</artifactId>
    <configuration>
        <annotationProcessorPaths>
            <path>
                <groupId>org.immutables</groupId>
                <artifactId>value</artifactId>
                <version>2.11.2</version>
            </path>
        </annotationProcessorPaths>
    </configuration>
</plugin>
```

## Generated Classes

For each `XProps` interface, Immutables generates:
- `ImmutableXProps` - The implementation class
- `ImmutableXProps.Builder` - The builder class

These are generated during compilation and don't need to be committed to version control.

## Troubleshooting

### Common Issues

1. **"Cannot find symbol ImmutableXProps"**
   - Solution: Run `mvn compile` to trigger annotation processing

2. **"Required attributes not set"**
   - Solution: Ensure all fields without `@Value.Default` are provided in builder

3. **JSII conflicts with env**
   - Solution: Use `environment()` method name, not `env()`

### IDE Setup
Enable annotation processing in your IDE:
- **IntelliJ**: Settings → Build → Compiler → Annotation Processors → Enable
- **Eclipse**: Project Properties → Java Build Path → Annotation Processing → Enable

## Performance

- **Compilation**: Adds ~1 second for annotation processing (acceptable)
- **Runtime**: No performance impact - generates standard Java classes
- **Memory**: Immutable objects reduce memory overhead vs mutable builders