FROM docker.io/node:lts-alpine

ENV HOST=0.0.0.0
ENV PORT=3000
ENV CI=true

WORKDIR /app

COPY dist/apps/aranet ./

RUN npm install --omit=dev

# NOTE: runs as root on purpose. The process talks to the host's BlueZ daemon
# over the mounted system D-Bus socket, and the default BlueZ D-Bus policy only
# permits root (uid 0) to call org.bluez. The Deployment also sets
# runAsUser: 0 to make this explicit.

EXPOSE 3000

CMD ["node", "main.js"]
