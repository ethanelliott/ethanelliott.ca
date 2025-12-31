# Multi-stage build for Angular app
FROM docker.io/node:lts-alpine as build

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json bun.lock ./

# Install bun and dependencies
RUN npm install -g bun
RUN bun install --frozen-lockfile

# Copy source code and build
COPY . .
RUN bun nx build landing --prod

# Production stage with nginx
FROM docker.io/nginx:alpine

# Copy built app to nginx html directory
COPY --from=build /app/dist/apps/landing/browser /usr/share/nginx/html

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
