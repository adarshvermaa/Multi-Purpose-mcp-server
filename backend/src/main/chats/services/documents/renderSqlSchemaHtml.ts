// src/utils/renderSqlSchemaHtml.ts
import fs from "fs-extra";

/**
 * Generate HTML for a single table with better UI/UX
 */
export function createTableCard(table: any): string {
  const columnsRows = table.columns
    .map(
      (col: any) => `
    <tr class="hover:bg-gray-50 transition">
      <td class="border px-3 py-2 font-medium">${col.name}</td>
      <td class="border px-3 py-2">
        <span class="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded">${
          col.type
        }</span>
      </td>
      <td class="border px-3 py-2 text-gray-600">${col.description || "-"}</td>
    </tr>
  `
    )
    .join("\n");

  const relationships =
    table.relationships && table.relationships.length
      ? `<details class="mt-3">
           <summary class="font-semibold text-gray-700 cursor-pointer">Relationships (${
             table.relationships.length
           })</summary>
           <ul class="list-disc list-inside text-gray-600 mt-1">
             ${table.relationships
               .map(
                 (r: any) =>
                   `<li><span class="font-medium">${r.type}</span> → <span class="text-blue-600">${r.targetTable}</span></li>`
               )
               .join("\n")}
           </ul>
         </details>`
      : "";

  return `
    <div class="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all">
      <h2 class="text-2xl font-bold mb-4 text-indigo-600">${table.tableName}</h2>
      <table class="w-full border border-gray-300 text-sm table-auto">
        <thead class="bg-gray-100">
          <tr>
            <th class="border px-3 py-2 text-left">Column Name</th>
            <th class="border px-3 py-2 text-left">Type</th>
            <th class="border px-3 py-2 text-left">Description</th>
          </tr>
        </thead>
        <tbody>
          ${columnsRows}
        </tbody>
      </table>
      ${relationships}
    </div>
  `;
}

/**
 * Generate full HTML page for SQL schema with responsive design
 */
export async function renderSchemaHtml(
  schema: any,
  filePath: string,
  pageTitle = "Database Schema"
) {
  const tablesHtml = schema.tables.map(createTableCard).join("\n");

  const fullHtml = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${pageTitle}</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-gray-50 text-gray-800 font-sans">
    <div class="container mx-auto p-6">
      <h1 class="text-4xl font-extrabold mb-8 text-center text-gray-800">${pageTitle}</h1>
      <div class="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        ${tablesHtml}
      </div>
    </div>
  </body>
  </html>
  `;

  await fs.writeFile(filePath, fullHtml, "utf8");
  return filePath;
}
