#!/usr/bin/env node

import { releaseVersion, releaseChangelog } from 'nx/release';
import { execSync } from 'child_process';

/**
 * Prepare Release Script
 *
 * This script is used to prepare a release by:
 * 1. Calculating new version numbers based on conventional commits
 * 2. Generating changelogs for affected projects
 * 3. Updating package.json files with new versions
 *
 * Note: This script does NOT commit or tag - that's handled by the CI/CD pipeline
 */

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const releaseType =
    process.env.RELEASE_TYPE ||
    args.find((arg) => arg.startsWith('--type='))?.split('=')[1] ||
    'patch';
  const preid =
    process.env.PREID ||
    args.find((arg) => arg.startsWith('--preid='))?.split('=')[1];
  const dryRun = process.env.DRY_RUN === 'true' || args.includes('--dry-run');

  console.log('🚀 Preparing release...');
  console.log(`   Release Type: ${releaseType}`);
  if (preid) {
    console.log(`   Pre-release ID: ${preid}`);
  }
  console.log(`   Dry Run: ${dryRun}`);
  console.log('');

  try {
    // Step 1: Calculate and update versions
    console.log('📝 Step 1: Calculating new versions...');
    const versionResult = await releaseVersion({
      specifier: releaseType,
      preid: preid,
      dryRun: dryRun,
      gitCommit: false,
      gitTag: false,
      verbose: true,
    });

    if (versionResult.projectsVersionData) {
      console.log('\n✅ Version updates:');
      for (const [projectName, versionData] of Object.entries(
        versionResult.projectsVersionData
      )) {
        console.log(
          `   ${projectName}: ${versionData.currentVersion} → ${versionData.newVersion}`
        );
      }
    }

    // Step 2: Generate changelogs
    console.log('\n📝 Step 2: Generating changelogs...');
    const changelogResult = await releaseChangelog({
      versionData: versionResult.projectsVersionData,
      version: releaseType,
      dryRun: dryRun,
      gitCommit: false,
      gitTag: false,
      verbose: true,
    });

    console.log('\n✅ Changelogs generated successfully');

    if (!dryRun) {
      // Get the list of changed files
      const changedFiles = execSync('git status --porcelain', {
        encoding: 'utf-8',
      });

      if (changedFiles.trim()) {
        console.log('\n📋 Changed files:');
        console.log(changedFiles);
      } else {
        console.log('\n⚠️  No files were changed. This might indicate:');
        console.log('   - No commits warranting a version bump');
        console.log('   - All projects are already at the target version');
      }

      console.log('\n✨ Release preparation complete!');
      console.log('\nNext steps:');
      console.log('1. Review the changes above');
      console.log(
        '2. Commit these changes with: git commit -m "chore(release): publish {version}"'
      );
      console.log('3. Push and create a PR to main');
      console.log('4. Merge the PR using "Squash and merge"');
    } else {
      console.log('\n✨ Dry run complete! No files were modified.');
    }
  } catch (error) {
    console.error('\n❌ Error preparing release:', error);
    process.exit(1);
  }
}

main();
