

# Payload CMS on Vercel with Supabase & Multi-Tenant Form Builder

This project is a full-featured CMS built with Payload, deployed on Vercel, and using Supabase (PostgreSQL) for the database. It includes a dynamic form builder, secure JWT-based authentication, and multi-tenant functionality so that each user or organization can manage their own forms and submissions.

## Features

- Payload CMS admin panel hosted on Vercel
- Supabase PostgreSQL as the database backend
- Form builder with dynamic fields like text, email, select, checkbox, etc.
- Multi-tenant setup: users only access their own data
- Public API endpoint for form submissions
- Authentication system for registering, logging in, and managing sessions
- Minimal API testing interface (index.html) for quick endpoint testing

## Tech Stack

- Node.js, Express, Payload CMS
- Supabase (PostgreSQL)
- Vercel for deployment
- HTML, CSS, and JavaScript (no framework)

## Database

- Connected to Supabase using the `DATABASE_URL` environment variable
- Data includes users, forms, tenants, and form submissions

## Deployment Steps

1. Clone the repository:
 bash
   git clone https://github.com/your-username/your-repo.git
   cd your-repo


2. Create a `.env` file with:

   
   PAYLOAD_SECRET=yourSuperSecret
   DATABASE_URL=your_supabase_postgres_url
   PAYLOAD_PUBLIC_SERVER_URL=https://your-vercel-deployment-url.vercel.app
   

3. Install dependencies:

   bash
   npm install
   

4. Run locally (optional):

   bash
   node server.js
   

5. Deploy to Vercel:

   * Connect the repo to Vercel
   * Add environment variables in the dashboard
   * Click **Deploy** and access the admin panel at /admin

## API Endpoints

* **Auth**:

  * POST /api/auth/register
  * POST /api/auth/login
  * GET /api/auth/me

* **Forms**:

  * GET /api/forms
  * POST /api/forms
  * GET /api/forms/:id
  * PUT /api/forms/:id
  * DELETE /api/forms/:id

* **Form Submissions**:

  * POST /api/submit-form/:formId

* **Health Check**:

  * GET /api/health

## Authentication and Permissions

* Users log in with email and password to get a JWT.
* Only authenticated users can manage their own forms.
* Admins have full access to all data.
* Public form submission endpoint does not require authentication.

## Notes

* The admin panel is available at `/admin`.
* `index.html` is a handy UI for testing API endpoints.
* All multitenancy logic is implemented manually using Payload’s access controls.

## License

This project is MIT licensed. Feel free to adapt it for your own needs.





