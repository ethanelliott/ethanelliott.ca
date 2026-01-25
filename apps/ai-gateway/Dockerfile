# Runtime-only Docker image for pre-built ai-gateway backend
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

# Copy the pre-built application
COPY --chown=server:server dist/apps/ai-gateway ./

# Install runtime dependencies
RUN npm install --omit=dev

# Switch to non-root user
USER server

EXPOSE 3000

CMD ["node", "main.js"]
