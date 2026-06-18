#!/bin/sh
# Bootstrap entrypoint for the compose `ollama` service.
#
# 1. Start the ollama server in the background.
# 2. Wait for the API to come up.
# 3. Pull the configured embedding model if it isn't already cached.
# 4. Hand control back to the server process.
#
# Healthcheck (defined in docker-compose.yml) verifies the model is present
# in `ollama list`, so the service only reports healthy after the pull has
# finished.
set -eu

MODEL="${OLLAMA_EMBEDDING_MODEL:-nomic-embed-text}"

# Strip an explicit :tag if present to compare against `ollama list` output.
MODEL_PREFIX="${MODEL%%:*}"

echo "[opencg/ollama] starting ollama serve..."
/bin/ollama serve &
SERVER_PID=$!

# Poll the local API until it responds (ollama serve takes ~1-3s to come up).
i=0
until /bin/ollama list >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "[opencg/ollama] server did not become reachable after 60s"
    exit 1
  fi
  sleep 1
done

if /bin/ollama list | awk 'NR>1 {print $1}' | grep -q "^${MODEL_PREFIX}"; then
  echo "[opencg/ollama] model already present: ${MODEL}"
else
  echo "[opencg/ollama] pulling model: ${MODEL}"
  /bin/ollama pull "${MODEL}"
fi

echo "[opencg/ollama] ready"
wait "${SERVER_PID}"
