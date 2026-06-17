import { createTool, getToolRegistry } from '../tool-registry';

/**
 * Artifact tools
 *
 * These tools let the LLM author arbitrary, self-contained HTML "artifacts"
 * that the frontend renders live inside a sandboxed iframe (the "canvas").
 *
 * The tools themselves are intentionally thin: the actual HTML payload travels
 * in the tool-call *input*, which the streaming layer already forwards to the
 * client via `tool_call_start` events. The frontend reads `input.html` /
 * `input.title` to (re)render the canvas. The tool result is kept small (it does
 * NOT echo the HTML back) so we don't duplicate large payloads in the response.
 */

const HTML_HINT =
  'A COMPLETE, self-contained HTML document. Include <!DOCTYPE html>, <html>, ' +
  '<head> (with all CSS inside <style> tags) and <body> (with all JavaScript ' +
  'inside <script> tags). The artifact runs in a sandboxed iframe with no access ' +
  'to the parent page, so everything must be inline. You MAY load libraries from ' +
  'public CDNs via <script src> / <link href> (e.g. https://cdn.jsdelivr.net, ' +
  'https://unpkg.com, https://cdnjs.cloudflare.com).';

const createArtifact = createTool(
  {
    name: 'create_artifact',
    description:
      'Create a new visual HTML artifact that is rendered live in a canvas ' +
      'panel beside the chat. Use this for interactive apps, data ' +
      'visualisations, games, diagrams, dashboards, landing pages, ' +
      'simulations, or any rich visual/interactive content that is better ' +
      'shown than described. You have total creative freedom over the HTML, ' +
      'CSS and JavaScript. After creating the artifact, briefly tell the user ' +
      'what you built — do NOT paste the raw HTML into the chat.',
    category: 'Artifacts',
    tags: ['artifact', 'canvas', 'html', 'ui', 'visual', 'interactive'],
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description:
            'A short, descriptive title for the artifact, shown in the canvas header.',
        },
        html: {
          type: 'string',
          description: HTML_HINT,
        },
      },
      required: ['title', 'html'],
    },
  },
  async (params) => {
    const title = ((params.title as string) || 'Untitled Artifact').trim();
    const html = (params.html as string) || '';

    if (!html.trim()) {
      return {
        success: false,
        error: 'The "html" parameter is required and cannot be empty.',
      };
    }

    return {
      success: true,
      data: {
        title,
        bytes: html.length,
        rendered: true,
        message: `Artifact "${title}" was rendered in the canvas (${html.length} bytes of HTML).`,
      },
    };
  }
);

const updateArtifact = createTool(
  {
    name: 'update_artifact',
    description:
      'Replace the HTML of the current artifact shown in the canvas. Use this ' +
      'to iterate on an artifact you (or the user) previously created — fixing ' +
      'bugs, restyling, or adding features. Always provide the FULL updated ' +
      'HTML document, not a diff or fragment. If no artifact exists yet, this ' +
      'behaves like create_artifact.',
    category: 'Artifacts',
    tags: ['artifact', 'canvas', 'html', 'ui', 'visual', 'interactive'],
    parameters: {
      type: 'object',
      properties: {
        html: {
          type: 'string',
          description: 'The full updated HTML document. ' + HTML_HINT,
        },
        title: {
          type: 'string',
          description:
            'Optional new title for the artifact. Omit to keep the existing title.',
        },
      },
      required: ['html'],
    },
  },
  async (params) => {
    const html = (params.html as string) || '';
    const title = (params.title as string | undefined)?.trim();

    if (!html.trim()) {
      return {
        success: false,
        error: 'The "html" parameter is required and cannot be empty.',
      };
    }

    return {
      success: true,
      data: {
        title,
        bytes: html.length,
        updated: true,
        message: `Artifact updated in the canvas (${html.length} bytes of HTML).`,
      },
    };
  }
);

// Register all artifact tools
const registry = getToolRegistry();
registry.register(createArtifact);
registry.register(updateArtifact);

export { createArtifact, updateArtifact };
