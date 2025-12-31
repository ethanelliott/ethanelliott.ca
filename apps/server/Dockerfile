# Runtime-only Docker image for pre-built server
FROM docker.io/node:lts-alpine

ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

RUN addgroup --system server && \
          adduser --system -G server server

# Copy the pre-built application (includes package.json and node_modules from build)
COPY dist/apps/server server/
RUN chown -R server:server .

# Expose the port that the application will run on
EXPOSE 3000

# Switch to non-root user for security
USER server

CMD [ "node", "server" ]
