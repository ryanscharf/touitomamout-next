#!/bin/sh
set -e

echo "Checking for updates..."
cd /tmp
rm -rf touitomamout-next

# Clone and check if there are updates
git clone https://github.com/yamada-sexta/touitomamout-next.git
cd touitomamout-next
LATEST_COMMIT=$(git rev-parse HEAD)

# Store current commit (if exists)
CURRENT_COMMIT=""
if [ -f /var/lib/touitomamout/commit.txt ]; then
  CURRENT_COMMIT=$(cat /var/lib/touitomamout/commit.txt)
fi

if [ "$LATEST_COMMIT" != "$CURRENT_COMMIT" ]; then
  echo "New version found! Updating..."
  echo "$LATEST_COMMIT" > /var/lib/touitomamout/commit.txt
  
  # Pull latest image and restart the main container
  docker-compose -f /docker-compose.yml pull touitomamout
  docker-compose -f /docker-compose.yml up -d touitomamout
  
  echo "Update completed at $(date)"
else
  echo "Already up to date"
fi