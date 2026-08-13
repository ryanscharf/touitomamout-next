#!/bin/sh
set -e

echo "0 2 * * * /update.sh" | crontab -

crond -f -l 2 &
CROND_PID=$!

trap 'kill -TERM "$CROND_PID" 2>/dev/null; wait "$CROND_PID"' TERM INT

wait "$CROND_PID"
