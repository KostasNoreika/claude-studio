import Docker from 'dockerode';

const docker = new Docker();

async function testConnection() {
  try {
    const info = await docker.version();
    console.log('✅ Docker connected:', info.Version);
  } catch (error) {
    console.error('❌ Docker connection failed:', error);
    process.exit(1);
  }
}

testConnection();
