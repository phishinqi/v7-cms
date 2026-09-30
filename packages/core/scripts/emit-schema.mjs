// Writes the JSON Schema that `$schema` in a consumer's cms.config.json points at.
//
// It is derived from the same zod definition the loader validates with, so it cannot describe a
// config the editor would reject. Until now that path was referenced by the example config and
// never generated, so an author copying the example got a dangling reference and no completion.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import prettier from 'prettier';
import { configSchema } from '../src/config-load.ts';

const target = resolve(import.meta.dirname, '../schema/config.json');

const jsonSchema = z.toJSONSchema(configSchema, {
  target: 'draft-2020-12',
  io: 'input',
});

const document = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'v7-cms configuration',
  description: 'The file passed to mount(). See docs/configuration.md for the prose version.',
  ...jsonSchema,
};

await mkdir(dirname(target), { recursive: true });
// Formatted with the repository's prettier config: `format:check` covers this file, so a generator
// whose output the formatter would rewrite fails the build it feeds.
const options = (await prettier.resolveConfig(target)) ?? {};
await writeFile(
  target,
  await prettier.format(JSON.stringify(document), { ...options, filepath: target }),
);
console.log(`wrote ${target}`);
