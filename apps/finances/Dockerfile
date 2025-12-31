# Runtime-only Docker image for pre-built finances backend
FROM docker.io/node:lts-alpine

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

# Copy the pre-built application (includes package.json and node_modules from build)
COPY --chown=server:server dist/apps/finances ./

# Switch to non-root user
USER server

EXPOSE 3000

CMD ["node", "main.js"]
