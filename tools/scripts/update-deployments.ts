#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Update Deployment Script
 *
 * Updates Helm values.yaml files with new Docker image tags
 * based on the version in each app's package.json
 */

interface AppVersionMap {
  [appName: string]: string;
}

const DEPLOYMENT_MAP: Record<string, string> = {
  finances: 'finances',
  'finances-frontend': 'finances-frontend',
  server: 'test-server',
  'aritzia-scanner': 'aritzia-scanner',
  wheel: 'wheel',
  landing: 'landing-page',
};

function getAppVersion(appName: string): string | null {
  const packageJsonPath = join(process.cwd(), 'apps', appName, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return null;
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  return packageJson.version;
}

function updateValuesYaml(deploymentName: string, version: string): boolean {
  const valuesPath = join(
    process.cwd(),
    'deployments',
    deploymentName,
    'values.yaml'
  );

  if (!existsSync(valuesPath)) {
    console.log(`   ⚠️  Skipping ${deploymentName} - values.yaml not found`);
    return false;
  }

  let content = readFileSync(valuesPath, 'utf-8');

  // Update the tag line
  const tagRegex = /^(\s*tag:\s*).+$/m;
  const match = content.match(tagRegex);

  if (!match) {
    console.log(`   ⚠️  Skipping ${deploymentName} - no tag field found`);
    return false;
  }

  const updatedContent = content.replace(tagRegex, `$1${version}`);

  if (updatedContent === content) {
    console.log(`   ✓ ${deploymentName} already at version ${version}`);
    return false;
  }

  writeFileSync(valuesPath, updatedContent, 'utf-8');
  console.log(`   ✅ Updated ${deploymentName} to version ${version}`);
  return true;
}

async function main() {
  console.log('🔄 Updating deployment manifests...\n');

  const appVersions: AppVersionMap = {};
  let updatedCount = 0;

  // Collect versions from all apps
  for (const [appName, deploymentName] of Object.entries(DEPLOYMENT_MAP)) {
    const version = getAppVersion(appName);

    if (version) {
      appVersions[appName] = version;
    }
  }

  if (Object.keys(appVersions).length === 0) {
    console.log(
      '⚠️  No app versions found. Make sure package.json files exist.\n'
    );
    return;
  }

  // Update each deployment
  for (const [appName, version] of Object.entries(appVersions)) {
    const deploymentName = DEPLOYMENT_MAP[appName];

    if (updateValuesYaml(deploymentName, version)) {
      updatedCount++;
    }
  }

  console.log(`\n✨ Updated ${updatedCount} deployment manifest(s)`);

  if (updatedCount > 0) {
    console.log('\n📦 Updated deployments:');
    for (const [appName, version] of Object.entries(appVersions)) {
      console.log(`   ${DEPLOYMENT_MAP[appName]}: ${version}`);
    }
  }
}

main().catch((error) => {
  console.error('❌ Error updating deployments:', error);
  process.exit(1);
});
