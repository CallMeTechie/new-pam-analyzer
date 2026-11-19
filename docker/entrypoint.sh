#!/bin/sh
# Prepares the data directory and starts the server without root rights.
#
# Started as root (the default): creates DATA_DIR, makes it writable for the
# unprivileged user "node" (uid 1000) - also on bind mounts of a NAS that
# belong to another user - and then runs the server as "node".
# Started as another user (e.g. "user:" in docker-compose): runs directly.
set -e

DATA="${DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA"
  if ! setpriv --reuid=node --regid=node --init-groups test -w "$DATA"; then
    echo "Making $DATA writable for the server (uid 1000)..."
    chown -R node:node "$DATA" 2>/dev/null || true
    chmod u+rwx "$DATA" 2>/dev/null || true
  fi
  if ! setpriv --reuid=node --regid=node --init-groups test -w "$DATA"; then
    echo "ERROR: $DATA is not writable and its owner could not be changed." >&2
    echo "Give uid 1000 (or 'Everyone') read and write access to the folder mounted at $DATA." >&2
    exit 1
  fi
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
