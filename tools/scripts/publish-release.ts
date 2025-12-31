#!/usr/bin/env node

import { releasePublish } from 'nx/release';
import { execSync } from 'child_process';

/**
 * Publish Release Script
 *
 * This script is used to publish a release by:
 * 1. Creating git tags for the released versions
 * 2. Pushing tags to remote
 * 3. Publishing packages (if applicable)
 *
 * This should be run AFTER the release PR has been merged to main
 */

async function main() {
  // Guard against circular project graph creation
  if ((global as any).NX_GRAPH_CREATION) {
    console.error('❌ Cannot run release script during project graph creation');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const dryRun = process.env.DRY_RUN === 'true' || args.includes('--dry-run');

  console.log('🚀 Publishing release...');
  console.log(`   Dry Run: ${dryRun}`);
  console.log('');

  try {
    // Step 1: Publish the release (creates tags)
    console.log('📝 Step 1: Creating git tags...');
    const publishResult = await releasePublish({
      dryRun: dryRun,
      verbose: true,
    });

    console.log('\n✅ Git tags created successfully');

    if (!dryRun) {
      // Step 2: Push tags to remote
      console.log('\n📝 Step 2: Pushing tags to remote...');
      execSync('git push --follow-tags', { stdio: 'inherit' });

      console.log('\n✅ Tags pushed to remote');
      console.log('\n✨ Release published successfully!');
      console.log('\nNext steps:');
      console.log('1. Build and push Docker images with version tags');
      console.log('2. Create GitHub releases from the tags');
    } else {
      console.log('\n✨ Dry run complete! No tags were created or pushed.');
    }
  } catch (error) {
    console.error('\n❌ Error publishing release:', error);
    process.exit(1);
  }
}

main();
