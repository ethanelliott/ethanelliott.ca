# Production build using the pre-built Angular app from CI
FROM docker.io/nginx:alpine

# Copy pre-built app to nginx html directory
COPY dist/apps/splitwise-frontend/browser /usr/share/nginx/html

# Copy nginx configuration
COPY apps/splitwise-frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
