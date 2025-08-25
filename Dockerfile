FROM public.ecr.aws/lambda/nodejs:22

# System tools needed to unpack the layer
RUN microdnf install -y unzip wget && microdnf clean all

# Fetch the AWS OpenTelemetry Lambda layer for JavaScript and expand into /opt
# This is the same payload used by the Lambda Layer; container images must vendor it.
# See: aws-observability/aws-otel-js-instrumentation releases
RUN wget -O /tmp/layer.zip \
  https://github.com/aws-observability/aws-otel-js-instrumentation/releases/latest/download/layer.zip \
  && mkdir -p /opt \
  && unzip -q /tmp/layer.zip -d /opt \
  && chmod -R 755 /opt \
  && rm /tmp/layer.zip

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY app/ app/
