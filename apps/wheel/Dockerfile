# Multi-stage build for Angular app
FROM docker.io/node:lts-alpine as build

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm@9
RUN pnpm install --frozen-lockfile

# Copy source code and build
COPY . .
RUN pnpm nx build wheel --prod

# Production stage with nginx
FROM docker.io/nginx:alpine

# Copy built app to nginx html directory
COPY --from=build /app/dist/apps/wheel/browser /usr/share/nginx/html

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
