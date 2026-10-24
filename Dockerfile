# Fly.io builds this image on its own builders, so Docker isn't needed locally.
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

# better-sqlite3 ships prebuilt binaries for this platform; the build tools are
# only a fallback in case a prebuilt one isn't available, then removed again.
COPY package.json package-lock.json ./
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && npm ci --omit=dev \
  && apt-get purge -y python3 make g++ \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

COPY . .

EXPOSE 8080
CMD ["sh", "scripts/start-fly.sh"]
