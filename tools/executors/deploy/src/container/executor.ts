import { ExecutorContext } from '@nx/devkit';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface ContainerExecutorOptions {
  image: string;
  dockerfile: string;
  context: string;
  tag: string;
  deployment?: string;
  pushImage: boolean;
  updateDeployment: boolean;
}

export default async function containerExecutor(
  options: ContainerExecutorOptions,
  context: ExecutorContext
): Promise<{ success: boolean }> {
  const {
    image,
    dockerfile,
    context: buildContext = '.',
    tag = 'latest',
    deployment,
    pushImage = true,
    updateDeployment = true,
  } = options;

  const workspaceRoot = context.root;
  const fullImage = `${image}:${tag}`;

  console.log(`\n🐳 Building ${fullImage}`);
  console.log(`   Dockerfile: ${dockerfile}`);
  console.log(`   Context:    ${buildContext}`);

  try {
    // Build
    const buildCmd = `docker build -f ${dockerfile} -t ${fullImage} ${buildContext}`;
    execSync(buildCmd, { cwd: workspaceRoot, stdio: 'inherit' });
    console.log(`✅ Built ${fullImage}`);

    // Push
    if (pushImage) {
      console.log(`📤 Pushing ${fullImage}`);
      execSync(`docker push ${fullImage}`, {
        cwd: workspaceRoot,
        stdio: 'inherit',
      });
      console.log(`✅ Pushed ${fullImage}`);
    }

    // Update deployment manifest
    if (updateDeployment && deployment) {
      const valuesPath = join(
        workspaceRoot,
        'deployments',
        deployment,
        'values.yaml'
      );

      if (!existsSync(valuesPath)) {
        console.warn(
          `⚠️ Deployment values not found: ${valuesPath} — skipping manifest update`
        );
      } else {
        const content = readFileSync(valuesPath, 'utf-8');
        const tagRegex = /^(\s*tag:\s*).+$/m;

        if (!tagRegex.test(content)) {
          console.warn(
            `⚠️ No tag field found in ${valuesPath} — skipping manifest update`
          );
        } else {
          const updated = content.replace(tagRegex, `$1${tag}`);
          if (updated !== content) {
            writeFileSync(valuesPath, updated, 'utf-8');
            console.log(
              `📝 Updated deployments/${deployment}/values.yaml → ${tag}`
            );
          } else {
            console.log(
              `✓ deployments/${deployment}/values.yaml already at ${tag}`
            );
          }
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to build/push ${fullImage}:`, error);
    return { success: false };
  }
}
