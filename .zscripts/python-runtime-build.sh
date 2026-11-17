#!/bin/bash

# python-runtime-build.sh
#
# Assembles the Python portion of a deployment build artifact. Given a project
# directory, it copies the project's Python sources into the service dist
# directory and materializes a pinned requirements file for the runtime.
#
# Supported project layouts:
#   1. requirements.txt  - copy sources (excluding .venv) into next-service-dist
#                          and copy requirements.txt into python-runtime/
#   2. pyproject.toml    - copy sources into next-service-dist and derive
#                          python-runtime/requirements.txt from [project].dependencies
#   3. neither           - no Python runtime is produced
#
# Environment variables:
#   PROJECT_DIR   Source project root (default: current working directory)
#   BUILD_DIR     Destination build root (required)
#
# Build layout:
#   $BUILD_DIR/next-service-dist/    Deployable Python sources
#   $BUILD_DIR/python-runtime/requirements.txt

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
BUILD_DIR="${BUILD_DIR:?BUILD_DIR is required}"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "PROJECT_DIR does not exist: $PROJECT_DIR" >&2
    exit 1
fi

DIST_DIR="$BUILD_DIR/next-service-dist"
RUNTIME_DIR="$BUILD_DIR/python-runtime"

has_python=0

copy_sources() {
    # Copy the project tree into the dist directory, excluding the local
    # virtualenv and any nested runtime directories.
    mkdir -p "$DIST_DIR"
    find "$PROJECT_DIR" -mindepth 1 -maxdepth 1 \
        ! -name '.venv' \
        ! -name 'python-runtime' \
        -exec cp -rp {} "$DIST_DIR/" \;
}

# 1. requirements.txt layout
if [ -f "$PROJECT_DIR/requirements.txt" ]; then
    has_python=1
    copy_sources
    mkdir -p "$RUNTIME_DIR"
    cp -p "$PROJECT_DIR/requirements.txt" "$RUNTIME_DIR/requirements.txt"
fi

# 2. pyproject.toml layout
if [ -f "$PROJECT_DIR/pyproject.toml" ]; then
    has_python=1
    copy_sources
    # The pyproject manifest itself is a build-time concern, not a deployable.
    rm -f "$DIST_DIR/pyproject.toml"
    mkdir -p "$RUNTIME_DIR"

    # Derive a pinned requirements file from [project].dependencies.
    # Handles both inline (`dependencies = ["a", "b"]`) and multi-line arrays.
    awk '
        /^\[project\]/          { in_project = 1; next }
        /^\[/                   { in_project = 0; in_deps = 0 }
        in_project && /^[[:space:]]*dependencies[[:space:]]*=/ {
            in_deps = 1; next
        }
        in_project && in_deps && /^[[:space:]]*\]/ { in_deps = 0; next }
        in_project && in_deps {
            line = $0
            while (match(line, /"[^"]*"/)) {
                dep = substr(line, RSTART + 1, RLENGTH - 2)
                if (dep != "") print dep
                line = substr(line, RSTART + RLENGTH)
            }
        }
    ' "$PROJECT_DIR/pyproject.toml" > "$RUNTIME_DIR/requirements.txt"
fi

if [ "$has_python" -eq 0 ]; then
    # No Python project detected: leave the build without a python runtime.
    exit 0
fi

echo "python runtime build complete: $DIST_DIR"