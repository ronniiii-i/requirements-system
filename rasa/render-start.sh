#!/usr/bin/env bash

echo "Starting on port: $PORT"

rasa run actions --port 5055 &

sleep 10

rasa run --enable-api --cors "*" --port 5005 &

# CORS proxy that sits in front of Rasa on $PORT
python3 cors_proxy.py $PORT 5005