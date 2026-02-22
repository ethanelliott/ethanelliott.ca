# Runtime-only Docker image for pre-built camera backend
FROM docker.io/node:lts-alpine

ENV HOST=0.0.0.0
ENV PORT=3000
ENV CI=true

WORKDIR /app

# Install runtime dependencies: FFmpeg for RTSP→HLS, build tools for native modules
RUN apk add --no-cache python3 make g++ libc6-compat ffmpeg

# Create non-root user
RUN addgroup --system server && \
    adduser --system -G server server

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
