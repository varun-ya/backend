// Required modules and setup
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import express from 'express';
import { getPayload } from 'payload';
import config from './payload.config.js';
import dotenv from 'dotenv';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());

// API and admin logic
const start = async () => {
  try {
    console.log('Starting Payload CMS...');
    if (!process.env.PAYLOAD_SECRET || !process.env.DATABASE_URL) {
      throw new Error('PAYLOAD_SECRET and DATABASE_URL are required');
    }

    // Test DB connection
    const { Client } = await import('pg');
    const testClient = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
    });
    await testClient.connect();
    await testClient.query('SELECT 1');
    await testClient.end();
    console.log('Database connection successful');

    // Initialize Payload
    const payload = await getPayload({ config });

    // Auth middleware
    const authenticateToken = async (req, res, next) => {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      if (token) {
        try {
          const decoded = jwt.decode(token);
          if (decoded && decoded.id) {
            const user = await payload.findByID({
              collection: 'users',
              id: decoded.id,
              req: { payload, headers: req.headers },
            });
            if (user) {
              req.user = user;
              req.payloadToken = token;
              console.log(`Authenticated user: ${user.email}`);
            }
          }
        } catch (error) {
          console.log('Token verification failed:', error.message);
        }
      }
      req.payload = payload;
      next();
    };

    const createPayloadReq = (req) => ({
      ...req,
      user: req.user || null,
      payload,
      headers: req.headers,
      query: req.query,
      body: req.body,
    });

    // Health
    app.get('/health', (req, res) => res.json({ status: 'ok' }));
    app.get('/api/health', (req, res) => res.json({ status: 'ok', api: 'running' }));

    // Auth
    app.post('/api/auth/register', async (req, res) => {
      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
      }
      const user = await payload.create({
        collection: 'users',
        data: { name, email, password },
      });
      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    });

    app.post('/api/auth/login', async (req, res) => {
      const { email, password } = req.body;
      const result = await payload.login({
        collection: 'users',
        data: { email, password },
      });
      res.json(result);
    });

    app.get('/api/auth/me', authenticateToken, async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { password, ...userWithoutPassword } = req.user;
      res.json(userWithoutPassword);
    });

    // Forms and submissions (simplified)
    app.post('/api/submit-form/:formId', authenticateToken, async (req, res) => {
      const { formId } = req.params;
      const form = await payload.findByID({
        collection: 'forms',
        id: formId,
        req: createPayloadReq(req),
      });
      if (!form) return res.status(404).json({ error: 'Form not found' });
      const submission = await payload.create({
        collection: 'form-submissions',
        data: { form: formId, data: req.body },
        req: createPayloadReq(req),
      });
      res.status(201).json(submission);
    });

    app.get('/api/forms', authenticateToken, async (req, res) => {
      const result = await payload.find({
        collection: 'forms',
        req: createPayloadReq(req),
      });
      res.json(result);
    });

    // Static admin panel
    app.get('/admin', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Payload Admin</title>
        </head>
        <body>
          <h1>Admin Panel</h1>
          <p>Use API endpoints to manage data.</p>
        </body>
        </html>
      `);
    });

    // Serve static HTML files for testing
    app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
    app.get('/test.html', (req, res) => res.sendFile(path.join(__dirname, 'test.html')));
    app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({ error: 'Route not found' });
    });

    // Error handler
    app.use((err, req, res, next) => {
      console.error('Server error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });

    // Start server
    const server = app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });

    process.on('SIGTERM', () => {
      server.close(() => process.exit(0));
    });

  } catch (error) {
    console.error('Server startup error:', error);
    process.exit(1);
  }
};

start();
