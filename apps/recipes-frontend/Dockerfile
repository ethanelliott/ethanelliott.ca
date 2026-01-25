# Production build using pre-built Angular app from CI
FROM docker.io/nginx:alpine

# Copy pre-built app to nginx html directory
COPY dist/apps/recipes-frontend/browser /usr/share/nginx/html

# Copy nginx configuration if needed
COPY apps/recipes-frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
