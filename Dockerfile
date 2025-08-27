FROM public.ecr.aws/lambda/nodejs:22

# System tools needed to unpack the layer
RUN microdnf install -y unzip wget && microdnf clean all

# Fetch the AWS OpenTelemetry Lambda layer for JavaScript and expand into /opt
# This is the same payload used by the Lambda Layer; container images must vendor it.
# See: aws-observability/aws-otel-js-instrumentation releases
# Pinned to v0.7.0 for deterministic builds - update version and checksum when upgrading
RUN wget -O /tmp/layer.zip \
  https://github.com/aws-observability/aws-otel-js-instrumentation/releases/download/v0.7.0/layer.zip \
  && echo "f2b41be774d2352c5a2fe32f0309d1a49c500c964353219347b25dc3c915dffa  /tmp/layer.zip" | sha256sum -c - \
  && mkdir -p /opt \
  && unzip -q /tmp/layer.zip -d /opt \
  && chmod -R 755 /opt \
  && rm /tmp/layer.zip

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY app/ app/
