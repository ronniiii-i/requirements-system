#!/usr/bin/env bash

# Start action server in background
rasa run actions --port 5055 &

# Wait for model to load before binding to port
sleep 10

# Start Rasa server
rasa run --enable-api --cors "*" --port $PORT