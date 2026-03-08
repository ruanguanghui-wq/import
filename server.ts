import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import crypto, { randomUUID } from "crypto";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("--- SERVER STARTING ---");
console.log("Node version:", process.version);
console.log("Current directory:", process.cwd());
console.log("NODE_ENV:", process.env.NODE_ENV);

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-for-dev";

// Initialize Database
let db: any;
try {
  console.log("Attempting to initialize database...");
  db = new Database("database.sqlite");
  console.log("Database initialized successfully");
} catch (err) {
  console.error("CRITICAL: Failed to initialize database:", err);
  process.exit(1);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    userId TEXT,
    data TEXT,
    FOREIGN KEY(userId) REFERENCES users(id)
  );
`);

// Create default admin user if not exists
const adminExists = db.prepare("SELECT * FROM users WHERE username = ?").get("admin");
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync("admin123", 10);
  db.prepare("INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)").run(
    "admin-id",
    "admin",
    hashedPassword,
    "admin"
  );
} else {
  // Ensure admin password is correct
  db.prepare("UPDATE users SET password = ? WHERE username = 'admin'").run(bcrypt.hashSync("admin123", 10));
}

// Force admin role for specific users
db.prepare("UPDATE users SET role = 'admin' WHERE username = 'ruanguanghui@gmail.com'").run();
db.prepare("UPDATE users SET role = 'admin' WHERE username = 'admin@example.com'").run();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Auth Middleware
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, decodedUser: any) => {
      if (err) return res.sendStatus(403);
      const dbUser = db.prepare("SELECT * FROM users WHERE id = ?").get(decodedUser.id) as any;
      if (!dbUser) return res.sendStatus(403);
      req.user = { id: dbUser.id, username: dbUser.username, role: dbUser.role };
      next();
    });
  };

  // Auth Routes
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: "Sai tên đăng nhập hoặc mật khẩu" });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  });

  app.post("/api/auth/register", (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Vui lòng nhập đầy đủ thông tin" });
    }

    try {
      const hashedPassword = bcrypt.hashSync(password, 10);
      const id = randomUUID();
      const role = (username === 'ruanguanghui@gmail.com' || username === 'admin@example.com' || username === 'admin') ? 'admin' : 'user';
      db.prepare("INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)").run(
        id,
        username,
        hashedPassword,
        role
      );
      
      const token = jwt.sign({ id, username, role }, JWT_SECRET);
      res.json({ token, user: { id, username, role } });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ error: "Tên đăng nhập đã tồn tại" });
      }
      res.status(500).json({ error: "Lỗi máy chủ" });
    }
  });

  app.get("/api/auth/me", authenticateToken, (req: any, res) => {
    res.json({ user: req.user });
  });

  // Orders Routes
  app.get("/api/orders", authenticateToken, (req: any, res) => {
    const user = req.user;
    let orders;
    
    if (user.role === 'admin') {
      orders = db.prepare("SELECT data FROM orders").all();
    } else {
      orders = db.prepare("SELECT data FROM orders WHERE userId = ?").all(user.id);
    }
    
    const parsedOrders = orders.map((o: any) => JSON.parse(o.data));
    res.json(parsedOrders);
  });

  app.post("/api/orders", authenticateToken, (req: any, res) => {
    const user = req.user;
    const order = req.body;
    
    // Ensure the order belongs to the user
    order.userId = user.id;
    // Set customerName to username if not admin
    if (user.role !== 'admin') {
      order.customerName = user.username;
    }
    
    try {
      db.prepare("INSERT INTO orders (id, userId, data) VALUES (?, ?, ?)").run(
        order.id,
        user.id,
        JSON.stringify(order)
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Lỗi khi lưu đơn hàng" });
    }
  });

  app.put("/api/orders/:id", authenticateToken, (req: any, res) => {
    const user = req.user;
    const orderId = req.params.id;
    const updatedOrder = req.body;
    
    const existingOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as any;
    
    if (!existingOrder) {
      return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
    }
    
    if (user.role !== 'admin' && existingOrder.userId !== user.id) {
      return res.status(403).json({ error: "Không có quyền sửa đơn hàng này" });
    }
    
    // Preserve userId
    updatedOrder.userId = existingOrder.userId;
    
    db.prepare("UPDATE orders SET data = ? WHERE id = ?").run(
      JSON.stringify(updatedOrder),
      orderId
    );
    
    res.json({ success: true });
  });

  app.delete("/api/orders/:id", authenticateToken, (req: any, res) => {
    const user = req.user;
    const orderId = req.params.id;
    
    const existingOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as any;
    
    if (!existingOrder) {
      return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
    }
    
    if (user.role !== 'admin' && existingOrder.userId !== user.id) {
      return res.status(403).json({ error: "Không có quyền xóa đơn hàng này" });
    }
    
    db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
    
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting Vite in middleware mode...");
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite middleware attached");
    } catch (viteErr) {
      console.error("Failed to start Vite server:", viteErr);
    }
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
