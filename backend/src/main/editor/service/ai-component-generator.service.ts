// AI Component Generator Service
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

interface GenerateComponentRequest {
  prompt: string;
  componentType?: string;
  selectedComponents?: any[];
  useOpenAI?: boolean;
}

export interface ComponentResponse {
  html: string;
  css: string;
  js?: string;
  explanation: string;
  componentType: string;
}

export class AIComponentGeneratorService {
  async generateComponent(request: GenerateComponentRequest): Promise<ComponentResponse> {
    const { prompt, componentType, selectedComponents = [], useOpenAI = false } = request;

    const systemPrompt = this.buildSystemPrompt(componentType);
    const userPrompt = this.buildUserPrompt(prompt, selectedComponents);

    if (useOpenAI) {
      return this.generateWithOpenAI(systemPrompt, userPrompt);
    } else {
      return this.generateWithAnthropic(systemPrompt, userPrompt);
    }
  }

  private buildSystemPrompt(componentType?: string): string {
    return `You are an expert UI component generator. Generate clean, modern, production-ready HTML/CSS/JavaScript components.

Rules:
1. Generate semantic HTML5 markup
2. Use modern CSS (Flexbox, Grid, CSS variables)
3. Include TailwindCSS classes for styling
4. Make components responsive and accessible
5. Keep JavaScript minimal and vanilla (no frameworks)
6. Return ONLY valid HTML, CSS, and JS - no markdown, no explanations in the code

Component Type: ${componentType || 'any'}

Return format:
{
  "html": "...",
  "css": "...",
  "js": "...",
  "explanation": "Brief explanation of the component",
  "componentType": "button|card|form|navbar|etc"
}`;
  }

  private buildUserPrompt(prompt: string, selectedComponents: any[]): string {
    let userPrompt = `Generate a UI component: ${prompt}\n\n`;

    if (selectedComponents.length > 0) {
      userPrompt += `Context - User has selected these components:\n`;
      selectedComponents.forEach(comp => {
        userPrompt += `- ${comp.name} (${comp.type})\n`;
      });
    }

    return userPrompt;
  }

  private async generateWithAnthropic(systemPrompt: string, userPrompt: string): Promise<ComponentResponse> {
    try {
      const message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt,
        }],
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const result = this.parseResponse(content.text);
      return result;
    } catch (error: any) {
      console.error('Anthropic generation error:', error);
      throw new Error(`AI generation failed: ${error.message}`);
    }
  }

  private async generateWithOpenAI(systemPrompt: string, userPrompt: string): Promise<ComponentResponse> {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 4096,
        temperature: 0.7,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const result = this.parseResponse(content);
      return result;
    } catch (error: any) {
      console.error('OpenAI generation error:', error);
      throw new Error(`AI generation failed: ${error.message}`);
    }
  }

  private parseResponse(text: string): ComponentResponse {
    try {
      // Try to extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          html: parsed.html || '',
          css: parsed.css || '',
          js: parsed.js || '',
          explanation: parsed.explanation || 'Component generated successfully',
          componentType: parsed.componentType || 'custom',
        };
      }

      // Fallback: try to extract code blocks
      const htmlMatch = text.match(/```html\n([\s\S]*?)```/);
      const cssMatch = text.match(/```css\n([\s\S]*?)```/);
      const jsMatch = text.match(/```(?:javascript|js)\n([\s\S]*?)```/);

      return {
        html: htmlMatch ? htmlMatch[1].trim() : text,
        css: cssMatch ? cssMatch[1].trim() : '',
        js: jsMatch ? jsMatch[1].trim() : '',
        explanation: 'Component generated successfully',
        componentType: 'custom',
      };
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return {
        html: text,
        css: '',
        js: '',
        explanation: 'Raw response returned',
        componentType: 'custom',
      };
    }
  }

  async generateChart(data: any[], chartType: 'bar' | 'line' | 'pie'): Promise<ComponentResponse> {
    const prompt = `Generate a ${chartType} chart component using Chart.js library that displays this data: ${JSON.stringify(data)}. Include the Chart.js CDN link and make it responsive.`;

    return this.generateComponent({ prompt, componentType: 'chart'  });
  }

  async generateForm(fields: string[]): Promise<ComponentResponse> {
    const prompt = `Generate a modern form component with these fields: ${fields.join(', ')}. Include validation styles and a submit button.`;

    return this.generateComponent({ prompt, componentType: 'form' });
  }

  async modifyComponent(componentHtml: string, modification: string): Promise<ComponentResponse> {
    const prompt = `Modify this component:\n${componentHtml}\n\nModification: ${modification}`;

    return this.generateComponent({ prompt });
  }
}
