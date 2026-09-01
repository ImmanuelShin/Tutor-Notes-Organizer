export type TableRow = {
  topic: string;
  unit: string;
  learningGoal: string;
  example: string;
};

export type DetectedTable = {
  subject: string;
  headerRowIndex: number;
  rows: TableRow[];
  uniqueTopics: number;
};

type ColMap = {
  topic?: number;
  unit?: number;
  goal?: number;
  example?: number;
};

function cellAt(row: string[] | undefined, index: number | undefined): string {
  if (index === undefined || !row) return "";
  return String(row[index] ?? "").trim();
}

export function isBlankRow(row: string[] | undefined): boolean {
  return !row || row.every((c) => !String(c).trim());
}

function nonEmptyCells(row: string[] | undefined): string[] {
  if (!row) return [];
  return row.map((c) => String(c).trim()).filter(Boolean);
}

function matchHeaderCell(raw: string): keyof ColMap | null {
  const h = raw.toLowerCase().trim();
  if (!h) return null;
  if (h === "topic" || h === "topics" || h === "title") return "topic";
  if (
    h === "unit" ||
    h === "units" ||
    h.includes("sub-unit") ||
    h.includes("subunit") ||
    h.includes("sub unit") ||
    h === "section"
  ) {
    return "unit";
  }
  if (h.includes("learning goal") || h.includes("learning-goal") || h.includes("objective")) {
    return "goal";
  }
  if (h === "goal" || h === "goals" || h.endsWith(" goals")) return "goal";
  if (h.includes("example") || h.includes("problem") || h.includes("exercise")) return "example";
  return null;
}

export function parseHeaderRow(row: string[] | undefined): ColMap | null {
  if (!row) return null;
  const map: ColMap = {};
  row.forEach((value, index) => {
    const kind = matchHeaderCell(value);
    if (kind && map[kind] === undefined) map[kind] = index;
  });
  const hits = [map.topic, map.unit, map.goal, map.example].filter((v) => v !== undefined).length;
  if (map.topic !== undefined && hits >= 2) return map;
  return null;
}

function isBannerRow(row: string[] | undefined): boolean {
  const cells = nonEmptyCells(row);
  if (cells.length !== 1) return false;
  return matchHeaderCell(cells[0]) === null;
}

function nextNonEmpty(grid: string[][], from: number): number {
  for (let i = from; i < grid.length; i++) {
    if (!isBlankRow(grid[i])) return i;
  }
  return -1;
}

function startsNewTable(grid: string[][], rowIndex: number): boolean {
  const row = grid[rowIndex];
  if (parseHeaderRow(row)) return true;
  if (!isBannerRow(row)) return false;
  const next = nextNonEmpty(grid, rowIndex + 1);
  return next >= 0 && parseHeaderRow(grid[next]) !== null;
}

export function topicKey(subject: string, title: string): string {
  return `${subject.trim().toLowerCase()}::${title.trim().toLowerCase()}`;
}

export function detectStackedTables(grid: string[][], sheetName: string): DetectedTable[] {
  const tables: DetectedTable[] = [];
  let i = 0;

  while (i < grid.length) {
    if (isBlankRow(grid[i])) {
      i += 1;
      continue;
    }

    let subject = sheetName.trim() || "Unsorted";
    let headerIdx = -1;
    let colMap: ColMap | null = null;

    const headerHere = parseHeaderRow(grid[i]);
    if (headerHere) {
      headerIdx = i;
      colMap = headerHere;
    } else if (isBannerRow(grid[i])) {
      const next = nextNonEmpty(grid, i + 1);
      const headerNext = next >= 0 ? parseHeaderRow(grid[next]) : null;
      if (headerNext) {
        subject = nonEmptyCells(grid[i])[0] ?? subject;
        headerIdx = next;
        colMap = headerNext;
      }
    }

    if (headerIdx < 0 || !colMap) {
      i += 1;
      continue;
    }

    const rows: TableRow[] = [];
    let lastTopic = "";
    let lastUnit = "";
    let j = headerIdx + 1;
    let blankRun = 0;

    while (j < grid.length) {
      const row = grid[j] ?? [];
      if (isBlankRow(row)) {
        blankRun += 1;
        if (blankRun >= 2) break;
        j += 1;
        continue;
      }
      blankRun = 0;

      if (startsNewTable(grid, j)) break;

      const topicRaw = cellAt(row, colMap.topic);
      const unitRaw = cellAt(row, colMap.unit);
      const learningGoal = cellAt(row, colMap.goal);
      const example = cellAt(row, colMap.example);

      if (topicRaw) {
        lastTopic = topicRaw;
        lastUnit = unitRaw;
      } else if (unitRaw) {
        lastUnit = unitRaw;
      }

      const topic = topicRaw || lastTopic;
      const unit = unitRaw || lastUnit;
      if (topic || unit || learningGoal || example) {
        rows.push({ topic, unit, learningGoal, example });
      }
      j += 1;
    }

    const filled = rows.filter((r) => r.topic);
    if (filled.length) {
      const uniqueTopics = new Set(filled.map((r) => r.topic.toLowerCase())).size;
      tables.push({
        subject,
        headerRowIndex: headerIdx,
        rows: filled,
        uniqueTopics,
      });
    }
    i = Math.max(j, headerIdx + 1);
  }

  return tables;
}

export type TopicImportEntry = {
  subject: string;
  title: string;
  unit: string;
  learningGoal: string;
  example: string;
  assessment: string;
};

export function flattenTables(tables: DetectedTable[]): TopicImportEntry[] {
  return tables.flatMap((table) =>
    table.rows.map((row) => ({
      subject: table.subject,
      title: row.topic,
      unit: row.unit,
      learningGoal: row.learningGoal,
      example: row.example,
      assessment: "",
    })),
  );
}

export function subjectGroupLabel(subject: string | null | undefined): string {
  return (subject ?? "").trim() || "Unsorted";
}

export function groupTopicsBySubject<T extends { subject: string }>(
  items: T[],
): { label: string; items: T[] }[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const item of items) {
    const label = subjectGroupLabel(item.subject);
    if (!map.has(label)) {
      order.push(label);
      map.set(label, []);
    }
    map.get(label)!.push(item);
  }
  return order.map((label) => ({ label, items: map.get(label)! }));
}

