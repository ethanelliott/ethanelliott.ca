FROM docker.io/node:lts-alpine

ENV HOST=0.0.0.0
ENV PORT=3000
ENV CI=true

WORKDIR /app

RUN addgroup --system server && adduser --system -G server server

COPY --chown=server:server dist/apps/ip-monitor ./

RUN npm install --omit=dev

USER server

EXPOSE 3000

CMD ["node", "main.js"]
