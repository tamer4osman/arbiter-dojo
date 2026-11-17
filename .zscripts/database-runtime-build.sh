#!/bin/bash

# database-runtime-build.sh
#
# Copies a project's SQLite database into a deployment build directory and runs
# `bun run db:push` against it. Designed for preview/serverless deployments where
# the build artifact must contain a working database rather than the source tree.
#
# Environment variables:
#   PROJECT_DIR   Source project root (default: current working directory)
#   BUILD_DIR     Destination build root (required)
#
# The build layout is: $BUILD_DIR/db/<db-name>.db

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
BUILD_DIR="${BUILD_DIR:?BUILD_DIR is required}"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "PROJECT_DIR does not exist: $PROJECT_DIR" >&2
    exit 1
fi

mkdir -p "$BUILD_DIR"

# Locate the project's database file. The database is identified by the
# DATABASE_URL used by Prisma (a `file:` SQLite URL). We look for the Prisma
# schema first to determine the database path, then fall back to a conventional
# location next to the schema.
SCHEMA_PATH=""
if [ -f "$PROJECT_DIR/prisma/schema.prisma" ]; then
    SCHEMA_PATH="$PROJECT_DIR/prisma/schema.prisma"
fi

DB_PATH=""
if [ -n "$SCHEMA_PATH" ] && [ -f "$SCHEMA_PATH" ]; then
    # Extract the url from the datasource block, if present.
    URL_LINE="$(grep -E '^\s*url\s*=' "$SCHEMA_PATH" 2>/dev/null | head -n1 || true)"
    if [ -n "$URL_LINE" ]; then
        URL_VALUE="${URL_LINE#*=}"
        URL_VALUE="${URL_VALUE//\"/}"
        URL_VALUE="${URL_VALUE//\'/}"
        URL_VALUE="$(echo "$URL_VALUE" | xargs)"
        case "$URL_VALUE" in
            file:*) DB_PATH="${URL_VALUE#file:}" ;;
            *) DB_PATH="$URL_VALUE" ;;
        esac
    fi
fi

# Fall back to the conventional location: <project>/db/custom.db
if [ -z "$DB_PATH" ]; then
    if [ -f "$PROJECT_DIR/db/custom.db" ]; then
        DB_PATH="$PROJECT_DIR/db/custom.db"
    fi
fi

# Build the deployment database directory.
BUILD_DB_DIR="$BUILD_DIR/db"
mkdir -p "$BUILD_DB_DIR"

if [ -n "$DB_PATH" ] && [ -f "$DB_PATH" ]; then
    DB_NAME="$(basename "$DB_PATH")"
    BUILD_DB_PATH="$BUILD_DB_DIR/$DB_NAME"

    # Preserve the database and any sidecar files in the same directory.
    cp -p "$DB_PATH" "$BUILD_DB_PATH"

    # Copy sidecar files (e.g. README.txt) alongside the database.
    DB_DIR="$(dirname "$DB_PATH")"
    if [ -d "$DB_DIR" ]; then
        find "$DB_DIR" -maxdepth 1 -type f ! -name "$(basename "$DB_PATH")" -exec cp -p {} "$BUILD_DB_DIR/" \;
    fi
else
    # No source database: point db:push at a fresh file in the build artifact.
    # The schema sync step will initialize it.
    BUILD_DB_PATH="$BUILD_DB_DIR/custom.db"
fi

# Run schema synchronization against the build database so the artifact is
# ready to serve without further migration.
DATABASE_URL="file:$BUILD_DB_PATH" \
    bun run db:push

echo "database runtime build complete: $BUILD_DB_PATH"