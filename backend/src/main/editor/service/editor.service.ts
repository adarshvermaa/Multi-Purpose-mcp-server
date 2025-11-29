// Editor Service - Business logic for editor operations
import { AIComponentGeneratorService, ComponentResponse } from './ai-component-generator.service';
import * as fs from 'fs-extra';
import * as path from 'path';

const aiGenerator = new AIComponentGeneratorService();

interface Component {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  styles: any;
  children: Component[];
  html?: string;
  locked: boolean;
  visible: boolean;
  zIndex: number;
}

interface Project {
  id: string;
  name: string;
  components: Component[];
  files: Record<string, string>;
  metadata: {
    createdAt: number;
    updatedAt: number;
    version: number;
  };
}

export class EditorService {
  private projectsDir = path.join(process.cwd(), 'projects');

  constructor() {
    fs.ensureDirSync(this.projectsDir);
  }

  async generateComponentFromAI(prompt: string, selectedComponents: any[] = [], useOpenAI = false) {
    try {
      const result = await aiGenerator.generateComponent({
        prompt,
        selectedComponents,
        useOpenAI,
      });

      return {
        success: true,
        component: result,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async updateComponentFromAI(prompt: string, componentHtml: string) {
    try {
      const result = await aiGenerator.modifyComponent(componentHtml, prompt);

      return {
        success: true,
        component: result,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async saveProject(project: Project) {
    try {
      const projectPath = path.join(this.projectsDir, project.id);
      await fs.ensureDir(projectPath);

      // Save project metadata
      await fs.writeJSON(path.join(projectPath, 'project.json'), project, { spaces: 2 });

      // Export HTML
      const html = this.generateHTML(project.components);
      await fs.writeFile(path.join(projectPath, 'index.html'), html);

      // Export CSS
      const css = this.generateCSS(project.components);
      await fs.writeFile(path.join(projectPath, 'styles.css'), css);

      project.metadata.updatedAt = Date.now();

      return {
        success: true,
        projectId: project.id,
        path: projectPath,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async loadProject(projectId: string): Promise<Project | null> {
    try {
      const projectPath = path.join(this.projectsDir, projectId, 'project.json');
      
      if (!await fs.pathExists(projectPath)) {
        return null;
      }

      const project = await fs.readJSON(projectPath);
      return project;
    } catch (error) {
      console.error('Failed to load project:', error);
      return null;
    }
  }

  async exportProject(projectId: string): Promise<string | null> {
    try {
      const project = await this.loadProject(projectId);
      if (!project) return null;

      const exportPath = path.join(this.projectsDir, projectId);
      return exportPath;
    } catch (error) {
      console.error('Failed to export project:', error);
      return null;
    }
  }

  private generateHTML(components: Component[]): string {
    const componentsHTML = components
      .sort((a, b) => a.zIndex - b.zIndex)
      .map(comp => this.componentToHTML(comp))
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated UI</title>
  <link rel="stylesheet" href="styles.css">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  ${componentsHTML}
</body>
</html>`;
  }

  private componentToHTML(component: Component): string {
    if (component.html) {
      return component.html;
    }

    const style = this.positionToStyle(component);
    const children = component.children.map(c => this.componentToHTML(c)).join('\n');

    switch (component.type) {
      case 'button':
        return `<button id="${component.id}" style="${style}">${component.name}</button>`;
      case 'input':
        return `<input id="${component.id}" style="${style}" placeholder="${component.name}" />`;
      case 'text':
        return `<p id="${component.id}" style="${style}">${component.name}</p>`;
      default:
        return `<div id="${component.id}" style="${style}">${children}</div>`;
    }
  }

  private positionToStyle(component: Component): string {
    const styles: string[] = [
      `position: absolute`,
      `left: ${component.position.x}px`,
      `top: ${component.position.y}px`,
      `width: ${component.size.width}px`,
      `height: ${component.size.height}px`,
      `transform: rotate(${component.rotation}deg)`,
      `z-index: ${component.zIndex}`,
      `display: ${component.visible ? 'block' : 'none'}`,
    ];

    if (component.styles) {
      Object.entries(component.styles).forEach(([key, value]) => {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        styles.push(`${cssKey}: ${value}`);
      });
    }

    return styles.join('; ');
  }

  private generateCSS(components: Component[]): string {
    let css = `/* Generated Styles */\n\n`;
    css += `body {
  margin: 0;
  padding: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.container {
  position: relative;
  width: 100%;
  min-height: 100vh;
}\n\n`;

    components.forEach(comp => {
      if (comp.styles) {
        css += `#${comp.id} {\n`;
        Object.entries(comp.styles).forEach(([key, value]) => {
          const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
          css += `  ${cssKey}: ${value};\n`;
        });
        css += `}\n\n`;
      }
    });

    return css;
  }
}
