// src/services/anthropic-tool-runner-example.ts
import { EmitFilesTool, BuildTreeTool } from "./anthropic-tool-helpers";

type ToolDescriptor = {
  name: string;
  description: string;
  validateInput: (data: unknown) => any;
  validateOutput: (data: unknown) => any;
  run: (input: any) => Promise<any>;
};

// example registry
const toolRegistry: Record<string, ToolDescriptor> = {
  [EmitFilesTool.name]: EmitFilesTool,
  [BuildTreeTool.name]: BuildTreeTool,
};

// This function simulates receiving a tool call payload from Anthropic messages.toolRunner
export async function handleToolCall(toolName: string, rawInput: unknown) {
  const tool = toolRegistry[toolName];
  if (!tool) {
    return { error: `Unknown tool ${toolName}` };
  }

  try {
    // validate input (throws if invalid)
    const validatedInput = tool.validateInput(rawInput);

    // run the tool
    const output = await tool.run(validatedInput);

    // validate output (throws if invalid)
    const validatedOutput = tool.validateOutput(output);

    // return to tool runner: usually as JSON string or object
    return { ok: true, output: validatedOutput };
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) };
  }
}
