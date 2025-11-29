// Socket event handler for AI chat integration
import { Server as IOServer, Socket } from 'socket.io';
import { AIComponentGeneratorService } from '../main/editor/service/ai-component-generator.service';

const aiGenerator = new AIComponentGeneratorService();

export function setupEditorSocketHandlers(io: IOServer) {
  io.on('connection', (socket: Socket) => {
    console.log(`[EditorSocket] Client connected: ${socket.id}`);

    // Handle AI chat messages
    socket.on('editor:chat_message', async (data: any) => {
      try {
        const { message, projectId, selectedComponentIds, context } = data;

        console.log(`[EditorSocket] Processing chat message: ${message}`);

        // Send acknowledgment
        socket.emit('editor:chat_received', { messageId: Date.now() });

        // Generate component using AI
        const result = await aiGenerator.generateComponent({
          prompt: message,
          selectedComponents: context?.components || [],
          useOpenAI: false, // Use Anthropic by default
        });

        // Send generated code back to client
        socket.emit('editor:generate_response', {
          messageId: Date.now(),
          code: result.html,
          html: result.html,
          css: result.css,
          js: result.js,
          explanation: result.explanation,
          componentType: result.componentType,
        });

        console.log(`[EditorSocket] Component generated: ${result.componentType}`);
      } catch (error: any) {
        console.error('[EditorSocket] Error generating component:', error);
        socket.emit('editor:error', {
          message: error.message || 'Failed to generate component',
        });
      }
    });

    // Handle component selection
    socket.on('editor:select_component', (data: any) => {
      console.log(`[EditorSocket] Component selected: ${data.componentIds}`);
      // Broadcast to other clients in the same project/room
      if (data.projectId) {
        socket.to(`project:${data.projectId}`).emit('editor:component_selected', data);
      }
    });

    // Handle component updates
    socket.on('editor:update_component', (data: any) => {
      console.log(`[EditorSocket] Component updated: ${data.componentId}`);
      if (data.projectId) {
        socket.to(`project:${data.projectId}`).emit('editor:component_updated', data);
      }
    });

    // Handle code application
    socket.on('editor:apply_code', (data: any) => {
      console.log(`[EditorSocket] Applying code for message: ${data.messageId}`);
      socket.emit('editor:code_applied', {
        messageId: data.messageId,
        success: true,
      });
    });

    // Join project room for real-time collaboration
    socket.on('editor:join_project', (projectId: string) => {
      socket.join(`project:${projectId}`);
      console.log(`[EditorSocket] Socket ${socket.id} joined project ${projectId}`);
    });

    // Leave project room
    socket.on('editor:leave_project', (projectId: string) => {
      socket.leave(`project:${projectId}`);
      console.log(`[EditorSocket] Socket ${socket.id} left project ${projectId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[EditorSocket] Client disconnected: ${socket.id}`);
    });
  });
}
