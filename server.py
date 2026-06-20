#!/usr/bin/env python3
"""
Shopwel Supermarket — E-Commerce Backend
================================================
Run:  python3 server.py
Then: open http://localhost:8080 in your browser
"""

import http.server
import json
import sqlite3
import os
import urllib.parse
from datetime import datetime

# ─── Config ────────────────────────────────────────────
PORT        = int(os.environ.get("PORT", 8080))
DB_FILE     = os.path.join(os.path.dirname(__file__), "shopwel.db")
ADMIN_KEY   = os.environ.get("SHOPWEL_ADMIN_KEY", "shopwel2025")
STATIC_DIR  = os.path.dirname(os.path.abspath(__file__))

# ─── Initial Seed Data ─────────────────────────────────
INITIAL_PRODUCTS = [
    # Fresh Produce
    ("Fresh Produce", "Tomatoes 1kg", 40),
    ("Fresh Produce", "Onions 1kg", 35),
    ("Fresh Produce", "Potatoes 1kg", 45),
    ("Fresh Produce", "Bananas (1 dozen)", 60),
    ("Fresh Produce", "Spinach / Palak (1 bunch)", 20),
    ("Fresh Produce", "Green Chillies (250g)", 15),
    ("Fresh Produce", "Coriander / Methi (1 bunch)", 15),
    ("Fresh Produce", "Capsicum (0.5kg)", 30),
    # Dairy
    ("Dairy", "Amul Milk 1L", 68),
    ("Dairy", "Curd 400g", 30),
    ("Dairy", "Paneer 200g", 85),
    ("Dairy", "Amul Butter 100g", 56),
    ("Dairy", "Eggs (6 pack)", 42),
    ("Dairy", "Cheese Slices", 120),
    # Staples & Grains
    ("Staples & Grains", "Basmati Rice 5kg", 450),
    ("Staples & Grains", "Atta 5kg", 220),
    ("Staples & Grains", "Toor Dal 1kg", 160),
    ("Staples & Grains", "Sunflower Oil 1L", 145),
    ("Staples & Grains", "Sugar 1kg", 45),
    ("Staples & Grains", "Salt 1kg", 25),
    # Snacks & Beverage
    ("Snacks & Beverage", "Lay's Chips", 20),
    ("Snacks & Beverage", "Parle-G Biscuits", 10),
    ("Snacks & Beverage", "Maggi Noodles (4pk)", 56),
    ("Snacks & Beverage", "Minute Maid Juice", 40),
    ("Snacks & Beverage", "Tea / Tata Tea 250g", 120),
    ("Snacks & Beverage", "Coffee / Nescafé 100g", 290),
    # Household
    ("Household", "Surf Excel Detergent 1kg", 210),
    ("Household", "Vim Dish Soap", 25),
    ("Household", "Dettol Handwash", 99),
    ("Household", "Toilet Paper (6 rolls)", 180),
]

# ─── Database setup ────────────────────────────────────
def init_db():
    is_new = not os.path.exists(DB_FILE)
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        aisle TEXT NOT NULL,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        stock_status TEXT DEFAULT 'in_stock'
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_phone TEXT NOT NULL,
        customer_name TEXT,
        customer_address TEXT,
        items_json TEXT NOT NULL,
        total_amount REAL NOT NULL,
        created_at TEXT NOT NULL,
        status TEXT DEFAULT 'pending'
    )""")
    # Index for fast LIKE searches on product name at scale
    c.execute("CREATE INDEX IF NOT EXISTS idx_products_name ON products (name)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_products_aisle ON products (aisle)")
    
    if is_new:
        print("Seeding initial products...")
        for aisle, name, price in INITIAL_PRODUCTS:
            c.execute("INSERT INTO products (aisle, name, price, stock_status) VALUES (?, ?, ?, 'in_stock')",
                      (aisle, name, price))
            
    conn.commit()
    conn.close()

# ─── Request handler ───────────────────────────────────
class ShopwelHandler(http.server.SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def log_message(self, format, *args):
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts}] {format % args}")

    def send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def parse_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    # ── OPTIONS (CORS preflight) ──────────────────────
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ── GET ───────────────────────────────────────────
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs     = urllib.parse.parse_qs(parsed.query)

        # GET /api/aisles — distinct category list
        if parsed.path == "/api/aisles":
            conn = sqlite3.connect(DB_FILE)
            rows = conn.execute("SELECT DISTINCT aisle FROM products ORDER BY aisle").fetchall()
            conn.close()
            return self.send_json(200, {"aisles": [r[0] for r in rows]})

        # GET /api/products
        # Supports ?search=, ?aisle=, ?default=true
        # No params → return all (backward-compat with admin panel)
        if parsed.path == "/api/products":
            search  = qs.get("search",  [None])[0]
            aisle   = qs.get("aisle",   [None])[0]
            default = qs.get("default", [None])[0]  # "true" → 8 per category
            limit   = int(qs.get("limit", ["60"])[0])

            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = sqlite3.Row

            if default == "true":
                # Return the first 8 products per category (by name order)
                # Use a window-function-free approach for broad SQLite compat
                all_rows = conn.execute(
                    "SELECT * FROM products ORDER BY aisle, name"
                ).fetchall()
                conn.close()
                per_aisle = {}
                for r in all_rows:
                    a = r["aisle"]
                    if a not in per_aisle:
                        per_aisle[a] = []
                    if len(per_aisle[a]) < 8:
                        per_aisle[a].append(dict(r))
                # Also return per-aisle total counts for the hint
                conn2 = sqlite3.connect(DB_FILE)
                count_rows = conn2.execute(
                    "SELECT aisle, COUNT(*) as cnt FROM products GROUP BY aisle"
                ).fetchall()
                conn2.close()
                aisle_counts = {r[0]: r[1] for r in count_rows}
                products = [p for prods in per_aisle.values() for p in prods]
                return self.send_json(200, {
                    "products": products,
                    "aisle_counts": aisle_counts
                })

            # Build dynamic query for search / aisle filter
            query  = "SELECT * FROM products"
            params = []
            clauses = []
            if search:
                clauses.append("name LIKE ?")
                params.append(f"%{search}%")
            if aisle:
                clauses.append("aisle = ?")
                params.append(aisle)
            if clauses:
                query += " WHERE " + " AND ".join(clauses)
            query += " ORDER BY aisle, name"
            if search or aisle:
                query += f" LIMIT {int(limit)}"

            rows = conn.execute(query, params).fetchall()
            conn.close()
            products = [dict(r) for r in rows]
            return self.send_json(200, {"products": products})

        # GET /api/orders
        if parsed.path == "/api/orders":
            key = qs.get("admin_key", [None])[0]
            if key != ADMIN_KEY:
                return self.send_json(403, {"error": "Invalid admin key"})
            
            filter_type = qs.get("filter", ["lifetime"])[0]
            
            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = sqlite3.Row
            query = "SELECT * FROM orders"
            params = []
            
            now = datetime.now()
            if filter_type == "month":
                query += " WHERE strftime('%Y-%m', created_at) = ?"
                params.append(now.strftime("%Y-%m"))
            elif filter_type == "year":
                query += " WHERE strftime('%Y', created_at) = ?"
                params.append(now.strftime("%Y"))
                
            query += " ORDER BY id DESC"
            
            rows = conn.execute(query, params).fetchall()
            conn.close()
            orders = [dict(r) for r in rows]
            return self.send_json(200, {"orders": orders})

        # GET /api/stats
        if parsed.path == "/api/stats":
            key = qs.get("admin_key", [None])[0]
            if key != ADMIN_KEY:
                return self.send_json(403, {"error": "Invalid admin key"})
                
            filter_type = qs.get("filter", ["lifetime"])[0]
            
            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = sqlite3.Row
            
            query = "SELECT items_json FROM orders WHERE status='confirmed'"
            params = []
            
            now = datetime.now()
            if filter_type == "month":
                query += " AND strftime('%Y-%m', created_at) = ?"
                params.append(now.strftime("%Y-%m"))
            elif filter_type == "year":
                query += " AND strftime('%Y', created_at) = ?"
                params.append(now.strftime("%Y"))
                
            rows = conn.execute(query, params).fetchall()
            conn.close()
            
            item_counts = {}
            total_revenue = 0
            total_orders = len(rows)
            
            for r in rows:
                items = json.loads(r["items_json"])
                for it in items:
                    name = it.get("name", "Unknown")
                    qty = int(it.get("qty", 1))
                    price = float(it.get("price", 0))
                    
                    if name not in item_counts:
                        item_counts[name] = {"qty": 0, "revenue": 0}
                    
                    item_counts[name]["qty"] += qty
                    item_counts[name]["revenue"] += (qty * price)
                    total_revenue += (qty * price)
                    
            top_items = [{"name": k, "qty": v["qty"], "revenue": v["revenue"]} 
                         for k, v in item_counts.items()]
            top_items.sort(key=lambda x: x["qty"], reverse=True)
            
            return self.send_json(200, {
                "total_orders": total_orders,
                "total_revenue": total_revenue,
                "top_items": top_items[:50]
            })

        return super().do_GET()

    # ── POST ──────────────────────────────────────────
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)

        # POST /api/orders/new
        if parsed.path == "/api/orders/new":
            body = self.parse_body()
            customer_phone = str(body.get("phone", "")).strip()
            customer_name = str(body.get("name", "")).strip()
            customer_address = str(body.get("address", "")).strip()
            items = body.get("items", [])
            total = float(body.get("total", 0))
            
            created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute("""INSERT INTO orders (customer_phone, customer_name, customer_address, items_json, total_amount, created_at, status)
                         VALUES (?, ?, ?, ?, ?, ?, 'pending')""",
                      (customer_phone, customer_name, customer_address, json.dumps(items), total, created_at))
            order_id = c.lastrowid
            conn.commit()
            conn.close()
            
            print(f"✅ New Order #{order_id} from {customer_phone} - ₹{total:.2f}")
            return self.send_json(201, {"success": True, "order_id": order_id})
            
        # POST /api/products
        if parsed.path == "/api/products":
            body = self.parse_body()
            key = str(body.get("admin_key", ""))
            if key != ADMIN_KEY:
                return self.send_json(403, {"error": "Invalid admin key"})
                
            aisle = str(body.get("aisle", "Default"))
            name = str(body.get("name", ""))
            price = float(body.get("price", 0))
            stock_status = str(body.get("stock_status", "in_stock"))
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute("INSERT INTO products (aisle, name, price, stock_status) VALUES (?, ?, ?, ?)",
                      (aisle, name, price, stock_status))
            prod_id = c.lastrowid
            conn.commit()
            conn.close()
            
            return self.send_json(201, {"success": True, "id": prod_id})

        # POST /api/products/bulk — insert many products in one transaction
        if parsed.path == "/api/products/bulk":
            body = self.parse_body()
            key = str(body.get("admin_key", ""))
            if key != ADMIN_KEY:
                return self.send_json(403, {"error": "Invalid admin key"})

            products = body.get("products", [])
            if not isinstance(products, list) or len(products) == 0:
                return self.send_json(400, {"error": "No products provided"})

            inserted = 0
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            try:
                c.execute("BEGIN")
                for p in products:
                    aisle = str(p.get("aisle", "Default")).strip()
                    name  = str(p.get("name", "")).strip()
                    price = float(p.get("price", 0))
                    if not name:
                        continue
                    c.execute(
                        "INSERT INTO products (aisle, name, price, stock_status) VALUES (?, ?, ?, 'in_stock')",
                        (aisle, name, price)
                    )
                    inserted += 1
                conn.commit()
            except Exception as ex:
                conn.rollback()
                conn.close()
                return self.send_json(500, {"error": str(ex)})
            conn.close()
            print(f"📦 Bulk import: {inserted} products added")
            return self.send_json(201, {"success": True, "inserted": inserted})

        self.send_json(404, {"error": "Endpoint not found"})

    # ── PUT ───────────────────────────────────────────
    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # PUT /api/orders?id=XXX
        if parsed.path == "/api/orders":
            qs = urllib.parse.parse_qs(parsed.query)
            order_id = qs.get("id", [None])[0]
            if not order_id:
                return self.send_json(400, {"error": "Order ID required"})
                
            body = self.parse_body()
            key = str(body.get("admin_key", ""))
            if key != ADMIN_KEY:
                return self.send_json(403, {"error": "Invalid admin key"})
                
            status = str(body.get("status", ""))
            if not status:
                return self.send_json(400, {"error": "Status required"})
                
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute("UPDATE orders SET status=? WHERE id=?", (status, int(order_id)))
            conn.commit()
            conn.close()
            return self.send_json(200, {"success": True})
            
        # PUT /api/products?id=XXX
        if parsed.path == "/api/products":
            qs = urllib.parse.parse_qs(parsed.query)
            prod_id = qs.get("id", [None])[0]
            if not prod_id:
                return self.send_json(400, {"error": "Product ID required"})
                
            body = self.parse_body()
            key = str(body.get("admin_key", ""))
            if key != ADMIN_KEY:
                return self.send_json(403, {"error": "Invalid admin key"})
                
            updates = []
            params = []
            if "aisle" in body:
                updates.append("aisle=?")
                params.append(str(body["aisle"]))
            if "name" in body:
                updates.append("name=?")
                params.append(str(body["name"]))
            if "price" in body:
                updates.append("price=?")
                params.append(float(body["price"]))
            if "stock_status" in body:
                updates.append("stock_status=?")
                params.append(str(body["stock_status"]))
                
            if not updates:
                return self.send_json(400, {"error": "No fields to update"})
                
            query = "UPDATE products SET " + ", ".join(updates) + " WHERE id=?"
            params.append(int(prod_id))
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute(query, params)
            conn.commit()
            conn.close()
            
            return self.send_json(200, {"success": True})
            
        self.send_json(404, {"error": "Endpoint not found"})

    # ── DELETE ────────────────────────────────────────
    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # DELETE /api/orders?id=XXX
        if parsed.path == "/api/orders":
            qs = urllib.parse.parse_qs(parsed.query)
            order_id = qs.get("id", [None])[0]
            if not order_id:
                return self.send_json(400, {"error": "Order ID required"})
                
            body = self.parse_body()
            key = str(body.get("admin_key", ""))
            if key != ADMIN_KEY:
                return self.send_json(403, {"error": "Invalid admin key"})
                
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute("DELETE FROM orders WHERE id=?", (int(order_id),))
            conn.commit()
            conn.close()
            return self.send_json(200, {"success": True})
            
        # DELETE /api/products?id=XXX
        if parsed.path == "/api/products":
            qs = urllib.parse.parse_qs(parsed.query)
            prod_id = qs.get("id", [None])[0]
            if not prod_id:
                return self.send_json(400, {"error": "Product ID required"})
                
            body = self.parse_body()
            key = str(body.get("admin_key", ""))
            if key != ADMIN_KEY:
                return self.send_json(403, {"error": "Invalid admin key"})
                
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute("DELETE FROM products WHERE id=?", (int(prod_id),))
            conn.commit()
            conn.close()
            
            return self.send_json(200, {"success": True})
            
        self.send_json(404, {"error": "Endpoint not found"})

# ─── Start server ──────────────────────────────────────
if __name__ == "__main__":
    init_db()
    print(f"""
╔══════════════════════════════════════════════╗
║   Shopwel Backend — E-Commerce Active!       ║
╠══════════════════════════════════════════════╣
║  Website  →  http://localhost:{PORT}           ║
║  Admin    →  http://localhost:{PORT}/admin.html ║
║  Admin key:  {ADMIN_KEY:<34}║
╚══════════════════════════════════════════════╝
""")
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(("", PORT), ShopwelHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nServer stopped. Goodbye!")
