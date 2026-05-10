const { kv } = require('@vercel/kv');
kv.keys('*').then(keys => {
  console.log('Keys:', keys);
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});