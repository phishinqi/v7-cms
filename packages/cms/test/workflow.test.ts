/**
 * The editorial workflow.
 *
 * The distinction these tests exist to protect: the frontmatter `draft` flag is a build-time
 * exclusion the author controls, while the workflow status is where an entry is in review. They
 * are independent, and the workflow must never write to frontmatter.
 */
import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '@v7-cms/adapters/memory';
import { FileWorkflow, GitWorkflow, workflowFor } from '../src/workflow/index.js';

const ENTRY = 'content/posts/start-here.md';
const POST = '---\ntitle: Start here\nslug: start-here\ndraft: false\n---\n\nBody.\n';

describe('workflow on a plain folder', () => {
  const make = () => new FileWorkflow(new MemoryAdapter({ [ENTRY]: POST }));

  it('treats an unrecorded entry as published', async () => {
    expect(await make().status(ENTRY)).toBe('published');
    expect(await make().list()).toEqual([]);
  });

  it('records a draft and reads it back', async () => {
    const workflow = make();
    await workflow.setStatus(ENTRY, 'draft');
    expect(await workflow.status(ENTRY)).toBe('draft');
    expect((await workflow.list()).map((entry) => entry.path)).toEqual([ENTRY]);
  });

  it('records review as a separate status', async () => {
    const workflow = make();
    await workflow.setStatus(ENTRY, 'in-review');
    expect(await workflow.status(ENTRY)).toBe('in-review');
  });

  it('clears the record on publish', async () => {
    const workflow = make();
    await workflow.setStatus(ENTRY, 'draft');
    await workflow.publish(ENTRY);
    expect(await workflow.status(ENTRY)).toBe('published');
    expect(await workflow.list()).toEqual([]);
  });

  it('keeps its record out of the content', async () => {
    const storage = new MemoryAdapter({ [ENTRY]: POST });
    const workflow = new FileWorkflow(storage);
    await workflow.setStatus(ENTRY, 'draft');
    // The entry itself is untouched: status never lands in frontmatter.
    expect(storage.snapshot()[ENTRY]).toBe(POST);
    expect(Object.keys(storage.snapshot())).toContain('.v7-cms/workflow.json');
  });

  it('survives a corrupted status file rather than failing', async () => {
    const storage = new MemoryAdapter({ [ENTRY]: POST, '.v7-cms/workflow.json': 'not json' });
    const workflow = new FileWorkflow(storage);
    expect(await workflow.status(ENTRY)).toBe('published');
    await expect(workflow.setStatus(ENTRY, 'draft')).resolves.toBeUndefined();
  });

  it('tracks several entries independently', async () => {
    const workflow = make();
    await workflow.setStatus(ENTRY, 'draft');
    await workflow.setStatus('content/posts/other.md', 'in-review');
    const byPath = Object.fromEntries((await workflow.list()).map((e) => [e.path, e.status]));
    expect(byPath).toEqual({ [ENTRY]: 'draft', 'content/posts/other.md': 'in-review' });
  });
});

describe('workflow on a Git backend', () => {
  const make = () => {
    const storage = new MemoryAdapter({ [ENTRY]: POST });
    return { storage, workflow: new GitWorkflow({ storage, publishedBranch: 'main' }) };
  };

  it('reports an entry with no branch as published', async () => {
    const { workflow } = make();
    expect(await workflow.status(ENTRY)).toBe('published');
  });

  it('creates a branch on the first draft and reuses it afterwards', async () => {
    const { storage, workflow } = make();
    await workflow.setStatus(ENTRY, 'draft');
    const branches = await storage.listBranches();
    expect(branches).toContain('cms/posts-start-here');
    // Opening the draft again must not fail.
    await expect(workflow.setStatus(ENTRY, 'draft')).resolves.toBeUndefined();
    expect(await workflow.status(ENTRY)).toBe('draft');
  });

  it('names the branch from the path, not the title', async () => {
    const { workflow } = make();
    await workflow.setStatus('content/albums/city-corners.md', 'draft');
    expect((await workflow.list()).map((entry) => entry.branch)).toEqual([
      'cms/albums-city-corners',
    ]);
  });

  it('says it supports review, unlike a workflow with no branches to use', async () => {
    const { workflow } = make();
    expect(workflow.supportsReview).toBe(true);
  });
});

describe('choosing a workflow', () => {
  it('gives a folder backend the file workflow', () => {
    for (const kind of ['memory', 'proxy', 'fs-access'] as const) {
      const storage = new MemoryAdapter({});
      Object.defineProperty(storage, 'kind', { value: kind });
      expect(workflowFor(storage, 'main')).toBeInstanceOf(FileWorkflow);
    }
  });

  it('gives a Git backend the branch workflow', () => {
    const storage = new MemoryAdapter({});
    Object.defineProperty(storage, 'kind', { value: 'github' });
    expect(workflowFor(storage, 'main')).toBeInstanceOf(GitWorkflow);
  });
});
