// src/ai/functions/generateSqlSchemaWithTree.ts
export type Dialect = "postgres" | "mysql" | "sqlite" | "mssql";

export type SQLColumn = {
  name: string;
  type: string;
  constraints?: string[];
  description?: string;
};

export type SQLRelationship = {
  type: "one-to-one" | "one-to-many" | "many-to-many";
  targetTable: string;
  sourceColumn: string;
  targetColumn: string;
  description?: string;
};

export type SQLTable = {
  tableName: string;
  columns: SQLColumn[];
  relationships?: SQLRelationship[];
  description?: string;
  meta?: Record<string, any>;
};

export type SQLSchema = {
  tables: SQLTable[];
  tree?: {
    nodes?: Array<{ id: string; label: string; type?: string; meta?: any }>;
    edges?: Array<{ from: string; to: string; label?: string; meta?: any }>;
  };
};

export type GenerateSQLSchemaWithTreeArgs = {
  prompt: string;
  dialect?: Dialect;
  includeConstraints?: boolean;
  tables?: SQLTable[];
  buildTree?: boolean;
};

/**
 * A deterministic local generator / normalizer.
 * Keep this synchronous-ish (or async if you need).
 */
export async function generateSQLSchemaWithTree(
  args: GenerateSQLSchemaWithTreeArgs
): Promise<SQLSchema> {
  // Minimal implementation: if tables provided -> normalize; else throw so callers fall back to other heuristics
  if (!args || typeof args.prompt !== "string") {
    throw new Error("generateSQLSchemaWithTree requires { prompt }");
  }

  // If caller supplied tables, normalize types / constraints minimally
  if (Array.isArray(args.tables) && args.tables.length > 0) {
    const normalized = args.tables.map((t) => {
      const cols = (t.columns || []).map((c) => ({
        name: String(c.name || "").trim(),
        type: String(c.type || inferTypeFromName(String(c.name || ""))).trim(),
        constraints: Array.isArray(c.constraints) ? c.constraints.slice() : [],
        description: c.description || "",
      }));
      return {
        tableName: String(t.tableName || "").trim(),
        columns: cols,
        relationships: Array.isArray(t.relationships)
          ? t.relationships.slice()
          : [],
        description: t.description || "",
        meta: t.meta || {},
      } as SQLTable;
    });

    // Optionally add many-to-many join tables (simple)
    ensureJoinTablesForManyToMany(normalized);

    return { tables: normalized, tree: buildTreeForSchema(normalized) };
  }

  // Fallback: very small heuristic parse of prompt (you can expand this or call LLM again)
  // Here we return an empty schema to signal caller to do something smarter.
  // But in your service we use this function as a normalizer, so returning empty is acceptable
  // if you want to always auto-create, implement your heuristics here.
  return { tables: [], tree: { nodes: [], edges: [] } };
}

/* ---------- helper implementations (small & deterministic) ---------- */

function inferTypeFromName(colName: string): string {
  const n = (colName || "").toLowerCase();
  if (!n) return "VARCHAR(255)";
  if (n === "id") return "SERIAL";
  if (/_id$/.test(n)) return "INTEGER";
  if (/(created|updated)_at|timestamp|date|time/.test(n)) return "TIMESTAMP";
  if (/email/.test(n)) return "VARCHAR(150)";
  if (/name|title|label/.test(n)) return "VARCHAR(150)";
  if (/content|description|body|text/.test(n)) return "TEXT";
  if (/price|amount|total|cost/.test(n)) return "DECIMAL(12,2)";
  if (/qty|count|num|quantity/.test(n)) return "INTEGER";
  if (/is_|has_|flag_|active|enabled/.test(n)) return "BOOLEAN";
  return "VARCHAR(255)";
}

function ensureJoinTablesForManyToMany(tables: SQLTable[]) {
  const names = new Set(tables.map((t) => t.tableName));
  const additions: SQLTable[] = [];
  for (const t of tables) {
    for (const r of t.relationships || []) {
      if (r.type === "many-to-many") {
        const pair = [t.tableName, r.targetTable].sort();
        const joinName = `${pair[0]}_${pair[1]}_join`;
        if (names.has(joinName)) continue;
        additions.push({
          tableName: joinName,
          columns: [
            {
              name: "id",
              type: "SERIAL",
              constraints: ["PRIMARY KEY", "NOT NULL"],
            },
            {
              name: `${t.tableName}_id`,
              type: "INTEGER",
              constraints: ["NOT NULL"],
            },
            {
              name: `${r.targetTable}_id`,
              type: "INTEGER",
              constraints: ["NOT NULL"],
            },
          ],
          relationships: [
            {
              type: "one-to-many",
              targetTable: t.tableName,
              sourceColumn: `${t.tableName}_id`,
              targetColumn: "id",
            },
            {
              type: "one-to-many",
              targetTable: r.targetTable,
              sourceColumn: `${r.targetTable}_id`,
              targetColumn: "id",
            },
          ],
          description: `Join table for ${t.tableName} <-> ${r.targetTable}`,
        });
        names.add(joinName);
      }
    }
  }
  for (const a of additions) tables.push(a);
}

function buildTreeForSchema(tables: SQLTable[]) {
  const nodes: any[] = [];
  const edges: any[] = [];
  for (const t of tables) {
    nodes.push({
      id: `table:${t.tableName}`,
      label: t.tableName,
      type: "table",
    });
    for (const c of t.columns || []) {
      nodes.push({
        id: `column:${t.tableName}.${c.name}`,
        label: `${c.name} : ${c.type}`,
        type: "column",
      });
      edges.push({
        from: `table:${t.tableName}`,
        to: `column:${t.tableName}.${c.name}`,
        label: "has-column",
      });
    }
    for (const r of t.relationships || []) {
      edges.push({
        from: `table:${t.tableName}`,
        to: `table:${r.targetTable}`,
        label: r.type,
      });
    }
  }
  return { nodes, edges };
}

export default generateSQLSchemaWithTree;
