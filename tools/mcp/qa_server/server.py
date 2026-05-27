from http.server import BaseHTTPRequestHandler, HTTPServer
from json import dumps
from urllib.error import URLError
from urllib.request import urlopen
from datetime import datetime, timezone


class QATestHandler(BaseHTTPRequestHandler):
    def _send_json(self, payload, status=200):
        body = dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/run_test":
            self._send_json({"error": "not found"}, status=404)
            return

        result = {
            "test_id": "ollama_ping",
            "status": "fail",
            "details": "",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "external_mcp",
        }

        try:
            with urlopen("http://127.0.0.1:11434", timeout=3) as response:
                if response.status == 200:
                    result["status"] = "pass"
                    result["details"] = "Ollama reachable"
                else:
                    result["details"] = f"Unexpected status: {response.status}"
        except URLError as error:
            result["details"] = str(error)
        except Exception as error:
            result["details"] = str(error)

        self._send_json(result)

    def log_message(self, format, *args):
        return


def main():
    server = HTTPServer(("127.0.0.1", 5051), QATestHandler)
    print("QA probe listening on http://127.0.0.1:5051/run_test")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
