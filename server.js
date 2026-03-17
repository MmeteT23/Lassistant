
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/ping', (req, res) => res.send('pong'));

// Database mock (temporarily removed better-sqlite3 to test stability)
let db = null;
const getDb = async () => {
  return null; // Mocked
};

app.post('/api/sync/save', async (req, res) => {
  res.json({ success: true, mocked: true });
});

app.get('/api/sync/load/:code', async (req, res) => {
  res.status(404).json({ error: 'Mocked - DB disabled' });
});

// Serve static files
const distPath = path.join(__dirname, 'dist');
console.log('Serving static files from:', distPath);
app.use(express.static(distPath));

// SPA fallback
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Build not found');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
