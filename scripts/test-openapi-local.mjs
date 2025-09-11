#!/usr/bin/env node

/**
 * Simple local OpenAPI spec validation test
 * Tests the OpenAPI specification without requiring live deployment
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = dirname(__dirname);

console.log('🧪 Testing OpenAPI specification locally...');

// Load OpenAPI spec
const specPath = join(rootDir, 'openapi.yaml');
const spec = yaml.load(readFileSync(specPath, 'utf8'));

// Basic validation tests
const tests = [
  {
    name: 'OpenAPI version is 3.0.3',
    test: () => spec.openapi === '3.0.3'
  },
  {
    name: 'Has required info fields',
    test: () => spec.info?.title && spec.info?.version && spec.info?.description
  },
  {
    name: 'Has all OIDC endpoints',
    test: () => {
      const required = ['/.well-known/openid-configuration', '/authorize', '/token', '/userinfo', '/jwks'];
      return required.every(path => spec.paths[path]);
    }
  },
  {
    name: 'Discovery endpoint has GET method',
    test: () => spec.paths['/.well-known/openid-configuration']?.get
  },
  {
    name: 'Authorize endpoint has both GET and POST',
    test: () => spec.paths['/authorize']?.get && spec.paths['/authorize']?.post
  },
  {
    name: 'Token endpoint has POST only',
    test: () => spec.paths['/token']?.post && !spec.paths['/token']?.get
  },
  {
    name: 'UserInfo endpoint has GET method',
    test: () => spec.paths['/userinfo']?.get
  },
  {
    name: 'JWKS endpoint has GET method', 
    test: () => spec.paths['/jwks']?.get
  },
  {
    name: 'All endpoints have examples',
    test: () => {
      let hasExamples = true;
      for (const [path, pathInfo] of Object.entries(spec.paths)) {
        for (const [method, operation] of Object.entries(pathInfo)) {
          let foundExample = false;
          for (const [status, response] of Object.entries(operation.responses || {})) {
            if (response.content) {
              for (const content of Object.values(response.content)) {
                if (content.example || content.examples) {
                  foundExample = true;
                  break;
                }
              }
            }
            if (foundExample) break;
          }
          if (!foundExample && !operation.responses?.['302']) {
            console.log(`   Missing example in ${method.toUpperCase()} ${path}`);
            hasExamples = false;
          }
        }
      }
      return hasExamples;
    }
  },
  {
    name: 'All schemas are properly defined',
    test: () => {
      const required = ['OpenIdConfiguration', 'TokenResponse', 'UserInfo', 'JWKSet', 'JWK', 'ErrorResponse'];
      return required.every(schema => {
        const s = spec.components?.schemas?.[schema];
        return s?.type && s?.properties;
      });
    }
  },
  {
    name: 'Security schemes defined',
    test: () => spec.components?.securitySchemes?.BearerAuth
  },
  {
    name: 'Servers configured',
    test: () => Array.isArray(spec.servers) && spec.servers.length > 0
  },
  {
    name: 'Tags are defined',
    test: () => Array.isArray(spec.tags) && spec.tags.length > 0
  },
  {
    name: 'External docs present',
    test: () => spec.externalDocs?.url
  }
];

// Run tests
let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    const result = test.test();
    if (result) {
      console.log(`✅ ${test.name}`);
      passed++;
    } else {
      console.log(`❌ ${test.name}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ ${test.name} (Error: ${error.message})`);
    failed++;
  }
}

console.log('\n📊 Test Results:');
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📄 Total: ${tests.length}`);

if (failed === 0) {
  console.log('\n🎉 All OpenAPI specification tests passed!');
  console.log('   The specification is ready for deployment and live testing.');
  process.exit(0);
} else {
  console.log(`\n⚠️  ${failed} test(s) failed. Please fix the issues before deployment.`);
  process.exit(1);
}