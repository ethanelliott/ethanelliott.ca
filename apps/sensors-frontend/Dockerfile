FROM docker.io/nginx:alpine

COPY dist/apps/sensors-frontend/browser /usr/share/nginx/html
COPY apps/sensors-frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
