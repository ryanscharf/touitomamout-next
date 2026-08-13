#!/bin/sh
set -e

TARGET_CONTAINER="${ALERT_TARGET_CONTAINER:-touitomamout}"
LOG_WINDOW="${ALERT_LOG_WINDOW:-20m}"
COOLDOWN_HOURS="${ALERT_COOLDOWN_HOURS:-24}"
SMTP_PORT="${SMTP_PORT:-587}"

STATE_DIR=/var/lib/touitomamout-alert
STATE_FILE="$STATE_DIR/last-alert.txt"
mkdir -p "$STATE_DIR"

echo "Checking $TARGET_CONTAINER logs for stale X auth..."

if ! docker logs --since "$LOG_WINDOW" "$TARGET_CONTAINER" 2>&1 | grep -q "Unable to authenticate with X"; then
  echo "No auth failures found in the last $LOG_WINDOW"
  exit 0
fi

echo "Auth failure detected"

NOW=$(date +%s)
COOLDOWN_SECONDS=$((COOLDOWN_HOURS * 3600))

if [ -f "$STATE_FILE" ]; then
  LAST_ALERT=$(cat "$STATE_FILE")
  ELAPSED=$((NOW - LAST_ALERT))
  if [ "$ELAPSED" -lt "$COOLDOWN_SECONDS" ]; then
    echo "Already alerted $((ELAPSED / 3600))h ago, within ${COOLDOWN_HOURS}h cooldown, skipping"
    exit 0
  fi
fi

cat >/root/.msmtprc <<EOF
defaults
auth on
tls on
tls_starttls on
logfile /dev/stdout

account default
host $SMTP_HOST
port $SMTP_PORT
user $SMTP_USER
password $SMTP_PASS
from $ALERT_EMAIL_FROM
EOF
chmod 600 /root/.msmtprc

echo "Sending alert email to $ALERT_EMAIL_TO..."
printf "To: %s\nFrom: %s\nSubject: touitomamout: X cookie is stale\n\nThe X/Twitter session used by touitomamout has stopped authenticating. Export a fresh Cookie header into TWITTER_COOKIES and restart the touitomamout container.\n" \
  "$ALERT_EMAIL_TO" "$ALERT_EMAIL_FROM" | msmtp -a default "$ALERT_EMAIL_TO"

echo "$NOW" >"$STATE_FILE"
echo "Alert sent and cooldown recorded"
