// src/services/sql.services.ts
import fs from "fs-extra";
import path from "path";
import { callModelWithFunctions } from "utils/aiClient"; // adjust if you don't use path alias
import {
  sqlSchemaToCytoscapeElements,
  SQLSchema as PublicSQLSchema,
  SQLTable as PublicSQLTable,
} from "../documents/sqlSchemaToCytoscapeElements";
import { renderCytoscapeHtml } from "../documents/docFlowchart.service";
import {
  generateSQLSchemaWithTree,
  SQLSchema as LocalSQLSchema,
} from "../documents/generateSqlSchemaWithTree";
import { renderSchemaHtml } from "./renderSqlSchemaHtml";
import { functionsSql } from "main/chats/schemas/ai/sqlschemas";

type GenerateSqlOptions = {
  dialect?: "postgres" | "mysql" | "sqlite" | "mssql";
  outDir?: string;
  maxTokens?: number;
  forceText?: boolean;
  prettyJson?: boolean;
  debug?: boolean;
};

export class SqlService {
  constructor(private baseOutDir = "generated_sql") {}

  public async generateSqlFromPrompt(
    userPrompt: string,
    projectId: string,
    opts: GenerateSqlOptions = {}
  ): Promise<{
    sqlPath: string;
    jsonPath: string;
    htmlPath: string;
    schema: PublicSQLSchema;
    sqlStatements: string[];
    debugFiles?: Record<string, string>;
  }> {
    const {
      dialect = "postgres",
      outDir = this.baseOutDir,
      maxTokens = 32768,
      forceText = false,
      prettyJson = true,
      debug = false,
    } = opts;

    if (!userPrompt || !projectId)
      throw new Error("userPrompt and projectId are required");
    if (debug) console.debug("[SqlService] start", { projectId });

    // Build project dir and ensure it exists (mkdirp once)
    const projectDir = path.join(outDir, sanitizeId(projectId));
    await fs.mkdirp(projectDir);

    // function schema

    const systemMsg =
      "You are a JSON-only assistant. When appropriate, call the function 'generate_sql_schema_with_tree' and place a JSON object in function_call.arguments. The object must contain a top-level `tables` array. Avoid any commentary in the function_call.arguments.";

    const messages = [
      { role: "system", content: systemMsg },
      { role: "user", content: userPrompt },
    ];

    if (debug)
      console.debug("[SqlService] calling model (function-calling)...");
    const aiRes = await callModelWithFunctions(
      messages,
      functionsSql as any,
      maxTokens,
      forceText
    );
    if (debug) console.debug("[SqlService] model returned");

    const choice = (aiRes as any)?.choices?.[0];

    // Write raw AI response using outputFile (creates parent dirs)
    const aiDebugPath = path.join(projectDir, "ai_raw_response.json");
    try {
      await fs.outputFile(aiDebugPath, JSON.stringify(aiRes, null, 2), "utf8");
      if (debug) console.debug("[SqlService] wrote ai_raw_response.json");
    } catch (err) {
      // Log but continue — debug files are optional
      console.warn("[SqlService] failed to write ai_raw_response.json", err);
    }

    // Extract parsed
    let parsed: any = null;
    try {
      parsed = extractParsedFromChoice(choice, debug);
    } catch (err) {
      if (debug)
        console.warn(
          "[SqlService] extraction from choice failed:",
          String(err)
        );
      parsed = null;
    }

    let normalizedSchema: PublicSQLSchema | null = null;

    // Prefer using local generator to normalize if possible
    const aiTables =
      parsed && Array.isArray(parsed.tables) ? parsed.tables : undefined;

    if (!aiTables || aiTables.length === 0) {
      if (debug)
        console.warn(
          "[SqlService] AI returned no tables — trying local generator and retries"
        );

      // 1) try local generator first
      try {
        const normalized = await generateSQLSchemaWithTree({
          prompt: userPrompt,
          dialect,
          includeConstraints: parsed?.includeConstraints ?? true,
          tables: parsed?.tables ?? undefined,
          buildTree: parsed?.buildTree ?? true,
        });
        if (
          normalized &&
          Array.isArray(normalized.tables) &&
          normalized.tables.length > 0
        ) {
          normalizedSchema = normalized as PublicSQLSchema;
          if (debug)
            console.debug(
              "[SqlService] local generator produced normalized schema"
            );
        } else {
          if (debug)
            console.warn("[SqlService] local generator returned empty tables");
        }
      } catch (err) {
        if (debug) console.warn("[SqlService] local generator threw:", err);
      }

      // 2) retry AI with strict JSON-only (forceText) if still no schema
      if (!normalizedSchema) {
        if (debug)
          console.debug(
            "[SqlService] retrying model with strict JSON-only (forceText = true)"
          );
        const retrySystem =
          'You are a JSON-only assistant. Reply with a single JSON object and no surrounding text. The JSON object must be { "tables": [ ... ] } and each table must include tableName and columns (name,type).';
        const retryMessages = [
          { role: "system", content: retrySystem },
          { role: "user", content: userPrompt },
        ];

        const retryRes = await callModelWithFunctions(
          retryMessages,
          functionsSql as any,
          maxTokens,
          true
        );
        const retryChoice = (retryRes as any)?.choices?.[0];

        const retryDebugPath = path.join(projectDir, "ai_retry_response.json");
        try {
          await fs.outputFile(
            retryDebugPath,
            JSON.stringify(retryRes, null, 2),
            "utf8"
          );
          if (debug) console.debug("[SqlService] wrote ai_retry_response.json");
        } catch (e) {
          console.warn(
            "[SqlService] failed to write ai_retry_response.json",
            e
          );
        }

        // parse retry response
        let retryParsed: any = null;
        try {
          const content =
            retryChoice?.message?.content ??
            retryChoice?.message?.text ??
            retryChoice?.content ??
            null;
          if (typeof content === "string") {
            const match = content.match(/({[\s\S]*}|\[[\s\S]*\])/);
            retryParsed = match ? JSON.parse(match[0]) : JSON.parse(content);
          } else {
            retryParsed = content;
          }
        } catch (err) {
          if (debug) console.warn("[SqlService] retry parse failed:", err);
          retryParsed = null;
        }

        if (
          retryParsed &&
          Array.isArray(retryParsed.tables) &&
          retryParsed.tables.length > 0
        ) {
          try {
            const normalized = await generateSQLSchemaWithTree({
              prompt: userPrompt,
              dialect,
              includeConstraints: retryParsed?.includeConstraints ?? true,
              tables: retryParsed.tables,
              buildTree: retryParsed?.buildTree ?? true,
            });
            if (
              normalized &&
              Array.isArray(normalized.tables) &&
              normalized.tables.length > 0
            ) {
              normalizedSchema = normalized as PublicSQLSchema;
              if (debug)
                console.debug(
                  "[SqlService] normalized from retryParsed via local generator"
                );
            }
          } catch (err) {
            if (debug)
              console.warn(
                "[SqlService] local generator normalization of retryParsed failed",
                err
              );
          }
        }
      }

      // 3) fallback heuristics if still not found
      if (!normalizedSchema) {
        if (debug)
          console.debug("[SqlService] falling back to prompt heuristics");
        const heurTables = inferTablesFromPrompt(userPrompt);
        if (heurTables.length > 0) {
          try {
            const normalized = await generateSQLSchemaWithTree({
              prompt: userPrompt,
              dialect,
              includeConstraints: true,
              tables: heurTables,
              buildTree: true,
            });
            if (
              normalized &&
              Array.isArray(normalized.tables) &&
              normalized.tables.length > 0
            ) {
              normalizedSchema = normalized as PublicSQLSchema;
              if (debug)
                console.debug(
                  "[SqlService] local generator normalized heuristics"
                );
            }
          } catch (err) {
            if (debug)
              console.warn(
                "[SqlService] local generator normalization of heuristics failed",
                err
              );
          }

          // save fallback heuristics to disk
          const fallbackPath = path.join(projectDir, "schema.fallback.json");
          try {
            await fs.outputFile(
              fallbackPath,
              JSON.stringify({ tables: heurTables }, null, 2),
              "utf8"
            );
            if (debug) console.debug("[SqlService] wrote schema.fallback.json");
          } catch (e) {
            console.warn(
              "[SqlService] failed to write schema.fallback.json",
              e
            );
          }
        } else {
          if (debug)
            console.warn("[SqlService] heuristics found no tables in prompt");
        }
      }
    } else {
      // parsed had tables -> normalize via local generator if possible
      try {
        const normalized = await generateSQLSchemaWithTree({
          prompt: userPrompt,
          dialect,
          includeConstraints: parsed?.includeConstraints ?? true,
          tables: parsed.tables,
          buildTree: parsed?.buildTree ?? true,
        });
        normalizedSchema = normalized as PublicSQLSchema;
      } catch (err) {
        if (debug)
          console.warn(
            "[SqlService] localGen failed to normalize AI tables, using parsed tables as-is",
            err
          );
        normalizedSchema = {
          tables: parsed.tables,
          tree: parsed.tree ?? undefined,
        };
      }
    }

    // final check
    if (
      !normalizedSchema ||
      !Array.isArray(normalizedSchema.tables) ||
      normalizedSchema.tables.length === 0
    ) {
      const details = { note: "All strategies failed", projectDir };
      console.error(
        "[SqlService] normalized schema is empty after all fallbacks",
        details
      );
      throw new Error(
        "Normalized schema is empty after processing AI output. See debug files in " +
          projectDir
      );
    }

    // write normalized schema (use outputFile to guarantee parents)
    const normalizedPath = path.join(projectDir, "schema.normalized.json");
    try {
      await fs.outputFile(
        normalizedPath,
        JSON.stringify(normalizedSchema, null, 2),
        "utf8"
      );
      if (debug) console.debug("[SqlService] wrote schema.normalized.json");
    } catch (err) {
      console.warn("[SqlService] failed to write schema.normalized.json", err);
    }

    const htmlPathData = path.join(projectDir, "schema.html");
    await renderSchemaHtml(
      normalizedSchema,
      htmlPathData,
      `SQL Schema — ${projectId}`
    );

    // build SQL statements and write outputs
    const sqlStatements = this.buildSqlStatements(normalizedSchema, {
      dialect,
      debug,
    });
    const sqlPath = path.join(projectDir, "schema.sql");
    const jsonPath = path.join(projectDir, "schema.json");
    const htmlPath = path.join(projectDir, "cyto_schema.html");

    try {
      await fs.outputFile(sqlPath, sqlStatements.join("\n\n"), "utf8");
      await fs.outputFile(
        jsonPath,
        prettyJson
          ? JSON.stringify(normalizedSchema, null, 2)
          : JSON.stringify(normalizedSchema),
        "utf8"
      );
    } catch (err) {
      console.error("[SqlService] failed to write sql/json files", err);
      throw err;
    }

    // cytoscape elements + html
    const elements = sqlSchemaToCytoscapeElements(
      normalizedSchema as PublicSQLSchema,
      { debug }
    );
    const html = renderCytoscapeHtml(
      JSON.stringify(elements),
      `SQL Schema — ${projectId}`
    );
    try {
      await fs.outputFile(htmlPath, html, "utf8");
    } catch (err) {
      console.warn("[SqlService] failed to write html file", err);
      throw err;
    }

    if (debug)
      console.debug("[SqlService] finished generation", {
        sqlPath,
        jsonPath,
        htmlPath,
      });

    return {
      sqlPath,
      jsonPath,
      htmlPath,
      schema: normalizedSchema as PublicSQLSchema,
      sqlStatements,
      debugFiles: { aiRaw: aiDebugPath, normalized: normalizedPath },
    };
  }

  private buildSqlStatements(
    schema: PublicSQLSchema,
    opts: { dialect?: string; debug?: boolean } = {}
  ) {
    const dialect = opts.dialect || "postgres";
    const debug = !!opts.debug;
    const q = (ident: string) => {
      if (!ident) return ident;
      if (dialect === "mysql") return `\`${ident}\``;
      if (dialect === "mssql") return `[${ident}]`;
      return `${ident}`;
    };

    const stmts: string[] = [];

    for (const table of schema.tables) {
      const cols = (table.columns || []).map((col) => {
        const parts = [];
        parts.push(`${q(col.name)}`);
        parts.push(col.type || "VARCHAR(255)");
        if (col.constraints && col.constraints.length)
          parts.push(col.constraints.join(" "));
        return "  " + parts.join(" ");
      });
      stmts.push(
        `CREATE TABLE ${q(table.tableName)} (\n${cols.join(",\n")}\n);`
      );
      if (debug) console.debug(`[SqlService] CREATE TABLE ${table.tableName}`);
    }

    for (const table of schema.tables) {
      for (const rel of table.relationships || []) {
        if (!rel.sourceColumn || !rel.targetColumn || !rel.targetTable)
          continue;
        const fkName = sanitizeId(
          `fk_${table.tableName}_${rel.targetTable}_${rel.sourceColumn}`
        );
        const stmt = `ALTER TABLE ${q(table.tableName)} ADD CONSTRAINT ${q(
          fkName
        )} FOREIGN KEY (${q(rel.sourceColumn)}) REFERENCES ${q(
          rel.targetTable
        )}(${q(rel.targetColumn)});`;
        stmts.push(stmt);
        if (debug) console.debug(`[SqlService] FK: ${stmt}`);
      }
    }

    return stmts;
  }
}

/* helpers */
function sanitizeId(input: string) {
  if (!input) return "";
  return input
    .toString()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_\-.:]/g, "")
    .toLowerCase();
}

function extractParsedFromChoice(choice: any, debug = false): any | null {
  if (!choice) return null;
  const funcArgs = choice.message?.function_call?.arguments;
  if (funcArgs) {
    if (typeof funcArgs === "string") {
      try {
        return JSON.parse(funcArgs);
      } catch (err) {
        const match = funcArgs.match(/({[\s\S]*}|\[[\s\S]*\])/);
        if (match) return JSON.parse(match[0]);
        throw err;
      }
    } else {
      return funcArgs;
    }
  }
  const content =
    choice.message?.content ?? choice.message?.text ?? choice.content ?? null;
  if (!content) return null;
  if (typeof content === "string") {
    try {
      return JSON.parse(content);
    } catch (err) {
      const match = content.match(/({[\s\S]*}|\[[\s\S]*\])/);
      if (match) return JSON.parse(match[0]);
      if (debug) console.warn("[extractParsedFromChoice] no JSON in content");
      return null;
    }
  }
  return content;
}

function inferTablesFromPrompt(prompt: string): PublicSQLTable[] {
  const text = (prompt || "").replace(/\s+/g, " ");
  const regex = /([A-Za-z0-9_]+)\s*\(\s*([^)]+)\s*\)/g;
  const tables: PublicSQLTable[] = [];
  let m;
  while ((m = regex.exec(text))) {
    const name = m[1];
    const cols = m[2]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (name && cols.length) {
      tables.push({
        tableName: name,
        columns: cols.map((c) => ({
          name: c,
          type: inferTypeFromName(c, "postgres"),
        })),
      });
    }
  }

  if (tables.length === 0) {
    const regex2 =
      /(create (a )?table|create tables?)\s+([a-zA-Z0-9_]+)\s+(with|having|containing)\s+([^.;]+)/gi;
    while ((m = regex2.exec(text))) {
      const tName = m[3];
      const rest = (m[5] || "").split(/\.|;| and /i)[0];
      const cols = rest
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (tName && cols.length) {
        tables.push({
          tableName: tName,
          columns: cols.map((c: string) => ({
            name: c.replace(/\s+as\s+.*$/i, "").trim(),
            type: inferTypeFromName(c, "postgres"),
          })),
        });
      }
    }
  }

  return tables;
}

function inferTypeFromName(colName: string, dialect: string) {
  const n = (colName || "").toLowerCase();
  if (!n) return "VARCHAR(255)";
  if (n === "id") return dialect === "postgres" ? "SERIAL" : "INTEGER";
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
