FROM oven/bun:alpine

WORKDIR /app

# Install dependencies for cycleTLS on Alpine
RUN apk add --no-cache \
    libc6-compat \
    libstdc++ \
    ca-certificates

COPY package.json tsconfig.json bun.lock .eslintrc.json /app/

RUN bun install

COPY src/ /app/src
# COPY scripts/ /app/scripts

CMD ["bun", "/src/index.ts"]
