from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
import json

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def do_GET(self):
        if self.path == "/run_test":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()

            response = {
                "test_id": "qa_mcp_helper_ping",
                "status": "pass",
                "details": "qa_mcp_helper.py is reachable.",
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "source": "external_mcp",
            }

            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_response(404)
            self.end_headers()

server = HTTPServer(("127.0.0.1", 5051), Handler)
print("QA MCP helper running on http://127.0.0.1:5051")
server.serve_forever()
