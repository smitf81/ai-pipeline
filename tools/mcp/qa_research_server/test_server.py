import json
import threading
import unittest
from http.server import HTTPServer
from types import SimpleNamespace
from urllib.request import urlopen

import server as qa_research


class FakeResponse:
    def __init__(self, body, url="https://example.com/"):
        self._body = body.encode("utf-8")
        self.headers = SimpleNamespace(get_content_charset=lambda default="utf-8": "utf-8")
        self.status = 200
        self.url = url

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def make_fake_opener(responses):
    def opener(request, timeout=0):
        target = request.full_url if hasattr(request, "full_url") else str(request)
        if target not in responses:
            raise AssertionError(f"unexpected request: {target}")
        return FakeResponse(responses[target], url=target)

    return opener


class QAResearchServerTests(unittest.TestCase):
    def test_search_and_fetch_helpers_return_structured_payloads(self):
        search_html = """
        <html>
          <body>
            <a rel="nofollow" class="result__a" href="https://docs.example.com/reference">
              Timeout testing guide
            </a>
            <div class="result__snippet">Use explicit timeout, retry, and latency assertions.</div>
          </body>
        </html>
        """
        fetch_html = """
        <html>
          <head><title>Timeout testing guide</title></head>
          <body>
            <p>Use explicit timeout assertions.</p>
            <p>Add retry coverage and a latency budget.</p>
          </body>
        </html>
        """
        opener = make_fake_opener({
            "https://html.duckduckgo.com/html/?q=external+probe+timeout": search_html,
            "https://docs.example.com/reference": fetch_html,
        })

        searched = qa_research.search_test_method("external probe timeout", opener=opener)
        self.assertTrue(searched["ok"])
        self.assertEqual(searched["tool"], "search_test_method")
        self.assertEqual(searched["source_url"], "https://docs.example.com/reference")
        self.assertIn("timeout", searched["summary"].lower())
        self.assertIn("timestamp", searched)

        fetched = qa_research.fetch_reference("https://docs.example.com/reference", opener=opener)
        self.assertTrue(fetched["ok"])
        self.assertEqual(fetched["tool"], "fetch_reference")
        self.assertEqual(fetched["source_url"], "https://docs.example.com/reference")
        self.assertIn("retry", fetched["summary"].lower())
        self.assertIn("recommendation", fetched)

    def test_research_note_is_structured_and_suggests_pressure(self):
        search_html = """
        <html>
          <body>
            <a rel="nofollow" class="result__a" href="https://docs.example.com/flaky">
              Flaky timeout reference
            </a>
            <div class="result__snippet">Checks for timeout, retry, and repeat stability.</div>
          </body>
        </html>
        """
        fetch_html = """
        <html>
          <head><title>Flaky timeout reference</title></head>
          <body>
            <p>Checks for timeout, retry, and repeat stability.</p>
          </body>
        </html>
        """
        opener = make_fake_opener({
            "https://html.duckduckgo.com/html/?q=external+probe+timeout": search_html,
            "https://docs.example.com/flaky": fetch_html,
        })

        note = qa_research.research_note("external probe timeout", current_method="current check only pings once", opener=opener)
        self.assertTrue(note["ok"])
        self.assertEqual(note["tool"], "research_note")
        self.assertEqual(note["source_url"], "https://docs.example.com/flaky")
        self.assertIn("likely_causes", note)
        self.assertIn("suggested_extra_checks", note)
        self.assertIn("suggested_scorecard_additions", note)
        self.assertIn("comparison", note)
        self.assertGreaterEqual(len(note["suggested_extra_checks"]), 1)

    def test_http_route_returns_json(self):
        original_search = qa_research.search_test_method
        original_fetch = qa_research.fetch_reference
        try:
            qa_research.search_test_method = lambda query, opener=None: {
                "ok": True,
                "tool": "search_test_method",
                "query": query,
                "source_url": "https://docs.example.com/route",
                "timestamp": qa_research.now_iso(),
                "summary": "Route summary",
                "recommendation": "Add timeout assertions.",
                "likely_causes": ["slow dependency"],
                "suggested_extra_checks": ["assert timeout"],
                "suggested_scorecard_additions": ["timeout budget"],
                "sources": [{"url": "https://docs.example.com/route", "title": "Route summary", "snippet": "Route summary"}],
                "ok": True,
            }
            qa_research.fetch_reference = lambda source_url, opener=None: {
                "ok": True,
                "tool": "fetch_reference",
                "source_url": source_url,
                "timestamp": qa_research.now_iso(),
                "summary": "Route summary text",
                "recommendation": "Add timeout assertions.",
                "likely_causes": ["slow dependency"],
                "suggested_extra_checks": ["assert timeout"],
                "suggested_scorecard_additions": ["timeout budget"],
                "sources": [{"url": source_url, "title": "Route summary", "snippet": "Route summary text"}],
            }

            httpd = HTTPServer((qa_research.DEFAULT_HOST, 0), qa_research.QAResearchHandler)
            port = httpd.server_address[1]
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            try:
                with urlopen(f"http://{qa_research.DEFAULT_HOST}:{port}/research_note?query=external+probe+timeout", timeout=5) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                self.assertTrue(payload["ok"])
                self.assertEqual(payload["tool"], "research_note")
                self.assertEqual(payload["source_url"], "https://docs.example.com/route")
                self.assertIn("checks", payload["recommendation"].lower())
            finally:
                httpd.shutdown()
                httpd.server_close()
        finally:
            qa_research.search_test_method = original_search
            qa_research.fetch_reference = original_fetch


if __name__ == "__main__":
    unittest.main()
