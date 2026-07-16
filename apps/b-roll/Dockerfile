# Runtime-only Docker image for pre-built b-roll
FROM docker.io/node:24-slim

ENV HOST=0.0.0.0
ENV PORT=3000
ENV DB_PATH=/data/b-roll.sqlite

WORKDIR /app

RUN groupadd --system server && useradd --system --gid server server \
    && mkdir -p /data \
    && chown -R server:server /data

# Copy the pre-built application
COPY --chown=server:server dist/apps/b-roll ./

# Install runtime dependencies (express, better-sqlite3, ejs)
RUN npm install --omit=dev

USER server

EXPOSE 3000

CMD ["node", "main.js"]
