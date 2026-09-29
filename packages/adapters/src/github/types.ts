/** The shape the trees API returns, shared by the adapter and its test double. */
export interface TreeEntry {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}
