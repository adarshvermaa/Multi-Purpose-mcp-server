// Editor routes entry point
import { Router } from 'express';
import { EditorController } from '../../controller/editor.controller';

const router = Router();
const editorCtrl = new EditorController();

// Mount editor routes
router.post('/generate', editorCtrl.generate);
router.post('/update-component', editorCtrl.updateComponent);
router.post('/save', editorCtrl.save);
router.get('/load/:projectId', editorCtrl.load);
router.get('/export/:projectId', editorCtrl.exportProject);
router.get('/health', editorCtrl.health);

export default router;
