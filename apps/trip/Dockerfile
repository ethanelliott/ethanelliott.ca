# Runtime-only Docker image for the pre-built trip backend
FROM docker.io/node:lts-alpine

ENV HOST=0.0.0.0
ENV PORT=3000
ENV CI=true

WORKDIR /app

# Build tooling for any native modules (e.g. pg native bindings)
RUN apk add --no-cache python3 make g++ libc6-compat

# Create non-root user
RUN addgroup --system server && \
    adduser --system -G server server

# Copy the pre-built application
COPY --chown=server:server dist/apps/trip ./

# Install runtime dependencies
RUN npm install --omit=dev

USER server

EXPOSE 3000

CMD ["node", "main.js"]
