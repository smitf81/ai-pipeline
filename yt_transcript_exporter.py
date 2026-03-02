import argparse
import os
import re
import sys
from pathlib import Path
from typing import List, Optional, Tuple

from youtube_transcript_api import (
    YouTubeTranscriptApi,
    TranscriptsDisabled,
    NoTranscriptFound,
    TooManyRequests,
)
from pytube import YouTube


TRANSCRIPTS_DIR = Path("transcripts")


class TranscriptError(Exception):
    pass


def extract_video_metadata(url: str) -> Tuple[str, str]:
    try:
        yt = YouTube(url)
    except Exception as exc:  # pragma: no cover - defensive
        raise TranscriptError(f"Failed to load video metadata from URL: {exc}") from exc

    video_id = yt.video_id
    if not video_id:
        raise TranscriptError("Could not determine video ID from the provided URL.")

    title = yt.title or "untitled_video"
    return video_id, title


def choose_transcript(video_id: str):
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
    except TranscriptsDisabled as exc:
        raise TranscriptError("Transcripts are disabled for this video.") from exc
    except NoTranscriptFound as exc:
        raise TranscriptError("No transcripts are available for this video.") from exc
    except TooManyRequests as exc:
        raise TranscriptError("Rate-limited by YouTube while fetching transcripts. Please try again later.") from exc
    except Exception as exc:  # pragma: no cover - defensive
        raise TranscriptError(f"Failed to fetch transcript list: {exc}") from exc

    # Prefer manually created English transcripts
    for lang_code in ("en", "en-US", "en-GB"):
        try:
            t = transcript_list.find_manually_created_transcript([lang_code])
            return t
        except Exception:
            continue

    # Then auto-generated English
    for lang_code in ("en", "en-US", "en-GB"):
        try:
            t = transcript_list.find_generated_transcript([lang_code])
            return t
        except Exception:
            continue

    # Fallback to the first available transcript
    try:
        return next(iter(transcript_list))
    except StopIteration as exc:
        raise TranscriptError("No transcripts are available for this video.") from exc


def format_timestamp(seconds: float) -> str:
    total_seconds = int(seconds)
    h, rem = divmod(total_seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def build_paragraphs(
    entries: List[dict],
) -> List[Tuple[float, str]]:
    paragraphs: List[Tuple[float, str]] = []
    current_start: Optional[float] = None
    current_chunks: List[str] = []
    last_end: Optional[float] = None

    for entry in entries:
        text = entry.get("text", "").strip()
        if not text:
            continue

        start = float(entry.get("start", 0.0))
        duration = float(entry.get("duration", 0.0))
        end = start + duration

        gap = None
        if last_end is not None:
            gap = start - last_end

        # Decide if we should start a new paragraph:
        # - long silence gap
        # - or we already have some text and previous chunk ends a sentence and
        #   we've accumulated a fair amount of text
        current_text = " ".join(current_chunks)
        end_with_sentence = bool(re.search(r"[.!?][\"']?$", current_text))
        long_enough = len(current_text) >= 300

        if (
            current_chunks
            and (
                (gap is not None and gap > 3.0)
                or (end_with_sentence and long_enough)
            )
        ):
            cleaned = re.sub(r"\s+", " ", current_text).strip()
            if cleaned:
                paragraphs.append((current_start if current_start is not None else 0.0, cleaned))
            current_chunks = []
            current_start = None

        if not current_chunks:
            current_start = start

        current_chunks.append(text)
        last_end = end

    if current_chunks:
        cleaned = re.sub(r"\s+", " ", " ".join(current_chunks)).strip()
        if cleaned:
            paragraphs.append((current_start if current_start is not None else 0.0, cleaned))

    return paragraphs


def sanitize_filename(title: str) -> str:
    # Replace invalid Windows filename characters with underscores
    sanitized = re.sub(r'[<>:"/\\\\|?*]', "_", title)
    sanitized = re.sub(r"\s+", " ", sanitized).strip()
    # Avoid trailing dots and spaces which are invalid on Windows
    sanitized = sanitized.rstrip(" .")
    if not sanitized:
        sanitized = "untitled_video"
    # Limit length to avoid OS limits
    return sanitized[:150]


def write_markdown(
    output_path: Path,
    title: str,
    url: str,
    paragraphs: List[Tuple[float, str]],
    include_timestamps: bool,
) -> None:
    lines: List[str] = []
    lines.append(f"# {title}")
    lines.append(f"Source: {url}")
    lines.append("")
    lines.append("## Transcript")
    lines.append("")

    for start_time, text in paragraphs:
        if include_timestamps:
            ts = format_timestamp(start_time)
            lines.append(f"[{ts}] {text}")
        else:
            lines.append(text)
        lines.append("")

    content = "\n".join(lines).strip() + "\n"
    output_path.write_text(content, encoding="utf-8")


def write_summary_placeholder(base_path: Path) -> None:
    summary_path = base_path.with_name(base_path.stem + "_summary.txt")
    placeholder = (
        "LLM Summary Notes Placeholder\n"
        "=============================\n\n"
        "Use this file to store your own summary, key points,\n"
        "and follow-up questions about the video.\n"
    )
    summary_path.write_text(placeholder, encoding="utf-8")


def export_transcript(url: str, include_timestamps: bool, create_summary: bool) -> Path:
    video_id, title = extract_video_metadata(url)
    transcript = choose_transcript(video_id)

    try:
        entries = transcript.fetch()
    except Exception as exc:  # pragma: no cover - defensive
        raise TranscriptError(f"Failed to download transcript: {exc}") from exc

    if not entries:
        raise TranscriptError("Transcript appears to be empty.")

    paragraphs = build_paragraphs(entries)
    if not paragraphs:
        raise TranscriptError("Failed to build transcript paragraphs.")

    TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    safe_title = sanitize_filename(title)
    output_path = TRANSCRIPTS_DIR / f"{safe_title}.md"

    write_markdown(output_path, title, url, paragraphs, include_timestamps)

    if create_summary:
        write_summary_placeholder(output_path)

    return output_path


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="yt_transcript_exporter",
        description="Download a YouTube transcript and export it as clean Markdown.",
    )
    parser.add_argument(
        "url",
        help="YouTube video URL",
    )
    parser.add_argument(
        "--timestamps",
        action="store_true",
        help="Include timestamps at the start of each paragraph.",
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Also create a '<filename>_summary.txt' placeholder for LLM notes.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    url = args.url.strip()
    if not url:
        print("Error: YouTube URL is required.", file=sys.stderr)
        return 1

    try:
        output_path = export_transcript(url, include_timestamps=args.timestamps, create_summary=args.summary)
    except TranscriptError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.", file=sys.stderr)
        return 1
    except Exception as exc:  # pragma: no cover - defensive
        print(f"Unexpected error: {exc}", file=sys.stderr)
        return 1

    print(f"Transcript saved to: {output_path}")
    if args.summary:
        summary_path = output_path.with_name(output_path.stem + "_summary.txt")
        print(f"Summary placeholder saved to: {summary_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())

