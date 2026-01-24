# Runtime-only Docker image for pre-built plaid-test
FROM node:20-slim

WORKDIR /app

# Copy the pre-built application
COPY dist/apps/plaid-test .

# Install runtime dependencies
RUN npm install --omit=dev

# Default port
ENV PORT=3000

EXPOSE 3000

CMD ["node", "main.js"]
