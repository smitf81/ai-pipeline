# AI Pipeline

Control repo for local AI / agent-driven tooling.

## Apply a task patch safely

Use the runner to validate and apply a generated task patch:

`python runner/ai.py apply --project <key> --task 0001`

Dry-run mode (validation only):

`python runner/ai.py apply --project <key> --task 0001 --dry-run`

## `yt_transcript_exporter` – YouTube transcript to Markdown

This repository includes a small Python CLI tool, `yt_transcript_exporter.py`, which downloads a YouTube video transcript (when available) and saves it as a clean Markdown file suitable for LLMs.

### Installation

- Ensure you have Python 3.8+ installed.
- From this directory, install dependencies:

```bash
pip install -r requirements.txt
```

### Usage

Basic usage:

```bash
python yt_transcript_exporter.py <youtube_url>
```

Include timestamps at the start of each paragraph:

```bash
python yt_transcript_exporter.py <youtube_url> --timestamps
```

Also create a separate summary notes placeholder:

```bash
python yt_transcript_exporter.py <youtube_url> --summary
```

You can combine flags:

```bash
python yt_transcript_exporter.py <youtube_url> --timestamps --summary
```

### Output

- The transcript is written to `transcripts/<video_title_sanitised>.md`.
- The Markdown format is:

  - `# <Video Title>`
  - `Source: <YouTube URL>`
  - `## Transcript`
  - Well‑formed paragraphs containing the transcript (optionally prefixed with timestamps).

If `--summary` is used, a `<video_title_sanitised>_summary.txt` file is also created next to the transcript as a placeholder for your own LLM notes.

