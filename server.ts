import express from "express";
console.log("Starting server...");
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Health checks
app.get("/ping", (req, res) => {
  console.log("Ping received");
  res.send("pong");
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection successful");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
  }
}
testConnection();

app.post("/api/sync/save", async (req, res) => {
  const { code, data } = req.body;
  const path = `sync_data/${code}`;
  try {
    await setDoc(doc(db, "sync_data", code), {
      code,
      data: JSON.stringify(data),
      updated_at: serverTimestamp()
    });
    res.json({ success: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    res.status(500).json({ error: "Save failed" });
  }
});

app.get("/api/sync/load/:code", async (req, res) => {
  const { code } = req.params;
  const path = `sync_data/${code}`;
  try {
    const docSnap = await getDoc(doc(db, "sync_data", code));
    if (docSnap.exists()) {
      const row = docSnap.data();
      res.json(JSON.parse(row.data));
    } else {
      res.status(404).json({ error: "Not found" });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    res.status(500).json({ error: "Load failed" });
  }
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  // Serve Static Files
  const distPath = path.join(process.cwd(), "dist");
  console.log(`Serving static files from: ${distPath}`);
  app.use(express.static(distPath));

  // SPA Fallback
  app.get("*", (req, res) => {
    const indexPath = path.join(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send(`Build not found at ${distPath}`);
    }
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
});
