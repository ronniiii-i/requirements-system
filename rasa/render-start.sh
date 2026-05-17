#!/usr/bin/env bash

# 1. Start the Action Server in the background
rasa run actions --port 5055 &

# 2. Start the Rasa Open Source server
rasa run --enable-api --cors "*" --port $PORT
