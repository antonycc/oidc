# Use the base image built in the previous job step
FROM oidc-base:latest

# Lambda-specific environment variables
ENV ISSUER="The default value from the Dockerfile is intended to be overridden."
ENV CODES_TABLE="The default value from the Dockerfile is intended to be overridden."

# No need to copy package.json or run npm install - it's already in the base image!
# The app/ directory is also already copied in the base image

# Set the specific handler for this Lambda
CMD ["app/functions/jwks.handler"]