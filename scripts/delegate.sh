#!/usr/bin/env bash
# delegate.sh — thin wrapper for delegating tasks to specialist agents
#
# Usage: delegate.sh <agent> <brief_file> <output_file> <timeout_sec> <project_dir> [model]
#
# Agents:
#   codex          — OpenAI Codex 5.3 (default model: gpt-5.3-codex)
#   opencode-pro   — Gemini 3 Pro via OpenCode (default model: google/antigravity-gemini-3-pro)
#   opencode-flash — Gemini 3 Flash via OpenCode (default model: google/antigravity-gemini-3-flash)
#
# Exit codes:
#   0   — success (non-empty output written)
#   1   — agent returned non-zero exit code
#   2   — bad arguments or missing dependencies
#   3   — agent succeeded but output is empty
#   124 — timeout exceeded

set -euo pipefail

# ── Argument validation ──────────────────────────────────────────────

if [[ $# -lt 5 ]]; then
    echo "Usage: delegate.sh <agent> <brief_file> <output_file> <timeout_sec> <project_dir> [model]" >&2
    exit 2
fi

AGENT="$1"
BRIEF_FILE="$2"
OUTPUT_FILE="$3"
TIMEOUT_SEC="$4"
PROJECT_DIR="$5"
MODEL="${6:-}"

if [[ ! -f "$BRIEF_FILE" ]]; then
    echo "Error: brief file not found: $BRIEF_FILE" >&2
    exit 2
fi

if [[ ! -d "$PROJECT_DIR" ]]; then
    echo "Error: project directory not found: $PROJECT_DIR" >&2
    exit 2
fi

if ! [[ "$TIMEOUT_SEC" =~ ^[0-9]+$ ]] || [[ "$TIMEOUT_SEC" -lt 1 ]]; then
    echo "Error: timeout must be a positive integer (got: $TIMEOUT_SEC)" >&2
    exit 2
fi

# ── Defaults per agent ───────────────────────────────────────────────

case "$AGENT" in
    codex)
        DEFAULT_MODEL="gpt-5.3-codex"
        AGENT_CMD="codex"
        ;;
    opencode-pro)
        DEFAULT_MODEL="google/antigravity-gemini-3-pro"
        AGENT_CMD="opencode"
        ;;
    opencode-flash)
        DEFAULT_MODEL="google/antigravity-gemini-3-flash"
        AGENT_CMD="opencode"
        ;;
    *)
        echo "Error: unknown agent '$AGENT'. Must be: codex, opencode-pro, opencode-flash" >&2
        exit 2
        ;;
esac

MODEL="${MODEL:-$DEFAULT_MODEL}"

# ── Dependency preflight ─────────────────────────────────────────────

if ! command -v "$AGENT_CMD" >/dev/null 2>&1; then
    echo "Error: '$AGENT_CMD' not found in PATH" >&2
    exit 2
fi

if ! command -v timeout >/dev/null 2>&1; then
    echo "Error: 'timeout' (GNU coreutils) not found in PATH" >&2
    exit 2
fi

# ── Prepare output directory and log file ────────────────────────────

OUTPUT_DIR="$(dirname "$OUTPUT_FILE")"
mkdir -p "$OUTPUT_DIR"

LOG_FILE="${OUTPUT_FILE%.*}.log"

# Remove stale output to prevent false-success from prior runs
rm -f "$OUTPUT_FILE"

# ── Execute with timeout ─────────────────────────────────────────────

echo "[delegate] agent=$AGENT model=$MODEL timeout=${TIMEOUT_SEC}s" | tee "$LOG_FILE"
echo "[delegate] brief=$BRIEF_FILE output=$OUTPUT_FILE" | tee -a "$LOG_FILE"
echo "[delegate] project=$PROJECT_DIR" | tee -a "$LOG_FILE"
echo "[delegate] started at $(date -Iseconds)" | tee -a "$LOG_FILE"

AGENT_EXIT=0

case "$AGENT" in
    codex)
        # codex exec: non-interactive mode with --full-auto permissions.
        # Sandbox may block file writes, so we use -o to capture the agent's
        # final response message to the output file. The brief must instruct
        # the agent to include the full deliverable in its response.
        # Brief is passed via stdin (-) to avoid Windows argv length limits.
        timeout --signal=TERM --kill-after=10 "$TIMEOUT_SEC" \
            codex exec \
                --full-auto \
                --ephemeral \
                -m "$MODEL" \
                -C "$PROJECT_DIR" \
                -o "$OUTPUT_FILE" \
                - < "$BRIEF_FILE" \
            >> "$LOG_FILE" 2>&1 || AGENT_EXIT=$?
        ;;
    opencode-pro|opencode-flash)
        # OpenCode agent writes the output file itself (instructed in the brief).
        # All stdout/stderr goes to the log for diagnostics.
        # Agent is told to read the brief file directly (has filesystem access),
        # avoiding Windows 32k command-line limit for large briefs.
        # --title prevents OpenCode titlecase crash on undefined prompt title.
        BRIEF_BASENAME="$(basename "$BRIEF_FILE" .md)"

        if [[ -n "${OPENCODE_SERVER_URL:-}" ]]; then
            echo "[delegate] opencode attaching to persistent server: $OPENCODE_SERVER_URL" | tee -a "$LOG_FILE"
            timeout --signal=TERM --kill-after=10 "$TIMEOUT_SEC" \
                opencode \
                    run \
                    --model "$MODEL" \
                    --dir "$PROJECT_DIR" \
                    --attach "$OPENCODE_SERVER_URL" \
                    --title "$BRIEF_BASENAME" \
                    "Read the task brief at $BRIEF_FILE and follow all instructions exactly. Write your output to the file path specified in the OUTPUT section of the brief." \
                >> "$LOG_FILE" 2>&1 || AGENT_EXIT=$?
        else
            echo "[delegate] opencode cold-start mode (OPENCODE_SERVER_URL not set)" | tee -a "$LOG_FILE"
            timeout --signal=TERM --kill-after=10 "$TIMEOUT_SEC" \
                opencode \
                    run \
                    --model "$MODEL" \
                    --dir "$PROJECT_DIR" \
                    --title "$BRIEF_BASENAME" \
                    "Read the task brief at $BRIEF_FILE and follow all instructions exactly. Write your output to the file path specified in the OUTPUT section of the brief." \
                >> "$LOG_FILE" 2>&1 || AGENT_EXIT=$?
        fi
        ;;
esac

echo "[delegate] finished at $(date -Iseconds) exit=$AGENT_EXIT" | tee -a "$LOG_FILE"

# ── Interpret exit code ──────────────────────────────────────────────

if [[ "$AGENT_EXIT" -eq 124 ]]; then
    echo "[delegate] TIMEOUT after ${TIMEOUT_SEC}s" | tee -a "$LOG_FILE"
    exit 124
fi

if [[ "$AGENT_EXIT" -ne 0 ]]; then
    echo "[delegate] AGENT ERROR (exit $AGENT_EXIT)" | tee -a "$LOG_FILE"
    echo "[delegate] last 5 lines of log:" >&2
    tail -n 5 "$LOG_FILE" >&2
    exit 1
fi

# ── Verify output ────────────────────────────────────────────────────

if [[ ! -s "$OUTPUT_FILE" ]]; then
    echo "[delegate] EMPTY OUTPUT — agent exited 0 but wrote nothing" | tee -a "$LOG_FILE"
    echo "[delegate] last 5 lines of log:" >&2
    tail -n 5 "$LOG_FILE" >&2
    exit 3
fi

LINES="$(wc -l < "$OUTPUT_FILE")"
echo "[delegate] SUCCESS — $LINES lines written to $OUTPUT_FILE" | tee -a "$LOG_FILE"
exit 0
