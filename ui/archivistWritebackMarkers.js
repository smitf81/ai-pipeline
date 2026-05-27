const ARCHIVIST_WRITEBACK_START = '<!-- archivist-writeback:start -->';
const ARCHIVIST_WRITEBACK_END = '<!-- archivist-writeback:end -->';

function extractArchivistWritebackBlock(markdown = '') {
  const text = String(markdown || '');
  const start = text.indexOf(ARCHIVIST_WRITEBACK_START);
  if (start < 0) return '';
  const end = text.indexOf(ARCHIVIST_WRITEBACK_END, start);
  if (end < 0) return '';
  return text.slice(start, end + ARCHIVIST_WRITEBACK_END.length);
}

function upsertArchivistWritebackBlock(markdown = '', blockLines = [], options = {}) {
  const trimmedLines = (Array.isArray(blockLines) ? blockLines : [])
    .map((line) => String(line || '').trimEnd())
    .filter(Boolean);
  const block = trimmedLines.length
    ? [
        ARCHIVIST_WRITEBACK_START,
        ...trimmedLines,
        ARCHIVIST_WRITEBACK_END,
      ].join('\n')
    : '';
  const text = String(markdown || '').trimEnd();
  const existingBlock = extractArchivistWritebackBlock(text);
  if (existingBlock) {
    return `${text.replace(existingBlock, block).trimEnd()}\n`;
  }
  if (!block) return text ? `${text}\n` : '';
  const sectionHeading = String(options.sectionHeading || '').trim();
  const suffix = sectionHeading ? `${sectionHeading}\n\n${block}` : block;
  return text ? `${text}\n\n${suffix}\n` : `${suffix}\n`;
}

module.exports = {
  ARCHIVIST_WRITEBACK_END,
  ARCHIVIST_WRITEBACK_START,
  extractArchivistWritebackBlock,
  upsertArchivistWritebackBlock,
};
