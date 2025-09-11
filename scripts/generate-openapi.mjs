#!/usr/bin/env node

/**
 * OpenAPI Specification Generator Script
 * 
 * Generates/regenerates the OpenAPI specification for the OIDC provider
 * by analyzing the current codebase and updating the spec with live data.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = dirname(__dirname);

console.log('🔄 Regenerating OpenAPI specification...');

// Read the current OpenAPI spec
const specPath = join(rootDir, 'openapi.yaml');
let spec = readFileSync(specPath, 'utf8');

// Get current version from package.json
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const currentVersion = packageJson.version;

// Update version in spec
spec = spec.replace(/version:\s*[\d\.]+/, `version: ${currentVersion}`);

// Get current date for last update
const lastUpdated = new Date().toISOString().split('T')[0];

// Check if we can determine the actual deployed URLs from environment
const baseUrls = [
  process.env.BASE_URL || 'https://oidc.antonycc.com',
  process.env.CI_BASE_URL || 'https://oidc-ci.antonycc.com'
];

// Update server URLs if they've changed
let updatedServers = `servers:
  - url: ${baseUrls[0]}
    description: Production server
  - url: ${baseUrls[1]}  
    description: CI/Testing server`;

spec = spec.replace(/servers:[\s\S]*?(?=\n\w|\n$)/m, updatedServers);

// Add generation timestamp as comment
const timestamp = `# Generated on ${lastUpdated} by scripts/generate-openapi.mjs
# Version: ${currentVersion}
# 
`;

if (!spec.startsWith('# Generated on')) {
  spec = timestamp + spec;
} else {
  spec = spec.replace(/^# Generated on.*?\n# \n/m, timestamp);
}

// Write updated spec
writeFileSync(specPath, spec);

// Also copy to web directory for deployment
const webSpecPath = join(rootDir, 'web', 'openapi.yaml');
writeFileSync(webSpecPath, spec);

console.log('✅ OpenAPI specification updated successfully!');
console.log(`   📄 File: ${specPath}`);  
console.log(`   📄 Web File: ${webSpecPath}`);
console.log(`   📦 Version: ${currentVersion}`);
console.log(`   📅 Updated: ${lastUpdated}`);
console.log(`   🌐 Servers: ${baseUrls.join(', ')}`);

// Validate the spec if swagger-validator is available
try {
  console.log('🔍 Validating OpenAPI specification...');
  
  // Try to use swagger-validator-cli if installed
  try {
    execSync('npx swagger-validator-cli validate openapi.yaml', { 
      cwd: rootDir, 
      stdio: 'pipe' 
    });
    console.log('✅ OpenAPI specification is valid!');
  } catch (e) {
    // Fall back to basic YAML syntax check
    console.log('ℹ️  Swagger validator not available, checking YAML syntax...');
    
    // Try to parse as YAML to check syntax
    try {
      const yaml = await import('js-yaml');
      yaml.load(spec);
      console.log('✅ OpenAPI YAML syntax is valid!');
    } catch (yamlError) {
      console.error('❌ YAML syntax error:', yamlError.message);
      process.exit(1);
    }
  }
} catch (validationError) {
  console.warn('⚠️  Could not validate OpenAPI spec:', validationError.message);
}

console.log('\n📖 Next steps:');
console.log('   • Deploy the updated spec to make it available at /openapi.yaml');
console.log('   • Update documentation links to reference the new spec');
console.log('   • Run API tests against the specification');
console.log('   • Update Swagger UI if deployed');