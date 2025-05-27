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


app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));



const corsOptions = {
  origin: 'http://192.168.1.11:8080',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
};

app.use(cors(corsOptions));

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });
}


const start = async () => {
  try {
    console.log('Starting Payload CMS...');
    
    if (!process.env.PAYLOAD_SECRET) {
      throw new Error('PAYLOAD_SECRET environment variable is required');
    }
    
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('Database URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'));
    console.log('Payload Secret:', process.env.PAYLOAD_SECRET ? 'Set' : 'Missing');

    console.log('Testing database connection...');
    try {
      const { Client } = await import('pg');
      const testClient = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: false,
      });
      await testClient.connect();
      await testClient.query('SELECT 1');
      await testClient.end();
      console.log('Database connection successful');
    } catch (dbError) {
      console.error('Database connection failed:', dbError.message);
      throw new Error(`Database connection failed: ${dbError.message}`);
    }

    console.log('Initializing Payload...');
    const payload = await getPayload({ config });
    
    if (!payload) {
      throw new Error('Failed to initialize Payload');
    }
    
    console.log('Payload initialized successfully');
    console.log('Available collections:', Object.keys(payload.collections || {}));

    const authenticateToken = async (req, res, next) => {
      const authHeader = req.headers['authorization'];
      const token = authHeader && (authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader.replace('JWT ', ''));

      if (token) {
        try {
          const decoded = jwt.decode(token);
          
          if (decoded && decoded.id) {
            const user = await payload.findByID({
              collection: 'users',
              id: decoded.id,
              req: {
                payload: payload,
                headers: req.headers || {},
                query: req.query || {},
              },
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
      if (!req.query) req.query = {};
      if (!req.body) req.body = {};
      if (!req.headers) req.headers = {};
      
      next();
    };

    const createPayloadReq = (req) => ({
      ...req,
      user: req.user || null,
      payload: payload,
      headers: req.headers || {},
      query: req.query || {},
      body: req.body || {},
    });

    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    app.get('/api/status', (req, res) => {
      res.json({ 
        status: 'running',
        payload: 'initialized',
        timestamp: new Date().toISOString() 
      });
    });

    app.get('/api/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        api: 'running',
        payload: 'initialized',
        timestamp: new Date().toISOString() 
      });
    });

    app.post('/api/auth/register', async (req, res) => {
      try {
        const { name, email, password, role = 'user' } = req.body;
        
        if (!name || !email || !password) {
          return res.status(400).json({ 
            error: 'Name, email and password are required' 
          });
        }

        const user = await payload.create({
          collection: 'users',
          data: {
            name,
            email,
            password,
            role,
          },
        });

        const { password: _, ...userWithoutPassword } = user;
        
        res.status(201).json({
          success: true,
          user: userWithoutPassword
        });
      } catch (error) {
        console.error('Registration error:', error);
        res.status(400).json({ 
          error: 'Registration failed',
          message: error.message 
        });
      }
    });

    app.post('/api/auth/login', async (req, res) => {
      try {
        const { email, password } = req.body;
        
        if (!email || !password) {
          return res.status(400).json({ 
            error: 'Email and password are required' 
          });
        }

        const result = await payload.login({
          collection: 'users',
          data: { email, password }
        });

        res.json({
          success: true,
          token: result.token,
          user: result.user,
          exp: result.exp
        });
      } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({ 
          error: 'Login failed',
          message: 'Invalid credentials' 
        });
      }
    });

    app.get('/api/auth/me', async (req, res) => {
      try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && (authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader.replace('JWT ', ''));

        if (!token) {
          return res.status(401).json({ message: 'Authentication token required' });
        }

        let decoded;
        try {
          decoded = jwt.decode(token);
        } catch (decodeError) {
          return res.status(401).json({ message: 'Invalid token format' });
        }

        if (!decoded || !decoded.id) {
          return res.status(401).json({ message: 'Invalid token payload' });
        }

        const user = await payload.findByID({
          collection: 'users',
          id: decoded.id,
          req: {
            payload: payload,
            headers: req.headers || {},
            query: req.query || {},
          },
        });

        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }

        const { password, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Failed to fetch user profile' });
      }
    });

    app.post('/api/submit-form/:formId', authenticateToken, async (req, res) => {
      try {
        const { formId } = req.params;
        const submissionData = req.body;

        console.log(`Form submission for form ID: ${formId}`);

        let form;
        try {
          form = await payload.findByID({
            collection: 'forms',
            id: formId,
            req: createPayloadReq(req),
          });
        } catch (accessError) {
          console.log('Retrying form lookup with admin override for public submission');
          try {
            form = await payload.findByID({
              collection: 'forms',
              id: formId,
              overrideAccess: true,
              req: {
                payload: payload,
                user: null,
                headers: {},
                query: {},
              },
            });
          } catch (finalError) {
            console.log(`Form not found: ${formId}`);
            return res.status(404).json({ error: 'Form not found or not available for submissions' });
          }
        }

        if (!form) {
          return res.status(404).json({ error: 'Form not found' });
        }

        if (!form.isActive) {
          return res.status(400).json({ error: 'Form is not accepting submissions' });
        }

        console.log(`Form found: ${form.title}`);

        const submission = await payload.create({
          collection: 'form-submissions',
          data: {
            form: formId,
            data: submissionData,
            tenant: form.tenant,
          },
          req: createPayloadReq(req),
        });

        console.log(`Submission created with ID: ${submission.id}`);

        res.status(201).json({
          success: true,
          message: 'Form submitted successfully',
          submissionId: submission.id,
        });
      } catch (error) {
        console.error('Form submission error:', error);
        res.status(500).json({ 
          error: 'Failed to submit form',
          message: error.message 
        });
      }
    });

    app.get('/admin', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Payload Admin</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body>
          <div id="app">
            <h1>Payload CMS Admin</h1>
            <p>Admin panel is being set up...</p>
            <p>Available Collections:</p>
            <ul>
              <li><a href="/api/users">Users API</a></li>
              <li><a href="/api/forms">Forms API</a></li>
              <li><a href="/api/form-submissions">Form Submissions API</a></li>
            </ul>
            <h2>Test API Endpoints:</h2>
            <ul>
              <li>POST /api/auth/register - Register new user</li>
              <li>POST /api/auth/login - Login user</li>
              <li>GET /api/auth/me - Get current user</li>
              <li>GET /api/forms - Get all forms (requires auth)</li>
              <li>POST /api/forms - Create form (requires auth)</li>
            </ul>
          </div>
        </body>
        </html>
      `);
    });
    
    app.use('/api', (req, res, next) => {
      if (req.path.startsWith('/auth/') || 
          req.path.startsWith('/submit-form/') || 
          req.path === '/status' || 
          req.path === '/health') {
        return next();
      }
      authenticateToken(req, res, next);
    });

    app.use('/api', (req, res, next) => {
      console.log(`API Request: ${req.method} ${req.originalUrl}`);
      console.log(`User: ${req.user ? req.user.email : 'anonymous'}`);
      next();
    });
    
    const collections = ['users', 'form-submissions'];
    
    collections.forEach(collection => {
      console.log(`Setting up routes for ${collection}`);
      
      app.get(`/api/${collection}`, async (req, res) => {
        try {
          console.log(`Fetching all ${collection}`);
          
          const result = await payload.find({
            collection,
            req: createPayloadReq(req),
          });
          res.json(result);
        } catch (error) {
          console.error(`Error fetching ${collection}:`, error.message);
          res.status(500).json({ error: error.message });
        }
      });
      
      app.get(`/api/${collection}/:id`, async (req, res) => {
        try {
          console.log(`Fetching ${collection} with ID: ${req.params.id}`);
          
          const result = await payload.findByID({
            collection,
            id: req.params.id,
            req: createPayloadReq(req),
          });
          res.json(result);
        } catch (error) {
          console.error(`Error fetching ${collection} by ID:`, error.message);
          if (error.message.includes('not found')) {
            res.status(404).json({ error: 'Document not found' });
          } else {
            res.status(403).json({ error: 'Access denied or document not found' });
          }
        }
      });
      
      app.post(`/api/${collection}`, async (req, res) => {
        try {
          console.log(`Creating new ${collection}`);
          console.log(`Data:`, JSON.stringify(req.body, null, 2));
          
          const result = await payload.create({
            collection,
            data: req.body,
            req: createPayloadReq(req),
          });
          res.status(201).json(result);
        } catch (error) {
          console.error(`Error creating ${collection}:`, error.message);
          if (error.message.includes('access')) {
            res.status(403).json({ error: 'Access denied' });
          } else {
            res.status(400).json({ error: error.message });
          }
        }
      });
      
      app.put(`/api/${collection}/:id`, async (req, res) => {
        try {
          console.log(`Updating ${collection} with ID: ${req.params.id}`);
          
          const result = await payload.update({
            collection,
            id: req.params.id,
            data: req.body,
            req: createPayloadReq(req),
          });
          res.json(result);
        } catch (error) {
          console.error(`Error updating ${collection}:`, error.message);
          if (error.message.includes('not found')) {
            res.status(404).json({ error: 'Document not found' });
          } else if (error.message.includes('access')) {
            res.status(403).json({ error: 'Access denied' });
          } else {
            res.status(400).json({ error: error.message });
          }
        }
      });
      
      app.delete(`/api/${collection}/:id`, async (req, res) => {
        try {
          console.log(`Deleting ${collection} with ID: ${req.params.id}`);
          
          await payload.delete({
            collection,
            id: req.params.id,
            req: createPayloadReq(req),
          });
          res.json({ success: true, message: 'Document deleted successfully' });
        } catch (error) {
          console.error(`Error deleting ${collection}:`, error.message);
          if (error.message.includes('not found')) {
            res.status(404).json({ error: 'Document not found' });
          } else if (error.message.includes('access')) {
            res.status(403).json({ error: 'Access denied' });
          } else {
            res.status(400).json({ error: error.message });
          }
        }
      });
    });

    app.get('/api/forms', async (req, res) => {
      try {
        console.log('Fetching forms');
        
        let queryOptions = {
          collection: 'forms',
          req: createPayloadReq(req),
        };

        if (req.user && req.user.role !== 'admin') {
          queryOptions.where = {
            createdBy: {
              equals: req.user.id
            }
          };
        }
        
        const result = await payload.find(queryOptions);
        res.json(result);
      } catch (error) {
        console.error('Error fetching forms:', error.message);
        res.status(500).json({ error: error.message });
      }
    });
    
   app.get('/api/forms/:id', async (req, res) => {
  try {
    console.log(`Fetching form with ID: ${req.params.id}`);
    
    const form = await payload.findByID({
      collection: 'forms',
      id: req.params.id,
      req: createPayloadReq(req),
    });

    if (req.user && req.user.role !== 'admin') {
      const createdById = typeof form.createdBy === 'object' ? form.createdBy.id : form.createdBy;
      if (createdById !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    res.json(form);
  } catch (error) {
    console.error('Error fetching form by ID:', error.message);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'Document not found' });
    } else {
      res.status(403).json({ error: 'Access denied or document not found' });
    }
  }
});

app.put('/api/forms/:id', async (req, res) => {
  try {
    console.log(`Updating form with ID: ${req.params.id}`);
    
    const existingForm = await payload.findByID({
      collection: 'forms',
      id: req.params.id,
      req: createPayloadReq(req),
    });

    if (req.user && req.user.role !== 'admin') {
      const createdById = typeof existingForm.createdBy === 'object' ? existingForm.createdBy.id : existingForm.createdBy;
      if (createdById !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const result = await payload.update({
      collection: 'forms',
      id: req.params.id,
      data: req.body,
      req: createPayloadReq(req),
    });
    res.json(result);
  } catch (error) {
    console.error('Error updating form:', error.message);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'Document not found' });
    } else if (error.message.includes('access')) {
      res.status(403).json({ error: 'Access denied' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

app.delete('/api/forms/:id', async (req, res) => {
  try {
    console.log(`Deleting form with ID: ${req.params.id}`);
    
    const existingForm = await payload.findByID({
      collection: 'forms',
      id: req.params.id,
      req: createPayloadReq(req),
    });

    if (req.user && req.user.role !== 'admin') {
      const createdById = typeof existingForm.createdBy === 'object' ? existingForm.createdBy.id : existingForm.createdBy;
      if (createdById !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    await payload.delete({
      collection: 'forms',
      id: req.params.id,
      req: createPayloadReq(req),
    });
    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting form:', error.message);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'Document not found' });
    } else if (error.message.includes('access')) {
      res.status(403).json({ error: 'Access denied' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});
    app.post('/api/forms', async (req, res) => {
      try {
        console.log('Creating new form');
        console.log('Data:', JSON.stringify(req.body, null, 2));
        
        const formData = {
          ...req.body,
          createdBy: req.user ? req.user.id : null
        };
        
        const result = await payload.create({
          collection: 'forms',
          data: formData,
          req: createPayloadReq(req),
        });
        res.status(201).json(result);
      } catch (error) {
        console.error('Error creating form:', error.message);
        if (error.message.includes('access')) {
          res.status(403).json({ error: 'Access denied' });
        } else {
          res.status(400).json({ error: error.message });
        }
      }
    });
    
    app.put('/api/forms/:id', async (req, res) => {
      try {
        console.log(`Updating form with ID: ${req.params.id}`);
        
        const existingForm = await payload.findByID({
          collection: 'forms',
          id: req.params.id,
          req: createPayloadReq(req),
        });

        if (req.user && req.user.role !== 'admin' && existingForm.createdBy !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
        
        const result = await payload.update({
          collection: 'forms',
          id: req.params.id,
          data: req.body,
          req: createPayloadReq(req),
        });
        res.json(result);
      } catch (error) {
        console.error('Error updating form:', error.message);
        if (error.message.includes('not found')) {
          res.status(404).json({ error: 'Document not found' });
        } else if (error.message.includes('access')) {
          res.status(403).json({ error: 'Access denied' });
        } else {
          res.status(400).json({ error: error.message });
        }
      }
    });
    
    app.delete('/api/forms/:id', async (req, res) => {
      try {
        console.log(`Deleting form with ID: ${req.params.id}`);
        
        const existingForm = await payload.findByID({
          collection: 'forms',
          id: req.params.id,
          req: createPayloadReq(req),
        });

        if (req.user && req.user.role !== 'admin' && existingForm.createdBy !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
        
        await payload.delete({
          collection: 'forms',
          id: req.params.id,
          req: createPayloadReq(req),
        });
        res.json({ success: true, message: 'Document deleted successfully' });
      } catch (error) {
        console.error('Error deleting form:', error.message);
        if (error.message.includes('not found')) {
          res.status(404).json({ error: 'Document not found' });
        } else if (error.message.includes('access')) {
          res.status(403).json({ error: 'Access denied' });
        } else {
          res.status(400).json({ error: error.message });
        }
      }
    });
    
    console.log('All API routes configured successfully');

    app.get('/', (req, res) => {
      res.json({
        message: 'Payload CMS API Server',
        admin: '/admin',
        api: '/api',
        health: '/health',
        status: 'running',
        endpoints: {
          auth: {
            register: 'POST /api/auth/register',
            login: 'POST /api/auth/login',
            me: 'GET /api/auth/me'
          },
          collections: {
            users: '/api/users',
            forms: '/api/forms',
            submissions: '/api/form-submissions'
          },
          forms: {
            submit: 'POST /api/submit-form/:formId'
          }
        }
      });
    });

    app.use((req, res) => {
      console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
      res.status(404).json({ 
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method
      });
    });

    app.use((error, req, res, next) => {
      console.error('Server error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    });

    const server = app.listen(PORT, () => {
      console.log('Server started successfully!');
      console.log(`Server: http://localhost:${PORT}`);
      console.log(`Admin: http://localhost:${PORT}/admin`);
      console.log(`API: http://localhost:${PORT}/api`);
      console.log(`Health: http://localhost:${PORT}/health`);
      console.log('\nAPI Usage Examples:');
      console.log('1. Register: POST /api/auth/register');
      console.log('   Body: {"name": "Test User", "email": "test@example.com", "password": "password123"}');
      console.log('2. Login: POST /api/auth/login');
      console.log('   Body: {"email": "test@example.com", "password": "password123"}');
      console.log('3. Get Profile: GET /api/auth/me (with Authorization: Bearer <token>)');
      console.log('4. Create Form: POST /api/forms (with Authorization: Bearer <token>)');
      console.log('   Body: {"title": "Contact Form", "fields": [{"name": "email", "label": "Email", "type": "email", "required": true}]}');
      console.log('5. Submit Form: POST /api/submit-form/:formId');
      console.log('   Body: {"email": "user@example.com", "message": "Hello world"}');
      console.log('Ready to accept requests!');
    });

    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Fatal error starting server:', error.message);
    console.error('Stack trace:', error.stack);
    
    if (error.message.includes('connect')) {
      console.error('Hint: Check your DATABASE_URL connection string');
    }
    if (error.message.includes('PAYLOAD_SECRET')) {
      console.error('Hint: Make sure PAYLOAD_SECRET is set in your environment');
    }
    
    process.exit(1);
  }
};

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});





start();