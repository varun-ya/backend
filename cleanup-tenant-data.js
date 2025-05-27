import { getPayload } from 'payload';
import config from './payload.config.js';

async function cleanupTenantData() {
  console.log('Starting tenant data cleanup...');
  
  try {
    const payload = await getPayload({ config });
    
    const adminUsers = await payload.find({
      collection: 'users',
      where: {
        role: {
          equals: 'admin',
        },
      },
      limit: 1,
    });
    
    if (adminUsers.docs.length === 0) {
      console.error('No admin user found. Please create an admin user first.');
      return;
    }
    
    const adminUser = adminUsers.docs[0];
    console.log(`Found admin user: ${adminUser.email} (${adminUser.id})`);
    
    const formsWithoutTenant = await payload.find({
      collection: 'forms',
      where: {
        tenant: {
          exists: false,
        },
      },
    });
    
    console.log(`Found ${formsWithoutTenant.docs.length} forms without tenant`);
    
    for (const form of formsWithoutTenant.docs) {
      await payload.update({
        collection: 'forms',
        id: form.id,
        data: {
          tenant: adminUser.id,
        },
      });
      console.log(`Updated form "${form.title}" (${form.id}) - assigned to admin`);
    }
    
    const submissionsWithoutTenant = await payload.find({
      collection: 'form-submissions',
      where: {
        tenant: {
          exists: false,
        },
      },
    });
    
    console.log(`Found ${submissionsWithoutTenant.docs.length} submissions without tenant`);
    
    for (const submission of submissionsWithoutTenant.docs) {
      await payload.update({
        collection: 'form-submissions',
        id: submission.id,
        data: {
          tenant: adminUser.id,
        },
      });
      console.log(`Updated submission ${submission.id} - assigned to admin`);
    }
    
    console.log('Cleanup completed successfully!');
    console.log('Summary:');
    console.log(`   - Fixed ${formsWithoutTenant.docs.length} forms`);
    console.log(`   - Fixed ${submissionsWithoutTenant.docs.length} submissions`);
    console.log('   - All records now have proper tenant assignments');
    console.log('');
    console.log('Next steps:');
    console.log('   1. Uncomment "required: true" for tenant fields in payload.config.js');
    console.log('   2. Remove the temporary "or" clause in access control');
    console.log('   3. Restart your server');
    
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
  
  process.exit();
}

cleanupTenantData();