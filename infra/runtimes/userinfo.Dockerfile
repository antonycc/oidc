# Use the base image built in the previous job step
FROM oidc-base:latest

# Lambda-specific environment variables
ENV ISSUER="The default value from the Dockerfile is intended to be overridden."

# The base image already contains node, deps and app code
# Set the specific handler for this Lambda
CMD ["app/functions/userinfo.handler"]
