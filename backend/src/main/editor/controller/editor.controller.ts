// Editor Controller - class based implementation
import { Request, Response } from 'express';
import { EditorService } from '../service/editor.service';

export class EditorController {
  private editorService: EditorService;

  constructor() {
    this.editorService = new EditorService();
    // bind methods if used as callbacks
    this.generate = this.generate.bind(this);
    this.updateComponent = this.updateComponent.bind(this);
    this.save = this.save.bind(this);
    this.load = this.load.bind(this);
    this.exportProject = this.exportProject.bind(this);
    this.health = this.health.bind(this);
  }

  // POST /generate
  async generate(req: Request, res: Response) {
    try {
      const { prompt, selectedComponents, model = 'openai' } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }
      // Choose AI provider based on "model" field
      let aiResult;
      if (model === 'anthropic') {
        // @anthropic-ai/sdk usage (placeholder)
        const { Anthropic } = require('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await client.completions.create({
          model: 'claude-2.1',
          prompt,
          max_tokens_to_sample: 1024,
        });
        aiResult = { success: true, component: response.completion };
      } else if (model === 'gemini') {
        // Google Gemini usage (placeholder)
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const modelInstance = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
        const result = await modelInstance.generateContent(prompt);
        aiResult = { success: true, component: result.response.text() };
      } else {
        // Default to OpenAI via editorService (existing implementation)
        aiResult = await this.editorService.generateComponentFromAI(
          prompt,
          selectedComponents || [],
          true,
        );
      }
      if (!aiResult.success) {
        return res.status(500).json({ error: aiResult.error });
      }
      res.json({ success: true, component: aiResult.component });
    } catch (error: any) {
      console.error('Generate component error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // POST /update-component
  async updateComponent(req: Request, res: Response) {
    try {
      const { prompt, componentId, componentHtml } = req.body;
      if (!prompt || !componentHtml) {
        return res.status(400).json({ error: 'Prompt and component HTML are required' });
      }
      const result = await this.editorService.updateComponentFromAI(prompt, componentHtml);
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }
      res.json({ success: true, component: result.component });
    } catch (error: any) {
      console.error('Update component error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // POST /save
  async save(req: Request, res: Response) {
    try {
      const project = req.body;
      if (!project.id || !project.name) {
        return res.status(400).json({ error: 'Project ID and name are required' });
      }
      const result = await this.editorService.saveProject(project);
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }
      res.json({ success: true, projectId: result.projectId, path: result.path });
    } catch (error: any) {
      console.error('Save project error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // GET /load/:projectId
  async load(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const project = await this.editorService.loadProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json({ success: true, project });
    } catch (error: any) {
      console.error('Load project error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // GET /export/:projectId
  async exportProject(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const exportPath = await this.editorService.exportProject(projectId);
      if (!exportPath) {
        return res.status(404).json({ error: 'Project not found' });
      }
      // TODO: stream ZIP file if needed
      res.json({ success: true, message: 'Export ready', path: exportPath });
    } catch (error: any) {
      console.error('Export project error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // GET /health
  health(_req: Request, res: Response) {
    res.json({ status: 'OK', service: 'editor', timestamp: Date.now() });
  }
}
