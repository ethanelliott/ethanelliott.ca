# Runtime-only Docker image for pre-built recipes backend
FROM node:20-slim

ENV HOST=0.0.0.0
ENV PORT=3000
ENV CI=true

# Install Chrome and dependencies for Puppeteer (used for URL recipe import fallback)
RUN apt-get update \
    && apt-get install -y wget gnupg python3 make g++ \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /app

# Create data directory for database files
RUN mkdir -p /app/data

# Copy the pre-built application
COPY dist/apps/recipes ./

# Install runtime dependencies
RUN npm install --omit=dev

# Add user with fixed UID/GID so we don't need --no-sandbox (matches aritzia-scanner pattern)
RUN groupadd -r -g 1001 pptruser && useradd -r -u 1001 -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /app

# Switch to non-root user
USER pptruser

EXPOSE 3000

CMD ["node", "main.js"]
