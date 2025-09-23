# Multi-stage build for Node.js backend with native dependencies
FROM docker.io/node:lts-alpine as build

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files for dependency installation
COPY package*.json pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy source code and build
COPY . .
RUN pnpm nx build finances --prod

# Production stage
FROM docker.io/node:lts-alpine

ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

# Install runtime dependencies for native modules
RUN apk add --no-cache python3 make g++

RUN addgroup --system server && \
          adduser --system -G server server

# Install pnpm in production image
RUN npm install -g pnpm

# Copy built application and install dependencies
COPY --from=build /app/dist/apps/finances server/

# Install production dependencies from the generated package.json
RUN cd server && pnpm install --prod

# Set ownership
RUN chown -R server:server .

# Switch to non-root user
USER server

# Expose port
EXPOSE 3000

CMD [ "node", "server" ]
