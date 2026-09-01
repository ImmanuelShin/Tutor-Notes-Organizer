/** Parse a Google Sheets / Excel copy as a grid. Tabs first; commas if there are no tabs. */

export function parseClipboardTable(text: string): string[][] {
  const normalized = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  if (!normalized.trim()) return [];
  const delimiter = normalized.includes("\t") ? "\t" : ",";
  const rows = parseDelimited(normalized, delimiter);
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return rows
    .map((row) => Array.from({ length: width }, (_, i) => String(row[i] ?? "").replace(/\u00a0/g, " ").trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };

  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      pushCell();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushCell();
      pushRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }

  if (inQuotes || cell.length > 0 || row.length > 0) {
    pushCell();
    if (row.some((c) => c.length > 0) || inQuotes) pushRow();
  }

  return rows;
}

export function columnLabel(index: number, header: string, firstRowIsHeaders: boolean): string {
  const letter = columnLetter(index);
  if (firstRowIsHeaders && header.trim()) return header.trim();
  return `Column ${letter}`;
}

function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
