#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');

console.log('\n==========================================');
console.log('🚀 The Man Store - Project Initial Setup');
console.log('==========================================\n');

// 1. Backend .env
const backendEnvPath = path.join(backendDir, '.env');
const backendEnvExamplePath = path.join(backendDir, '.env.example');

if (!fs.existsSync(backendEnvPath)) {
  if (fs.existsSync(backendEnvExamplePath)) {
    console.log('📋 Creating backend/.env from backend/.env.example...');
    let envContent = fs.readFileSync(backendEnvExamplePath, 'utf8');
    // Ensure default port is 8003 to match make dev-api
    envContent = envContent.replace(/^APP_PORT=.*$/m, 'APP_PORT=8003');
    envContent = envContent.replace(/^SERVER_PORT=.*$/m, 'SERVER_PORT=8003');
    envContent = envContent.replace(/^APP_URL=.*$/m, 'APP_URL=http://127.0.0.1:8003');
    fs.writeFileSync(backendEnvPath, envContent, 'utf8');
    console.log('✅ Created backend/.env (configured for port 8003)');
  } else {
    console.warn('⚠️  backend/.env.example not found. Skipped creating backend/.env');
  }
} else {
  console.log('✅ backend/.env already exists.');
}

// 2. Frontend .env
const frontendEnvPath = path.join(frontendDir, '.env');

if (!fs.existsSync(frontendEnvPath)) {
  console.log('📋 Creating frontend/.env (proxy target http://127.0.0.1:8003)...');
  const frontendEnvContent = `# Local Development Environment
VITE_API_BASE_URL=/api
VITE_PROXY_TARGET=http://127.0.0.1:8003
VITE_BACKEND_ORIGIN=http://127.0.0.1:8003
VITE_WITH_CREDENTIALS=true
`;
  fs.writeFileSync(frontendEnvPath, frontendEnvContent, 'utf8');
  console.log('✅ Created frontend/.env');
} else {
  console.log('✅ frontend/.env already exists.');
}

// 3. Composer dependencies
console.log('\n📦 Checking PHP backend dependencies...');
const vendorDir = path.join(backendDir, 'vendor');
if (!fs.existsSync(vendorDir)) {
  console.log('⏳ Running "composer install" inside backend/...');
  try {
    execSync('composer install --prefer-dist --no-interaction', {
      cwd: backendDir,
      stdio: 'inherit',
    });
    console.log('✅ Composer packages installed.');
  } catch (err) {
    console.warn('⚠️  Could not run composer install automatically (Check network / composer permissions).');
    console.warn('   Run "cd backend && composer install" manually.');
  }
} else {
  console.log('✅ backend/vendor already exists.');
}

// 4. Generate App Key & Storage link if artisan is ready
if (fs.existsSync(path.join(vendorDir, 'autoload.php'))) {
  console.log('\n🔑 Checking Laravel APP_KEY & Storage link...');
  try {
    execSync('php artisan key:generate --force', {
      cwd: backendDir,
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn('⚠️  key:generate skipped or failed.');
  }

  try {
    execSync('php artisan storage:link', {
      cwd: backendDir,
      stdio: 'inherit',
    });
  } catch (err) {
    // storage:link might already be linked, ignore
  }
}

// 5. Frontend NPM dependencies
console.log('\n📦 Checking frontend node_modules...');
const frontendNodeModules = path.join(frontendDir, 'node_modules');
if (!fs.existsSync(frontendNodeModules)) {
  console.log('⏳ Running "npm install" inside frontend/...');
  try {
    execSync('npm install', {
      cwd: frontendDir,
      stdio: 'inherit',
    });
    console.log('✅ Frontend dependencies installed.');
  } catch (err) {
    console.warn('⚠️  Could not run npm install in frontend.');
  }
} else {
  console.log('✅ frontend/node_modules already exists.');
}

// 6. Root NPM dependencies (concurrently)
console.log('\n📦 Checking root node_modules...');
const rootNodeModules = path.join(rootDir, 'node_modules');
if (!fs.existsSync(rootNodeModules)) {
  console.log('⏳ Running "npm install" inside root/...');
  try {
    execSync('npm install', {
      cwd: rootDir,
      stdio: 'inherit',
    });
    console.log('✅ Root dependencies installed.');
  } catch (err) {
    console.warn('⚠️  Could not run npm install in root.');
  }
} else {
  console.log('✅ root/node_modules already exists.');
}

console.log('\n==========================================');
console.log('🎉 Setup process finished!');
console.log('==========================================');
console.log('You can now start services:');
console.log('  👉 make dev            (Runs API port 8003 & Admin POS)');
console.log('  👉 make dev-api        (Runs Laravel API on port 8003)');
console.log('  👉 make dev-admin      (Runs Frontend Admin & POS)');
console.log('  👉 make dev-storefront (Runs Customer Storefront)');
console.log('  👉 make db-migrate     (Runs migrations)');
console.log('==========================================\n');
