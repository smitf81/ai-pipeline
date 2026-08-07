from datetime import datetime, timezone
from html import unescape
from http.server import BaseHTTPRequestHandler, HTTPServer
from json import dumps
from urllib.error import URLError
from urllib.parse import parse_qs, quote_plus, unquote, urlparse
from urllib.request import Request, urlopen
import re

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 5052
DEFAULT_TIMEOUT = 6
SEARCH_ENDPOINT = "https://html.duckduckgo.com/html/"
USER_AGENT = "Mozilla/5.0 (QA Research MCP; +https://example.invalid)"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def normalize_text(value=""):
    return re.sub(r"\s+", " ", unescape(str(value or "").strip())).strip()


def strip_html(html_text=""):
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", str(html_text or ""))
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    return normalize_text(text)


def summarize_text(text="", limit=700):
    cleaned = normalize_text(text)
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[:limit].rstrip()}..."


def recommendation_for(topic="", body=""):
    haystack = f"{topic} {body}".lower()
    if "timeout" in haystack or "timed out" in haystack:
        return "Add explicit timeout-path assertions, retry checks, and a latency budget."
    if "flaky" in haystack or "intermittent" in haystack:
        return "Add a stability check, repeat-run coverage, and a deterministic fixture."
    if "status" in haystack or "http" in haystack:
        return "Assert both transport status and response body shape, not just the happy path."
    return "Compare the current test against the reference and add the missing assertions."


def likely_causes_for(topic="", body=""):
    haystack = f"{topic} {body}".lower()
    causes = []
    if "timeout" in haystack or "timed out" in haystack:
        causes.extend([
            "slow or unreachable dependency",
            "missing retry/backoff path",
            "timeout budget too short for the observed environment",
        ])
    if "flaky" in haystack or "intermittent" in haystack:
        causes.extend([
            "race condition in the test path",
            "unstable fixture or external dependency",
        ])
    if "status" in haystack or "http" in haystack:
        causes.extend([
            "status code and body contract drift",
            "response validation is too shallow",
        ])
    return list(dict.fromkeys(causes)) or [
        "reference method may be missing a stronger assertion",
    ]


def suggested_extra_checks(topic="", body=""):
    haystack = f"{topic} {body}".lower()
    checks = []
    if "timeout" in haystack or "timed out" in haystack:
        checks.extend([
            "assert the timeout error path explicitly",
            "measure and record request latency",
            "verify retry or fallback behavior if the tool supports it",
        ])
    if "flaky" in haystack or "intermittent" in haystack:
        checks.extend([
            "run the check more than once with the same fixture",
            "confirm the result is stable across repeat hits",
        ])
    if "status" in haystack or "http" in haystack:
        checks.extend([
            "assert the HTTP status code",
            "assert the response payload fields and types",
        ])
    if not checks:
        checks.append("add one concrete assertion that was not already covered")
    return list(dict.fromkeys(checks))


def suggested_scorecard_additions(topic="", body=""):
    haystack = f"{topic} {body}".lower()
    additions = []
    if "timeout" in haystack or "timed out" in haystack:
        additions.extend([
            "timeout budget",
            "retry coverage",
            "dependency reachability",
        ])
    if "flaky" in haystack or "intermittent" in haystack:
        additions.extend([
            "stability under repeat hits",
            "fixture determinism",
        ])
    if "status" in haystack or "http" in haystack:
        additions.extend([
            "transport contract",
            "payload schema",
        ])
    return list(dict.fromkeys(additions)) or [
        "reference alignment",
    ]


def build_research_payload(*, tool, query=None, source_url=None, title=None, summary="", body="", ok=True, error=None, sources=None):
    topic = normalize_text(query or title or source_url or tool)
    cleaned_summary = summarize_text(summary or body or "")
    payload = {
        "ok": ok,
        "tool": tool,
        "query": normalize_text(query) or None,
        "source_url": normalize_text(source_url) or None,
        "timestamp": now_iso(),
        "summary": cleaned_summary,
        "recommendation": recommendation_for(topic, cleaned_summary or body),
        "likely_causes": likely_causes_for(topic, cleaned_summary or body),
        "suggested_extra_checks": suggested_extra_checks(topic, cleaned_summary or body),
        "suggested_scorecard_additions": suggested_scorecard_additions(topic, cleaned_summary or body),
        "sources": sources or [],
    }
    if title:
        payload["title"] = normalize_text(title)
    if error:
        payload["error"] = normalize_text(error)
    return payload


def decode_response_text(response):
    headers = getattr(response, "headers", None)
    charset = "utf-8"
    if headers and hasattr(headers, "get_content_charset"):
        charset = headers.get_content_charset() or "utf-8"
    return response.read().decode(charset, errors="replace")


def parse_duckduckgo_results(html_text):
    results = []
    for match in re.finditer(
        r'<a[^>]*class="result__a"[^>]*href="(?P<href>[^"]+)"[^>]*>(?P<title>.*?)</a>',
        html_text,
        flags=re.I | re.S,
    ):
        href = unescape(match.group("href"))
        title = strip_html(match.group("title"))
        block = html_text[match.end(): match.end() + 1800]
        snippet_match = re.search(r'class="result__snippet"[^>]*>(?P<snippet>.*?)<', block, flags=re.I | re.S)
        snippet = strip_html(snippet_match.group("snippet")) if snippet_match else ""
        parsed = urlparse(href)
        if parsed.netloc.endswith("duckduckgo.com") and parsed.path.startswith("/l/"):
            query = parse_qs(parsed.query)
            href = unquote(query.get("uddg", [href])[0])
        results.append({
            "title": title,
            "url": href,
            "snippet": snippet,
        })
    return results


def search_test_method(query, opener=urlopen):
    query = normalize_text(query)
    if not query:
        return build_research_payload(
            tool="search_test_method",
            query=query,
            ok=False,
            error="query is required",
        )

    search_url = f"{SEARCH_ENDPOINT}?q={quote_plus(query)}"
    request = Request(search_url, headers={"User-Agent": USER_AGENT})
    try:
        with opener(request, timeout=DEFAULT_TIMEOUT) as response:
            html_text = decode_response_text(response)
    except Exception as error:
        return build_research_payload(
            tool="search_test_method",
            query=query,
            ok=False,
            error=str(error),
        )

    results = parse_duckduckgo_results(html_text)
    if not results:
        return build_research_payload(
            tool="search_test_method",
            query=query,
            ok=False,
            error="no search results found",
        )

    first = results[0]
    return build_research_payload(
        tool="search_test_method",
        query=query,
        source_url=first["url"],
        title=first["title"],
        summary=first["snippet"] or first["title"],
        sources=results[:3],
    )


def fetch_reference(source_url, opener=urlopen):
    source_url = normalize_text(source_url)
    if not source_url:
        return build_research_payload(
            tool="fetch_reference",
            source_url=source_url,
            ok=False,
            error="url is required",
        )

    request = Request(source_url, headers={"User-Agent": USER_AGENT})
    try:
        with opener(request, timeout=DEFAULT_TIMEOUT) as response:
            html_text = decode_response_text(response)
    except Exception as error:
        return build_research_payload(
            tool="fetch_reference",
            source_url=source_url,
            ok=False,
            error=str(error),
        )

    title_match = re.search(r"<title>(.*?)</title>", html_text, flags=re.I | re.S)
    title = strip_html(title_match.group(1)) if title_match else source_url
    plain_text = strip_html(html_text)
    excerpt = summarize_text(plain_text, limit=900)
    return build_research_payload(
        tool="fetch_reference",
        source_url=source_url,
        title=title,
        summary=excerpt,
        sources=[{
            "url": source_url,
            "title": title,
            "snippet": excerpt[:240],
        }],
    )


def compare_current_test_to_reference(test_name, current_method, reference_text):
    combined = f"{normalize_text(test_name)} {normalize_text(current_method)} {normalize_text(reference_text)}".lower()
    missing = []
    if "timeout" in combined and "timeout" not in normalize_text(current_method).lower():
        missing.append("timeout coverage")
    if ("retry" in combined or "backoff" in combined) and "retry" not in normalize_text(current_method).lower():
        missing.append("retry coverage")
    if ("status" in combined or "http" in combined) and "status" not in normalize_text(current_method).lower():
        missing.append("transport status assertion")
    if not missing:
        missing.append("reference alignment review")
    return {
        "test_name": normalize_text(test_name) or None,
        "missing_checks": missing,
        "recommendation": "Add the missing checks before scoring the test as healthy.",
    }


def research_note(query, source_url=None, current_method="", opener=urlopen):
    query = normalize_text(query)
    source_url = normalize_text(source_url)
    if source_url:
        fetched = fetch_reference(source_url, opener=opener)
        if not fetched.get("ok"):
            return {
                **fetched,
                "tool": "research_note",
                "query": query or None,
                "source_url": source_url or None,
            }
        comparison = compare_current_test_to_reference(query, current_method, fetched.get("summary", ""))
        payload = build_research_payload(
            tool="research_note",
            query=query,
            source_url=source_url,
            title=fetched.get("title"),
            summary=fetched.get("summary", ""),
            body=current_method,
            sources=fetched.get("sources", []),
        )
        payload["comparison"] = comparison
        payload["recommendation"] = comparison["recommendation"]
        return payload

    searched = search_test_method(query, opener=opener)
    if not searched.get("ok") or not searched.get("source_url"):
        return {
            **searched,
            "tool": "research_note",
        }

    fetched = fetch_reference(searched["source_url"], opener=opener)
    if not fetched.get("ok"):
        return {
            **fetched,
            "tool": "research_note",
            "query": query or None,
            "source_url": searched.get("source_url"),
            "sources": searched.get("sources", []),
        }

    comparison = compare_current_test_to_reference(query, current_method, fetched.get("summary", ""))
    payload = build_research_payload(
        tool="research_note",
        query=query,
        source_url=searched.get("source_url"),
        title=fetched.get("title") or searched.get("title"),
        summary=fetched.get("summary", ""),
        body=current_method,
        sources=[
            *(searched.get("sources", []) or []),
            *(fetched.get("sources", []) or []),
        ],
    )
    payload["comparison"] = comparison
    payload["recommendation"] = comparison["recommendation"]
    return payload


class QAResearchHandler(BaseHTTPRequestHandler):
    def _send_json(self, payload, status=200):
        body = dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        if parsed.path == "/search_test_method":
            payload = search_test_method(params.get("query", [""])[0])
            self._send_json(payload, status=200 if payload.get("ok") else 400)
            return

        if parsed.path == "/fetch_reference":
            payload = fetch_reference(params.get("url", [""])[0])
            self._send_json(payload, status=200 if payload.get("ok") else 400)
            return

        if parsed.path == "/research_note":
            payload = research_note(
                params.get("query", [""])[0],
                source_url=params.get("url", [""])[0],
                current_method=params.get("current_method", [""])[0],
            )
            self._send_json(payload, status=200 if payload.get("ok") else 400)
            return

        self._send_json({"error": "not found"}, status=404)

    def log_message(self, format, *args):
        return


def main():
    server = HTTPServer((DEFAULT_HOST, DEFAULT_PORT), QAResearchHandler)
    print(f"QA research MCP listening on http://{DEFAULT_HOST}:{DEFAULT_PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
