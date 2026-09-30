/**
 * Config loading and validation.
 *
 * The config is the only thing that knows what a consumer's content looks like; everything else
 * is generic. Validation is deliberately structural — it checks that the config itself makes
 * sense (unique names, fields that exist) and leaves content values to the schema the consumer
 * describes, because a CMS must not reject files it does not understand.
 */
import { z } from 'zod';
import type { CMSConfig, Collection, Field } from './config.js';

const fieldSchema: z.ZodType<Field> = z.lazy(() =>
  z
    .object({
      name: z.string().min(1),
      label: z.string().optional(),
      widget: z.string().min(1),
      required: z.boolean().optional(),
      hint: z.string().optional(),
      fields: z.array(fieldSchema).optional(),
      field: fieldSchema.optional(),
      options: z
        .array(z.union([z.string(), z.object({ label: z.string(), value: z.string() })]))
        .optional(),
      default: z.unknown().optional(),
      collapseEmpty: z.boolean().optional(),
      collection: z.string().optional(),
      valueField: z.string().optional(),
      displayFields: z.array(z.string()).optional(),
      format: z.string().optional(),
      pattern: z.tuple([z.string(), z.string()]).optional(),
    })
    .loose(),
) as z.ZodType<Field>;

const fieldsCollectionSchema = z.object({
  kind: z.literal('fields'),
  name: z.string().min(1),
  label: z.string().min(1),
  labelSingular: z.string().optional(),
  folder: z.string().min(1),
  extension: z.enum(['md', 'mdx', 'json', 'yaml']),
  format: z.enum(['frontmatter', 'json']),
  identifierField: z.string().optional(),
  contentField: z.string().optional(),
  nested: z.boolean().optional(),
  media: z.record(z.string(), z.unknown()).optional(),
  create: z.boolean().optional(),
  fields: z.array(fieldSchema).min(1),
});

const fileCollectionSchema = z.object({
  kind: z.literal('file'),
  name: z.string().min(1),
  label: z.string().min(1),
  format: z.enum(['yaml', 'json']).optional(),
  files: z
    .array(
      z.object({
        name: z.string().min(1),
        label: z.string().min(1),
        file: z.string().min(1),
        fields: z.array(fieldSchema).optional(),
        inferSchema: z.boolean().optional(),
        fieldOverrides: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
      }),
    )
    .min(1),
});

export const configSchema = z.object({
  backend: z.object({
    name: z.enum(['github', 'local']),
    repo: z
      .string()
      .regex(/^[\w.-]+\/[\w.-]+$/, 'Use the owner/repo form.')
      .optional(),
    branch: z.string().min(1).optional(),
    authBase: z.string().optional(),
    authEndpoint: z.string().optional(),
    local: z
      .object({
        // `memory` backs the tests, demos and previews; the others are real file access.
        kind: z.enum(['fs-access', 'proxy', 'memory']),
        url: z.string().optional(),
        /** Seed files for the memory backend, keyed by repository path. */
        files: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
  }),
  media: z
    .object({
      provider: z.enum(['repo', 's3']),
      repoPath: z.string().optional(),
      publicPath: z.string().optional(),
      maxEdge: z.number().int().positive().optional(),
      exif: z.boolean().optional(),
      s3: z
        .object({
          endpoint: z.string(),
          bucket: z.string(),
          publicBase: z.string(),
        })
        .optional(),
    })
    .optional(),
  collections: z.array(z.union([fieldsCollectionSchema, fileCollectionSchema])).min(1),
  locale: z.string().optional(),
  editorialWorkflow: z.boolean().optional(),
  preview: z
    .object({
      devServerURL: z.string().optional(),
      pathTemplate: z.string().optional(),
    })
    .optional(),
  plugins: z.array(z.unknown()).optional(),
});

export interface ConfigIssue {
  path: string;
  message: string;
}

/**
 * Validate a config and report every problem at once, so a consumer fixing a typo does not have
 * to reload repeatedly. Returns the parsed config on success.
 */
export function loadConfig(input: unknown): {
  config: CMSConfig;
  issues: ConfigIssue[];
} {
  const issues: ConfigIssue[] = [];
  const result = configSchema.safeParse(input);
  if (!result.success) {
    for (const issue of result.error.issues) {
      issues.push({ path: issue.path.join('.'), message: issue.message });
    }
    return { config: input as CMSConfig, issues };
  }
  const config = result.data as unknown as CMSConfig;

  const seen = new Set<string>();
  for (const collection of config.collections) {
    if (seen.has(collection.name)) {
      issues.push({
        path: `collections.${collection.name}`,
        message: 'Duplicate collection name.',
      });
    }
    seen.add(collection.name);
    collectFieldIssues(collection, issues);
  }

  if (config.backend.name === 'github' && !config.backend.repo) {
    issues.push({
      path: 'backend.repo',
      message: 'The github backend needs a repo.',
    });
  }
  if (config.backend.name === 'local' && !config.backend.local) {
    issues.push({
      path: 'backend.local',
      message: 'The local backend needs a local mode.',
    });
  }
  if (config.media?.provider === 's3' && !config.media.s3) {
    issues.push({
      path: 'media.s3',
      message: 'The s3 media provider needs its settings.',
    });
  }

  return { config, issues };
}

function collectFieldIssues(collection: Collection, issues: ConfigIssue[]): void {
  if (collection.kind !== 'fields') return;
  const walk = (fields: Field[], prefix: string): void => {
    const names = new Set<string>();
    for (const field of fields) {
      const path = `${prefix}${field.name}`;
      if (names.has(field.name)) {
        issues.push({
          path,
          message: 'Duplicate field name in the same object.',
        });
      }
      names.add(field.name);
      if (field.widget === 'object' && !field.fields?.length) {
        issues.push({ path, message: 'An object field needs nested fields.' });
      }
      if (field.widget === 'list' && !field.fields?.length && !field.field) {
        issues.push({
          path,
          message: 'A list field needs either `fields` or `field`.',
        });
      }
      if (field.fields) walk(field.fields, `${path}.`);
    }
  };
  walk(collection.fields, `${collection.name}.`);

  if (collection.contentField) {
    const top = collection.fields.some((field) => field.name === collection.contentField);
    if (!top) {
      issues.push({
        path: `${collection.name}.contentField`,
        message: `No field named "${collection.contentField}".`,
      });
    }
  }
}
