from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json


class QaMcpThreadingHttpServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def do_GET(self):
        if self.path == "/run_test":
            response = {
                "test_id": "qa_mcp_helper_ping",
                "status": "pass",
                "details": "qa_mcp_helper.py is reachable.",
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "source": "external_mcp",
            }
            encoded = json.dumps(response).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(encoded)
        else:
            self.send_response(404)
            self.send_header("Connection", "close")
            self.end_headers()

server = QaMcpThreadingHttpServer(("127.0.0.1", 5051), Handler)
print("QA MCP helper running on http://127.0.0.1:5051")
server.serve_forever()
