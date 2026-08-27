# Base: official WAHA image (already has Chromium + WhatsApp Web engine)
FROM devlikeapro/waha:latest AS waha

FROM node:20-slim

# --- Install WAHA's runtime deps + copy WAHA app from its image ---
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    supervisor \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=waha /app /waha-app

# --- Install bridge server ---
WORKDIR /bridge
COPY package.json .
RUN npm install --omit=dev
COPY server.js .

# --- Supervisor config: run both WAHA and the bridge in one container ---
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Persistent volume mount point for WhatsApp session data (see fly.toml)
VOLUME /waha-app/.sessions

EXPOSE 8080

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
