# -*- coding: utf-8 -*-
# 点赞功能的后端接口。只依赖 Python 标准库（http.server + sqlite3），不需要装任何额外的包。
#
# 只监听 127.0.0.1（本机回环地址），不直接对外网开放——真正对外的是 Nginx，
# Nginx 收到 /api/kudos 开头的请求之后转发给这个脚本（配置见 PROJECT_HANDOFF.md
# "点赞功能部署" 一节）。这样这个脚本本身永远不会被外部直接访问到。
#
# 部署：
#   1. 把这个文件放到服务器上，比如 /opt/kudos/kudos-server.py
#   2. 配一个 systemd service 让它常驻、开机自启、崩了自动重启
#   3. Nginx 加一段 location /api/kudos { proxy_pass http://127.0.0.1:8787; ... } 转发
#
# 要整个撤掉点赞功能：停掉并删除 systemd service、删掉 Nginx 里那段 location、
# 删掉这个文件和它旁边生成的 kudos.db 数据库文件即可，跟网站本身其他部分完全无关。

import http.server
import socketserver
import sqlite3
import json
import os

PORT = 8787
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kudos.db")
ALLOWED_ORIGINS = {
    "https://archiveoflay.com",
    "https://www.archiveoflay.com",
}
MAX_ID_LEN = 200


def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=5)
    # WAL 模式允许"一边有人在写，一边别人还能读"，busy_timeout 让写操作撞在一起时
    # 排队等一下再重试，而不是直接报错——这台服务器是多线程处理请求的（见文件最下面
    # ThreadingTCPServer），很多人同时点赞时每个请求还是各自开自己的连接，靠这两个
    # 设置来避免互相打架
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS kudos (id TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0)"
    )
    return conn


class Handler(http.server.BaseHTTPRequestHandler):
    def _cors_headers(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path != "/api/kudos":
            self._send_json(404, {"error": "not found"})
            return
        conn = get_db()
        try:
            rows = conn.execute("SELECT id, count FROM kudos").fetchall()
        finally:
            conn.close()
        self._send_json(200, {row[0]: row[1] for row in rows})

    def do_POST(self):
        prefix = "/api/kudos/"
        if not self.path.startswith(prefix):
            self._send_json(404, {"error": "not found"})
            return
        item_id = self.path[len(prefix):]
        if not item_id or len(item_id) > MAX_ID_LEN:
            self._send_json(400, {"error": "invalid id"})
            return

        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw or b"{}")
        except (ValueError, TypeError):
            payload = {}

        action = payload.get("action")
        if action == "like":
            delta = 1
        elif action == "unlike":
            delta = -1
        else:
            self._send_json(400, {"error": "action must be like/unlike"})
            return

        conn = get_db()
        try:
            conn.execute(
                "INSERT INTO kudos (id, count) VALUES (?, 0) ON CONFLICT(id) DO NOTHING",
                (item_id,),
            )
            conn.execute(
                "UPDATE kudos SET count = MAX(0, count + ?) WHERE id = ?",
                (delta, item_id),
            )
            conn.commit()
            row = conn.execute(
                "SELECT count FROM kudos WHERE id = ?", (item_id,)
            ).fetchone()
        finally:
            conn.close()

        self._send_json(200, {"id": item_id, "count": row[0]})

    def log_message(self, format, *args):
        # systemd 会把标准输出/错误接进日志，这里不用再重复打印每一次请求
        pass


if __name__ == "__main__":
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        httpd.serve_forever()
