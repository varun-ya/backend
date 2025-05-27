import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://postgres:varunbackend1234@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'
});

client.connect()
  .then(() => {
    console.log('✅ Connected successfully to the database!');
    return client.end();
  })
  .catch((err) => {
    console.error('❌ Failed to connect:', err.message);
  });
