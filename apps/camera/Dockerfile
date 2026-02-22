# Runtime-only Docker image for pre-built camera backend
# Uses Debian (not Alpine) because @tensorflow/tfjs-node ships
# pre-built native binaries linked against glibc.
# Pinned to Node 20 because tfjs-node 4.x calls util.isNullOrUndefined
# which was removed in Node 22.
FROM docker.io/node:20-slim

ENV HOST=0.0.0.0
ENV PORT=3000
ENV CI=true

WORKDIR /app

# Install runtime dependencies: FFmpeg for RTSP→HLS, build tools for native modules
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN addgroup --system server && \
    adduser --system --ingroup server server

# Create data directories for HLS segments, snapshots, and database
RUN mkdir -p /app/data/hls /app/data/snapshots /app/data/models && \
    chown -R server:server /app/data

# Copy the pre-built application
COPY --chown=server:server dist/apps/camera ./

# Install runtime dependencies
RUN npm install --omit=dev

# Switch to non-root user
USER server

EXPOSE 3000

CMD ["node", "main.js"]
