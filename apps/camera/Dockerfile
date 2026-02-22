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

# Install build tools for native modules (python3, make, g++)
# and wget/xz-utils to download FFmpeg static build
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ wget xz-utils && \
    rm -rf /var/lib/apt/lists/*

# Install static FFmpeg 7.1 (GPL build with all codecs)
# Debian 12 ships FFmpeg 5.1 which is too old; the BtbN static builds
# provide up-to-date binaries linked against glibc.
RUN wget -q -O /tmp/ffmpeg.tar.xz \
      https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n7.1-latest-linux64-gpl-7.1.tar.xz && \
    tar xf /tmp/ffmpeg.tar.xz --strip-components=2 -C /usr/local/bin/ \
      --wildcards '*/bin/ffmpeg' '*/bin/ffprobe' && \
    rm /tmp/ffmpeg.tar.xz && \
    ffmpeg -version | head -1

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
