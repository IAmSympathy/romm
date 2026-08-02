#!/usr/bin/env python3
import json
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

# In-memory storage for active arcade cabinets
# Key: rom_id (str), Value: dict of room details
ACTIVE_CABINETS = {}
HEARTBEAT_TIMEOUT_SECONDS = 15

class ArcadeHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def _cleanup_stale(self):
        now = time.time()
        stale_keys = [k for k, v in ACTIVE_CABINETS.items() if now - v.get('last_heartbeat', 0) > HEARTBEAT_TIMEOUT_SECONDS]
        for k in stale_keys:
            print(f"[ARCADE SERVER] Cleaned up stale cabinet session for ROM {k}")
            del ACTIVE_CABINETS[k]

    def do_GET(self):
        self._cleanup_stale()
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        if parsed.path == '/api/arcade/status':
            rom_id = query.get('rom_id', [''])[0]
            if rom_id and rom_id in ACTIVE_CABINETS:
                cab = ACTIVE_CABINETS[rom_id]
                resp = {
                    'is_active': True,
                    'rom_id': cab.get('rom_id'),
                    'rom_name': cab.get('rom_name'),
                    'host_username': cab.get('host_username'),
                    'room_id': cab.get('room_id'),
                    'players_count': cab.get('players_count', 1),
                    'max_players': cab.get('max_players', 4),
                    'is_full': cab.get('players_count', 1) >= cab.get('max_players', 4)
                }
            else:
                resp = {'is_active': False}
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(resp).encode('utf-8'))
            return

        if parsed.path == '/api/arcade/list':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(ACTIVE_CABINETS).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        self._cleanup_stale()
        parsed = urlparse(self.path)
        length = int(self.headers.get('Content-Length', 0))
        body_str = self.rfile.read(length).decode('utf-8') if length > 0 else '{}'
        try:
            data = json.loads(body_str)
        except Exception:
            data = {}

        rom_id = str(data.get('rom_id', ''))

        if parsed.path == '/api/arcade/host':
            if rom_id:
                ACTIVE_CABINETS[rom_id] = {
                    'rom_id': rom_id,
                    'rom_name': data.get('rom_name', 'Arcade Game'),
                    'host_username': data.get('host_username', 'Joueur 1'),
                    'room_id': data.get('room_id', ''),
                    'players_count': 1,
                    'max_players': 4,
                    'last_heartbeat': time.time(),
                    'players': [data.get('host_username', 'Joueur 1')]
                }
                print(f"[ARCADE SERVER] Host session created for ROM {rom_id} by {data.get('host_username')}")
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok'}).encode('utf-8'))
            return

        if parsed.path == '/api/arcade/join':
            if rom_id and rom_id in ACTIVE_CABINETS:
                cab = ACTIVE_CABINETS[rom_id]
                username = data.get('username', 'Joueur')
                if username not in cab['players']:
                    cab['players'].append(username)
                cab['players_count'] = len(cab['players'])
                cab['last_heartbeat'] = time.time()
                print(f"[ARCADE SERVER] User {username} joined ROM {rom_id} ({cab['players_count']}/4)")
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok'}).encode('utf-8'))
            return

        if parsed.path == '/api/arcade/heartbeat':
            if rom_id and rom_id in ACTIVE_CABINETS:
                ACTIVE_CABINETS[rom_id]['last_heartbeat'] = time.time()
                if 'players_count' in data:
                    ACTIVE_CABINETS[rom_id]['players_count'] = data['players_count']
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok'}).encode('utf-8'))
            return

        if parsed.path == '/api/arcade/exit':
            if rom_id and rom_id in ACTIVE_CABINETS:
                username = data.get('username', '')
                cab = ACTIVE_CABINETS[rom_id]
                if username and username in cab['players']:
                    cab['players'].remove(username)
                
                # If host leaves or no players remain, remove cabinet session
                if username == cab['host_username'] or len(cab['players']) == 0:
                    del ACTIVE_CABINETS[rom_id]
                    print(f"[ARCADE SERVER] Host left or cabinet empty for ROM {rom_id}. Cabinet closed.")
                else:
                    cab['players_count'] = len(cab['players'])

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok'}).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

def run(port=8088):
    server_address = ('0.0.0.0', port)
    httpd = HTTPServer(server_address, ArcadeHandler)
    print(f"[ARCADE SERVER] Real-time Virtual Arcade Cabinet Server running on port {port}...")
    httpd.serve_forever()

if __name__ == '__main__':
    run()
