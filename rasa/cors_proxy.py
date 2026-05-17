import sys
import http.server
import urllib.request
import urllib.error

PORT = int(sys.argv[1])
RASA_PORT = int(sys.argv[2])

class CORSProxy(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_POST(self):
        self._proxy()

    def do_GET(self):
        self._proxy()

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _proxy(self):
        url = f"http://localhost:{RASA_PORT}{self.path}"
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else None
        try:
            req = urllib.request.Request(url, data=body, method=self.command)
            req.add_header("Content-Type", self.headers.get("Content-Type", "application/json"))
            with urllib.request.urlopen(req) as resp:
                self.send_response(resp.status)
                self._send_cors_headers()
                self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                self.end_headers()
                self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(e.read())

    def log_message(self, format, *args):
        pass

with http.server.HTTPServer(("", PORT), CORSProxy) as httpd:
    print(f"CORS proxy running on port {PORT}, forwarding to {RASA_PORT}")
    httpd.serve_forever()