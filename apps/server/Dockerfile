# Runtime-only Docker image for pre-built server
FROM docker.io/node:lts-alpine

ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ libc6-compat

RUN addgroup --system server && \
          adduser --system -G server server

# Copy the pre-built application
COPY dist/apps/server server/

# Install runtime dependencies
WORKDIR /app/server
RUN npm install --omit=dev
WORKDIR /app

RUN chown -R server:server .

# Expose the port that the application will run on
EXPOSE 3000

# Switch to non-root user for security
USER server

CMD [ "node", "server" ]
