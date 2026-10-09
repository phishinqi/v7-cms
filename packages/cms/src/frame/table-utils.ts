export type TableFormat = 'gfm' | 'html';

export interface TableConfig {
  format: TableFormat;
  rows: number;
  columns: number;
  hasHeader: boolean;
}

export function normalizeTableConfig(config: TableConfig): TableConfig {
  return {
    ...config,
    rows: Math.min(20, Math.max(1, Math.floor(config.rows) || 1)),
    columns: Math.min(12, Math.max(1, Math.floor(config.columns) || 1)),
  };
}

export function tableMarkdown(config: TableConfig): string {
  const value = normalizeTableConfig(config);
  const emptyRow = `| ${Array.from({ length: value.columns }, () => '').join(' | ')} |`;
  const rows: string[] = [];
  if (value.hasHeader) {
    rows.push(
      `| ${Array.from({ length: value.columns }, (_, i) => `标题 ${i + 1}`).join(' | ')} |`,
    );
    rows.push(`| ${Array.from({ length: value.columns }, () => '---').join(' | ')} |`);
  }
  rows.push(...Array.from({ length: value.rows - (value.hasHeader ? 1 : 0) }, () => emptyRow));
  return rows.join('\n');
}

export function tableHtml(config: TableConfig): string {
  const value = normalizeTableConfig(config);
  const row = (tag: 'td' | 'th') =>
    `    <tr>${Array.from(
      { length: value.columns },
      (_, column) => `<${tag}>${tag === 'th' ? `标题 ${column + 1}` : ''}</${tag}>`,
    ).join('')}</tr>`;
  const header = value.hasHeader ? `  <thead>\n${row('th')}\n  </thead>\n` : '';
  const bodyRows = Math.max(0, value.rows - (value.hasHeader ? 1 : 0));
  return `<table>\n${header}  <tbody>\n${Array.from({ length: bodyRows }, () => row('td')).join('\n')}\n  </tbody>\n</table>`;
}

export function tableText(config: TableConfig): string {
  return config.format === 'html' ? tableHtml(config) : tableMarkdown(config);
}
