export const functionsSql = [
  {
    name: "generate_sql_schema_with_tree",
    description:
      "Generate SQL tables with full schema, relationships, and a tree structure for visualization.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        dialect: {
          type: "string",
          enum: ["postgres", "mysql", "sqlite", "mssql"],
        },
        includeConstraints: { type: "boolean" },
        tables: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tableName: { type: "string" },
              columns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    type: { type: "string" },
                    constraints: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  required: ["name", "type"],
                },
              },
              relationships: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["one-to-one", "one-to-many", "many-to-many"],
                    },
                    targetTable: { type: "string" },
                    sourceColumn: { type: "string" },
                    targetColumn: { type: "string" },
                  },
                  required: [
                    "type",
                    "targetTable",
                    "sourceColumn",
                    "targetColumn",
                  ],
                },
              },
            },
            required: ["tableName", "columns"],
          },
        },
        buildTree: { type: "boolean" },
      },
      required: ["prompt"],
    },
  },
];
