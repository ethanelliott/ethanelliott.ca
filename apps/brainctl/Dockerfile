FROM oven/bun:alpine

ENV HOST=0.0.0.0
ENV PORT=3100

WORKDIR /app

RUN apk add --no-cache python3 make g++ libc6-compat

RUN addgroup --system brainctl && \
    adduser --system -G brainctl brainctl

COPY dist/apps/brainctl brainctl/

WORKDIR /app/brainctl
RUN bun install --production
WORKDIR /app

RUN chown -R brainctl:brainctl .

EXPOSE 3100

USER brainctl

CMD [ "bun", "run", "brainctl" ]
