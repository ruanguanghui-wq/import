import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import crypto, { randomUUID } from "crypto";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    admin.initializeApp();
    console.log("Firebase Admin initialized");
  } catch (err) {
    console.warn("Firebase Admin failed to initialize with defaults. Some auth features may be limited.", err);
  }
}

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
    role TEXT,
    email TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    userId TEXT,
    data TEXT,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS quotations (
    id TEXT PRIMARY KEY,
    userId TEXT,
    data TEXT,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    data TEXT
  );
`);

// Create default admin user if not exists
const adminExists = db.prepare("SELECT * FROM users WHERE username = ?").get("admin");
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync("admin123", 10);
  db.prepare("INSERT INTO users (id, username, password, role, email) VALUES (?, ?, ?, ?, ?)").run(
    "admin-id",
    "admin",
    hashedPassword,
    "admin",
    "admin@example.com"
  );
} else {
  // Ensure admin password is correct
  db.prepare("UPDATE users SET password = ? WHERE username = 'admin'").run(bcrypt.hashSync("admin123", 10));
}

// Force admin role for specific users
db.prepare("INSERT OR IGNORE INTO users (id, username, password, role, email) VALUES (?, ?, ?, ?, ?)").run(
  "ruan-id",
  "ruanguanghui@gmail.com",
  bcrypt.hashSync("admin123", 10),
  "admin",
  "ruanguanghui@gmail.com"
);
db.prepare("UPDATE users SET role = 'admin' WHERE username = 'ruanguanghui@gmail.com'").run();
db.prepare("UPDATE users SET role = 'admin' WHERE username = 'admin@example.com'").run();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Auth Middleware
  const authenticateToken = async (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    // Try verifying as Firebase token first
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      const email = decodedToken.email;
      
      // Sync with local users table
      let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
      if (!user) {
        const id = decodedToken.uid;
        const username = decodedToken.name || email?.split('@')[0] || "User";
        const role = email === "ruanguanghui@gmail.com" ? "admin" : "user";
        db.prepare("INSERT INTO users (id, username, role, email) VALUES (?, ?, ?, ?)").run(
          id, username, role, email
        );
        user = { id, username, role, email };
      }
      
      req.user = user;
      return next();
    } catch (firebaseErr) {
      // Fallback to local JWT
      jwt.verify(token, JWT_SECRET, (err: any, decodedUser: any) => {
        if (err) return res.sendStatus(403);
        const dbUser = db.prepare("SELECT * FROM users WHERE id = ?").get(decodedUser.id) as any;
        if (!dbUser) return res.sendStatus(403);
        req.user = { id: dbUser.id, username: dbUser.username, role: dbUser.role, email: dbUser.email };
        next();
      });
    }
  };

  // Auth Routes
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ? OR email = ?").get(username, username) as any;

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: "Sai tên đăng nhập hoặc mật khẩu" });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, email: user.email }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, email: user.email } });
  });

  app.post("/api/auth/register", (req, res) => {
    const { username, password, email } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Vui lòng nhập đầy đủ thông tin" });
    }

    try {
      const hashedPassword = bcrypt.hashSync(password, 10);
      const id = randomUUID();
      const userEmail = email || username;
      const role = (userEmail === 'ruanguanghui@gmail.com' || userEmail === 'admin@example.com' || username === 'admin') ? 'admin' : 'user';
      db.prepare("INSERT INTO users (id, username, password, role, email) VALUES (?, ?, ?, ?, ?)").run(
        id,
        username,
        hashedPassword,
        role,
        userEmail
      );
      
      const token = jwt.sign({ id, username, role, email: userEmail }, JWT_SECRET);
      res.json({ token, user: { id, username, role, email: userEmail } });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ error: "Tên đăng nhập hoặc email đã tồn tại" });
      }
      res.status(500).json({ error: "Lỗi máy chủ" });
    }
  });

  app.get("/api/auth/me", authenticateToken, (req: any, res) => {
    res.json({ user: req.user });
  });

  // Users Management (Admin only)
  app.get("/api/users", authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const users = db.prepare("SELECT id, username, email, role FROM users").all();
    res.json(users);
  });

  app.post("/api/users", authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { email, role, username } = req.body;
    const id = randomUUID();
    
    try {
      db.prepare("INSERT INTO users (id, username, role, email) VALUES (?, ?, ?, ?)").run(
        id, username || email.split('@')[0], role || 'user', email
      );
      res.json({ success: true, id });
    } catch (error: any) {
      res.status(400).json({ error: "Email hoặc tên đăng nhập đã tồn tại" });
    }
  });

  app.put("/api/users/:id", authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const userId = req.params.id;
    const { email, role, username } = req.body;
    
    try {
      db.prepare("UPDATE users SET email = ?, role = ?, username = ? WHERE id = ?").run(
        email, role, username, userId
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: "Lỗi khi cập nhật người dùng" });
    }
  });

  app.delete("/api/users/:id", authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const userId = req.params.id;
    if (userId === req.user.id) return res.status(400).json({ error: "Không thể tự xóa chính mình" });
    
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    res.json({ success: true });
  });

  app.put("/api/users/:id/role", authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const userId = req.params.id;
    const { role } = req.body;
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, userId);
    res.json({ success: true });
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
    
    order.userId = user.id;
    if (user.role !== 'admin') {
      order.customerName = user.username;
      order.customerEmail = user.email;
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

  // Quotations Routes
  app.get("/api/quotations", authenticateToken, (req: any, res) => {
    const user = req.user;
    let quotations;
    
    if (user.role === 'admin') {
      quotations = db.prepare("SELECT data FROM quotations").all();
    } else {
      quotations = db.prepare("SELECT data FROM quotations WHERE userId = ?").all(user.id);
    }
    
    const parsedQuotations = quotations.map((q: any) => JSON.parse(q.data));
    res.json(parsedQuotations);
  });

  app.post("/api/quotations", authenticateToken, (req: any, res) => {
    const user = req.user;
    const quotation = req.body;
    
    quotation.userId = user.id;
    
    try {
      db.prepare("INSERT INTO quotations (id, userId, data) VALUES (?, ?, ?)").run(
        quotation.id,
        user.id,
        JSON.stringify(quotation)
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Error inserting quotation:", error);
      res.status(500).json({ error: "Lỗi khi lưu báo giá" });
    }
  });

  app.put("/api/quotations/:id", authenticateToken, (req: any, res) => {
    const user = req.user;
    const quotationId = req.params.id;
    const updatedQuotation = req.body;
    
    const existingQuotation = db.prepare("SELECT * FROM quotations WHERE id = ?").get(quotationId) as any;
    
    if (!existingQuotation) {
      return res.status(404).json({ error: "Không tìm thấy báo giá" });
    }
    
    if (user.role !== 'admin' && existingQuotation.userId !== user.id) {
      return res.status(403).json({ error: "Không có quyền sửa báo giá này" });
    }
    
    updatedQuotation.userId = existingQuotation.userId;
    
    db.prepare("UPDATE quotations SET data = ? WHERE id = ?").run(
      JSON.stringify(updatedQuotation),
      quotationId
    );
    
    res.json({ success: true });
  });

  app.delete("/api/quotations/:id", authenticateToken, (req: any, res) => {
    const user = req.user;
    const quotationId = req.params.id;
    
    const existingQuotation = db.prepare("SELECT * FROM quotations WHERE id = ?").get(quotationId) as any;
    
    if (!existingQuotation) {
      return res.status(404).json({ error: "Không tìm thấy báo giá" });
    }
    
    if (user.role !== 'admin' && existingQuotation.userId !== user.id) {
      return res.status(403).json({ error: "Không có quyền xóa báo giá này" });
    }
    
    db.prepare("DELETE FROM quotations WHERE id = ?").run(quotationId);
    
    res.json({ success: true });
  });

  // Products Routes
  app.get("/api/products", authenticateToken, (req: any, res) => {
    const products = db.prepare("SELECT data FROM products").all();
    const parsedProducts = products.map((p: any) => JSON.parse(p.data));
    res.json(parsedProducts);
  });

  app.post("/api/products", authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const product = req.body;
    
    try {
      db.prepare("INSERT INTO products (id, data) VALUES (?, ?)").run(
        product.id,
        JSON.stringify(product)
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Lỗi khi lưu sản phẩm" });
    }
  });

  app.put("/api/products/:id", authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const productId = req.params.id;
    const updatedProduct = req.body;
    
    db.prepare("UPDATE products SET data = ? WHERE id = ?").run(
      JSON.stringify(updatedProduct),
      productId
    );
    
    res.json({ success: true });
  });

  app.delete("/api/products/:id", authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const productId = req.params.id;
    db.prepare("DELETE FROM products WHERE id = ?").run(productId);
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
