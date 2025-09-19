import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';
import { z } from 'zod';
import deepmerge from 'deepmerge';

function arrayMerge(target: any[], source: any[]): any[] {
  return source;
}

function parseConfigFile(filePath: string): Record<string, any> {
  const fileContent = readFileSync(filePath, 'utf8');
  const ext = filePath.split('.').pop()?.toLowerCase();

  if (ext === 'json') {
    return JSON.parse(fileContent);
  } else if (ext === 'yaml' || ext === 'yml') {
    return parse(fileContent) as Record<string, any>;
  } else {
    throw new Error(`Unsupported configuration file format: ${ext}`);
  }
}

function tryLoadConfig(basePath: string): Record<string, any> {
  const extensions = ['.json', '.yaml', '.yml'];
  for (const ext of extensions) {
    const fullPath = `${basePath}${ext}`;
    if (existsSync(fullPath)) {
      console.log(`Found config file: ${fullPath}`);
      return parseConfigFile(fullPath);
    }
  }
  return {}; // Return empty object if no file found
}

export async function loadConfig<T>(
  configSchema: z.AnyZodObject,
  configDir: string = './config'
): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    try {
      const env = process.env['NODE_ENV'] || 'development';
      console.log(`Loading configuration for environment: ${env}`);

      const baseConfigPath = resolve(configDir, 'application');
      const envConfigPath = resolve(configDir, `application-${env}`);

      // Use the new helper function to load base and environment-specific configurations
      const baseConfig = tryLoadConfig(baseConfigPath);
      const envConfig = tryLoadConfig(envConfigPath);

      // Provide warnings if base or environment-specific files were not found
      if (Object.keys(baseConfig).length === 0) {
        console.warn(
          'No base config file (application.json, .yaml, or .yml) found. Starting with empty config.'
        );
      }
      if (Object.keys(envConfig).length === 0) {
        console.warn(
          `No environment-specific config file (application-${env}.json, .yaml, or .yml) found.`
        );
      }

      // Merge environment config over base config using deepmerge
      // The arrayMerge option ensures arrays are replaced, not concatenated.
      const rawConfig = deepmerge(baseConfig, envConfig, { arrayMerge });

      // Validate the merged configuration using Zod
      const validatedConfig = configSchema.parse(rawConfig); // Throws if validation fails

      resolvePromise(validatedConfig as T);
    } catch (error) {
      console.error('Failed to load or validate configuration:', error);
      rejectPromise(error);
    }
  });
}
