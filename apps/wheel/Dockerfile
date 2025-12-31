# Production build using pre-built Angular app from CI
FROM docker.io/nginx:alpine

# Copy pre-built app to nginx html directory
COPY dist/apps/wheel/browser /usr/share/nginx/html

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
