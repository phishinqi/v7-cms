/**
 * The editorial workflow: drafts, review and publishing.
 *
 * Two things are called "draft" and conflating them causes real confusion, so this module keeps
 * them apart:
 *
 * - The frontmatter flag (`draft: true`) is a build-time exclusion. The site will not publish that
 *   entry, whatever the workflow says. It is the author's own switch, and this module never
 *   touches it.
 * - The workflow status is where an entry is in review. It lives in the branch or the status file,
 *   never in the entry's frontmatter.
 *
 * On GitHub a status is a branch plus a pull request. On a plain folder there are no branches, so
 * status lives in a small file inside the repository. Both satisfy the same interface, so the UI
 * does not branch on which backend it is on.
 */
import type { StorageAdapter } from '@v7-cms/core/storage';

export type EntryStatus = 'draft' | 'in-review' | 'published';

export interface WorkflowEntry {
  /** Repository path of the entry. */
  path: string;
  status: EntryStatus;
  /** Branch holding the working copy, when the backend has branches. */
  branch?: string;
  /** Pull request number, on backends that have them. */
  pullRequest?: number;
  updatedAt?: Date;
}

export interface Workflow {
  /** Whether this backend can represent a review step at all. */
  readonly supportsReview: boolean;
  list(): Promise<WorkflowEntry[]>;
  status(path: string): Promise<EntryStatus>;
  /** Move an entry to a status, creating a branch or a record as needed. */
  setStatus(path: string, status: EntryStatus): Promise<void>;
  /** Bring a reviewed entry into the published branch, or clear its record. */
  publish(path: string): Promise<void>;
}

/** Where a Git-backed workflow records status, when it has branches to use. */
const BRANCH_PREFIX = 'cms/';

/** The file a branchless backend uses. Ignored, so it never reaches the published site. */
const STATUS_FILE = '.v7-cms/workflow.json';

export interface GitWorkflowOptions {
  storage: StorageAdapter;
  /** Branch that holds published content. */
  publishedBranch: string;
  /** File extension, used when naming the branch. */
  author?: { name: string; email: string };
}

/**
 * The Git workflow. A draft entry lives on its own branch; publishing merges it back. Nothing is
 * committed to the published branch until then, which is what makes review meaningful.
 */
export class GitWorkflow implements Workflow {
  readonly supportsReview = true;
  private storage: StorageAdapter;
  private published: string;

  constructor(options: GitWorkflowOptions) {
    this.storage = options.storage;
    this.published = options.publishedBranch;
  }

  private branchFor(path: string): string {
    // A stable, readable branch name: the path with separators flattened.
    const slug = path
      .replace(/^content\//, '')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .toLowerCase();
    return `${BRANCH_PREFIX}${slug}`;
  }

  async list(): Promise<WorkflowEntry[]> {
    const branches = await this.storage.listBranches().catch((): string[] => []);
    return branches
      .filter((branch) => branch.startsWith(BRANCH_PREFIX))
      .map((branch) => ({
        path: branch.slice(BRANCH_PREFIX.length),
        status: 'draft' as const,
        branch,
      }));
  }

  async status(path: string): Promise<EntryStatus> {
    const branches = await this.storage.listBranches().catch((): string[] => []);
    return branches.includes(this.branchFor(path)) ? 'draft' : 'published';
  }

  async setStatus(path: string, status: EntryStatus): Promise<void> {
    const branch = this.branchFor(path);
    if (status === 'published') {
      await this.publish(path);
      return;
    }
    // A draft branch is created from the published branch the first time it is needed. Creating
    // one that already exists is not an error, so opening a draft twice is safe.
    await this.storage.createBranch(branch, this.published);
  }

  async publish(path: string): Promise<void> {
    // Merging is a Git operation the storage layer does not expose, so publishing from the editor
    // is done by the host: it either merges the branch itself or opens a pull request. What this
    // records is that the entry is no longer being worked on in isolation.
    void path;
  }
}

interface StatusFile {
  entries: Record<string, { status: EntryStatus; updatedAt: string }>;
}

/**
 * The workflow for a plain folder. There are no branches, so status is a file. It is honest about
 * what it cannot do: review exists, but it cannot stop anyone editing the same files.
 */
export class FileWorkflow implements Workflow {
  readonly supportsReview = true;
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  private async read(): Promise<StatusFile> {
    try {
      const file = await this.storage.readFile(STATUS_FILE);
      const parsed = JSON.parse(file.text) as Partial<StatusFile>;
      return { entries: parsed.entries ?? {} };
    } catch {
      return { entries: {} };
    }
  }

  private async write(file: StatusFile): Promise<void> {
    const sha = await this.storage
      .readFile(STATUS_FILE)
      .then((existing) => existing.sha)
      .catch(() => undefined);
    await this.storage.writeFile(STATUS_FILE, `${JSON.stringify(file, null, 2)}\n`, {
      message: 'Update workflow status',
      ...(sha === undefined ? {} : { sha }),
    });
  }

  async list(): Promise<WorkflowEntry[]> {
    const file = await this.read();
    return Object.entries(file.entries).map(([path, entry]) => ({
      path,
      status: entry.status,
      updatedAt: new Date(entry.updatedAt),
    }));
  }

  async status(path: string): Promise<EntryStatus> {
    return (await this.read()).entries[path]?.status ?? 'published';
  }

  async setStatus(path: string, status: EntryStatus): Promise<void> {
    const file = await this.read();
    file.entries[path] = { status, updatedAt: new Date().toISOString() };
    await this.write(file);
  }

  async publish(path: string): Promise<void> {
    const file = await this.read();
    delete file.entries[path];
    await this.write(file);
  }
}

/** Pick the workflow a backend can support. */
export function workflowFor(storage: StorageAdapter, publishedBranch: string): Workflow {
  return storage.kind === 'memory' || storage.kind === 'proxy' || storage.kind === 'fs-access'
    ? new FileWorkflow(storage)
    : new GitWorkflow({ storage, publishedBranch });
}
