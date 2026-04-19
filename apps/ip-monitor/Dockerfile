FROM docker.io/node:lts-alpine

ENV HOST=0.0.0.0
ENV PORT=3000
ENV CI=true

WORKDIR /app

RUN apk add --no-cache python3 make g++ libc6-compat

RUN addgroup --system server && adduser --system -G server server

RUN mkdir -p /app/data && chown server:server /app/data

COPY --chown=server:server dist/apps/ip-monitor ./

RUN npm install --omit=dev

USER server

EXPOSE 3000

CMD ["node", "main.js"]
