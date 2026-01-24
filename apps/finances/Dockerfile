# Runtime-only Docker image for pre-built finances backend
FROM oven/bun:alpine

ENV HOST=0.0.0.0
ENV PORT=3000
ENV CI=true

WORKDIR /app

# Install only runtime dependencies for native modules
RUN apk add --no-cache python3 make g++ libc6-compat

# Create non-root user
RUN addgroup --system server && \
    adduser --system -G server server

# Create data directory for database files
RUN mkdir -p /app/data && chown server:server /app/data

# Copy the pre-built application
COPY --chown=server:server dist/apps/finances ./

# Install runtime dependencies
RUN bun install --production

# Switch to non-root user
USER server

EXPOSE 3000

CMD ["bun", "run", "main.js"]
