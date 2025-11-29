// src/documents/sqlSchemaToCytoscapeElements.ts
// Converts normalized SQL schema to Cytoscape elements.
// Includes lightweight safeId and debug logging support.

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

/**
 * Lightweight safeId - ensure id is a valid DOM/Cytoscape id.
 * If you already have a utils.safeId, swap this out.
 */
export function safeId(input: string) {
  if (!input) return "";
  return input
    .toString()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_\-:.]/g, "")
    .replace(/^[-:.]+|[-:.]+$/g, "")
    .toLowerCase();
}

export type ToCyOptions = {
  debug?: boolean;
};

/**
 * Convert SQLSchema into Cytoscape-compatible elements.
 * - Table nodes: data.id = safeId("table:<tableName>")
 * - Column nodes: data.id = safeId("column:<table>.<col>")
 * - Edges table->column (has-column)
 * - Edges table->table for relationships (label = rel.type)
 * - Optional column->column fk edges (label = "fk")
 */
export function sqlSchemaToCytoscapeElements(
  schema: SQLSchema,
  opts: ToCyOptions = {}
): Array<any> {
  const { debug = false } = opts;
  if (debug)
    console.debug(
      "[sqlSchemaToCytoscapeElements] input schema:",
      JSON.stringify(schema, null, 2)
    );

  const elements: Array<any> = [];
  if (!schema || !Array.isArray(schema.tables)) return elements;

  const tableNodeId = (tableName: string) => safeId(`table:${tableName}`);
  const columnNodeId = (tableName: string, colName: string) =>
    safeId(`column:${tableName}.${colName}`);

  // create nodes for tables and columns
  for (const table of schema.tables) {
    const tId = tableNodeId(table.tableName);
    elements.push({
      data: {
        id: tId,
        label: table.tableName,
        type: "table",
        targetId: table.tableName,
        title: table.tableName,
        description: table.description || "",
        meta: table.meta || {},
        columns_count: (table.columns || []).length,
      },
    });

    for (const col of table.columns || []) {
      const cId = columnNodeId(table.tableName, col.name);
      elements.push({
        data: {
          id: cId,
          label: `${col.name} : ${col.type}`,
          type: "column",
          parentTable: table.tableName,
          columnName: col.name,
          columnType: col.type,
          constraints: col.constraints || [],
          description: col.description || "",
          targetId: `${table.tableName}.${col.name}`,
        },
      });

      // edge table -> column
      elements.push({
        data: {
          id: safeId(`${tId}__hascol__${cId}`),
          source: tId,
          target: cId,
          label: "has-column",
        },
      });
    }
  }

  // add relationship edges and optional column-level fk edges
  for (const table of schema.tables) {
    const fromId = tableNodeId(table.tableName);
    for (const rel of table.relationships || []) {
      const toId = tableNodeId(rel.targetTable);
      const relEdgeId = safeId(`${fromId}--rel--${toId}--${rel.type}`);

      elements.push({
        data: {
          id: relEdgeId,
          source: fromId,
          target: toId,
          label: rel.type,
          relationship: rel,
        },
      });

      // add column->column FK edge if both columns can be found
      const srcCol = (table.columns || []).find(
        (c) => c.name === rel.sourceColumn
      );
      const tgtTable = schema.tables.find(
        (t) => t.tableName === rel.targetTable
      );
      const tgtCol = tgtTable
        ? (tgtTable.columns || []).find((c) => c.name === rel.targetColumn)
        : undefined;

      if (srcCol && tgtCol && tgtTable) {
        const srcCid = columnNodeId(table.tableName, srcCol.name);
        const tgtCid = columnNodeId(tgtTable.tableName, tgtCol.name);
        elements.push({
          data: {
            id: safeId(`${srcCid}--fk--${tgtCid}`),
            source: srcCid,
            target: tgtCid,
            label: "fk",
            relationship: rel,
          },
        });
      }
    }
  }

  // merge AI-provided tree nodes/edges if present (avoid duplicates)
  if (schema.tree) {
    for (const n of schema.tree.nodes || []) {
      const id = safeId(n.id || n.label || JSON.stringify(n));
      if (!elements.some((el) => el.data && el.data.id === id)) {
        elements.push({
          data: {
            id,
            label: n.label || id,
            type: n.type || "node",
            meta: n.meta || {},
          },
        });
      }
    }
    for (const e of schema.tree.edges || []) {
      const from = safeId(e.from);
      const to = safeId(e.to);
      const id = safeId(`${from}--tree--${to}--${e.label || ""}`);
      if (!elements.some((el) => el.data && el.data.id === id)) {
        elements.push({
          data: {
            id,
            source: from,
            target: to,
            label: e.label || "",
            meta: e.meta || {},
          },
        });
      }
    }
  }

  // deduplicate by data.id
  const seen = new Set<string>();
  const unique: Array<any> = [];
  for (const el of elements) {
    const did =
      el && el.data && el.data.id ? String(el.data.id) : JSON.stringify(el);
    if (!seen.has(did)) {
      seen.add(did);
      unique.push(el);
    }
  }

  if (debug)
    console.debug(
      "[sqlSchemaToCytoscapeElements] produced elements:",
      unique.length
    );
  return unique;
}

export default sqlSchemaToCytoscapeElements;
