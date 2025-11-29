import { PROJECT_FUNCTIONS } from "main/chats/schemas/ai/code.bulder";
import { callModelWithFunctions } from "utils/aiClient";

export class AiService {
  // messages: we craft a system + user message; caller must provide the prompt body
  async buildModuleTree(
    projectName: string,
    prompt: any,
    root?: any
  ): Promise<any> {
    const messages = [
      {
        role: "system",
        content:
          "You are a helpful project scaffold generator. Return JSON only.",
      },
      { role: "user", content: JSON.stringify({ projectName, prompt, root }) },
    ];

    const resp = await callModelWithFunctions(messages, [PROJECT_FUNCTIONS[0]]);
    const choice = resp.choices?.[0];
    const msg = choice?.message ?? {};

    // function_call arguments preferred
    if ((msg as any).function_call?.arguments) {
      try {
        const args = JSON.parse((msg as any).function_call.arguments);
        return args.root ?? args; // return root if provided
      } catch (e) {
        // fallthrough
      }
    }

    // fallback: try parse content
    if (msg.content) {
      try {
        return JSON.parse(msg.content);
      } catch (e) {
        /* ignore */
      }
    }

    throw new Error("AI did not return a valid module tree");
  }

  async suggestRunCmd(projectId: string, context?: any): Promise<any> {
    const messages = [
      {
        role: "system",
        content:
          "You are a helpful assistant suggesting build/test/run commands for projects.",
      },
      { role: "user", content: JSON.stringify({ projectId, context }) },
    ];

    const resp = await callModelWithFunctions(messages, [PROJECT_FUNCTIONS[2]]);
    const choice = resp.choices?.[0];
    const msg = choice?.message ?? {};

    if ((msg as any).function_call?.arguments) {
      try {
        return JSON.parse((msg as any).function_call.arguments);
      } catch (e) {}
    }
    if (msg.content) {
      try {
        return JSON.parse(msg.content);
      } catch (e) {}
    }

    throw new Error("AI did not suggest a run command");
  }
}
