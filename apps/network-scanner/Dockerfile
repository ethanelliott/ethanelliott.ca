FROM docker.io/node:lts-alpine

ENV HOST=0.0.0.0
ENV PORT=3000
ENV CI=true

WORKDIR /app

# nmap powers discovery (ARP/ping sweep) and the port-scan fingerprinting.
# iproute2 is handy for debugging the host network namespace we run in.
RUN apk add --no-cache nmap nmap-scripts iproute2

COPY dist/apps/network-scanner ./

RUN npm install --omit=dev

# NOTE: runs as root on purpose — raw-socket ARP/SYN scanning (nmap -sn / -sS)
# needs CAP_NET_RAW/CAP_NET_ADMIN, granted via the pod securityContext.
# The pod also runs with hostNetwork so it can see the LAN at layer 2.

EXPOSE 3000

CMD ["node", "main.js"]
