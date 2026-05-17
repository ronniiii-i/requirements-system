#!/usr/bin/env bash

echo "Starting on port: $PORT"

rasa run actions --port 5055 &

rasa run --enable-api --cors "*" --port 5005 &

# Wait until Rasa is actually responding before starting the proxy
echo "Waiting for Rasa to be ready..."
until curl -s http://localhost:5005 > /dev/null 2>&1; do
  sleep 5
done

echo "Rasa is ready, starting proxy..."
python3 cors_proxy.py $PORT 5005