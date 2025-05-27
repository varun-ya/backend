import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { buildConfig } from 'payload';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  admin: {
    user: 'users',
    importMap: {
      baseDir: dirname,
    },
  },
  collections: [
    {
      slug: 'users',
      auth: {
        tokenExpiration: 7200,
        verify: false,
        maxLoginAttempts: 5,
        lockTime: 600000,
      },
      admin: {
        useAsTitle: 'email',
        defaultColumns: ['name', 'email', 'role'],
      },
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
          admin: {
            placeholder: 'Enter your full name',
          },
        },
        {
          name: 'role',
          type: 'select',
          options: [
            { label: 'Admin', value: 'admin' },
            { label: 'User', value: 'user' },
          ],
          defaultValue: 'user',
          admin: {
            position: 'sidebar',
          },
        },
      ],
    },
    {
      slug: 'forms',
      admin: {
        useAsTitle: 'title',
        defaultColumns: ['title', 'description', 'tenant', 'updatedAt'],
        pagination: {
          defaultLimit: 20,
        },
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
          admin: {
            placeholder: 'Enter form title',
          },
        },
        {
          name: 'description',
          type: 'textarea',
          admin: {
            placeholder: 'Describe what this form is for (optional)',
            rows: 3,
          },
        },
        {
          name: 'slug',
          type: 'text',
          admin: {
            position: 'sidebar',
            description: 'URL-friendly version of the title',
          },
          hooks: {
            beforeValidate: [
              ({ data, operation, value }) => {
                if (operation === 'create' || !value) {
                  if (data?.title) {
                    return data.title
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/(^-|-$)/g, '') + '-' + Date.now();
                  }
                }
                return value;
              },
            ],
          },
        },
        {
          name: 'fields',
          type: 'array',
          required: true,
          minRows: 1,
          admin: {
            description: 'Define the fields for your form',
          },
          fields: [
            {
              name: 'name',
              type: 'text',
              required: true,
              admin: {
                placeholder: 'Field name (e.g., firstName)',
              },
            },
            {
              name: 'label',
              type: 'text',
              required: true,
              admin: {
                placeholder: 'Field label (e.g., First Name)',
              },
            },
            {
              name: 'type',
              type: 'select',
              required: true,
              options: [
                { label: 'Text', value: 'text' },
                { label: 'Email', value: 'email' },
                { label: 'Number', value: 'number' },
                { label: 'Textarea', value: 'textarea' },
                { label: 'Select', value: 'select' },
                { label: 'Checkbox', value: 'checkbox' },
                { label: 'Radio', value: 'radio' },
                { label: 'Date', value: 'date' },
              ],
              defaultValue: 'text',
            },
            {
              name: 'required',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                description: 'Make this field required',
              },
            },
            {
              name: 'placeholder',
              type: 'text',
              admin: {
                placeholder: 'Placeholder text (optional)',
                condition: (data, siblingData) => {
                  return ['text', 'email', 'number', 'textarea'].includes(siblingData?.type);
                },
              },
            },
            {
              name: 'options',
              type: 'textarea',
              admin: {
                condition: (data, siblingData) => {
                  return ['select', 'radio'].includes(siblingData?.type);
                },
                description: 'Enter each option on a new line',
                placeholder: 'Option 1\nOption 2\nOption 3',
                rows: 4,
              },
            },
          ],
        },
        {
          name: 'isActive',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            position: 'sidebar',
            description: 'Toggle to enable/disable form submissions',
          },
        },
        {
          name: 'createdBy',
          type: 'relationship',
          relationTo: 'users',
          admin: {
            position: 'sidebar',
            description: 'Form creator (automatically set)',
          },
        },
        {
          name: 'tenant',
          type: 'relationship',
          relationTo: 'users',
          admin: {
            position: 'sidebar',
            description: 'Form owner (automatically set)',
          },
        },
      ],
      access: {
        read: ({ req }) => {
          if (!req.user) return false; 
          if (req.user.role === 'admin') return true; 
        
          return {
            createdBy: {
              equals: req.user.id,
            },
          };
        },
        create: ({ req }) => Boolean(req.user),
        update: ({ req }) => {
          if (!req.user) return false;
          if (req.user.role === 'admin') return true;
          return {
            createdBy: {
              equals: req.user.id,
            },
          };
        },
        delete: ({ req }) => {
          if (!req.user) return false;
          if (req.user.role === 'admin') return true;
          return {
            createdBy: {
              equals: req.user.id,
            },
          };
        },
      },
      hooks: {
        beforeChange: [
          ({ data, req, operation }) => {
            if (req.user && operation === 'create') {
              data.createdBy = req.user.id;
              data.tenant = req.user.id;
            }
            return data;
          },
        ],
      },
    },
    {
      slug: 'form-submissions',
      admin: {
        useAsTitle: 'id',
        defaultColumns: ['form', 'submittedAt', 'tenant'],
        pagination: {
          defaultLimit: 50,
        },
      },
      fields: [
        {
          name: 'form',
          type: 'relationship',
          relationTo: 'forms',
          required: true,
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'data',
          type: 'json',
          required: true,
          admin: {
            readOnly: true,
            description: 'Submitted form data',
          },
        },
        {
          name: 'submittedAt',
          type: 'date',
          defaultValue: () => new Date(),
          admin: {
            readOnly: true,
            date: {
              pickerAppearance: 'dayAndTime',
            },
          },
        },
        {
          name: 'ipAddress',
          type: 'text',
          admin: {
            readOnly: true,
            position: 'sidebar',
            description: 'IP address of the submitter',
          },
        },
        {
          name: 'userAgent',
          type: 'text',
          admin: {
            readOnly: true,
            position: 'sidebar',
            description: 'Browser information',
          },
        },
        {
          name: 'tenant',
          type: 'relationship',
          relationTo: 'users',
          admin: {
            position: 'sidebar',
            readOnly: true,
            description: 'Form owner (automatically inherited from form)',
          },
        },
      ],
      access: {
        read: ({ req }) => {
          if (!req.user) return false;
          if (req.user.role === 'admin') return true;
          return {
            tenant: {
              equals: req.user.id,
            },
          };
        },
        create: () => true,
        update: () => false,
        delete: ({ req }) => {
          if (!req.user) return false;
          if (req.user.role === 'admin') return true;
          return {
            tenant: {
              equals: req.user.id,
            },
          };
        },
      },
      hooks: {
        beforeChange: [
          async ({ data, req, operation }) => {
            if (operation === 'create' && data.form) {
              try {
                const form = await req.payload.findByID({
                  collection: 'forms',
                  id: data.form,
                });
                
                if (form?.tenant) {
                  data.tenant = form.tenant;
                }

                if (req.ip) {
                  data.ipAddress = req.ip;
                }
                
                const userAgent = req.headers?.['user-agent'];
                if (userAgent) {
                  data.userAgent = userAgent;
                }
              } catch (error) {
                console.error('Error processing form submission:', error);
              }
            }
            return data;
          },
        ],
      },
    },
  ],
  editor: lexicalEditor({}),
  secret: process.env.PAYLOAD_SECRET || 'your-secret-key',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
  }),
  serverURL: process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000',
  cors: [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000',
  ],
  csrf: [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000',
  ],
  endpoints: [
    {
      path: '/health',
      method: 'get',
      handler: (req, res) => {
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
      },
    },
  ],
});