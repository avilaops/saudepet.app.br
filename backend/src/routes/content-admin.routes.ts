import { Router } from 'express';
const { z } = require('zod');
const controller = require('../controllers/content-admin.controller');
const { authMiddleware, isAdmin } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const validate = require('../middleware/validate.middleware');
const upload = require('../middleware/upload.middleware');
const {
  paginationQuerySchema, leadQuerySchema, dashboardQuerySchema,
  blogPostSchema, categorySchema, leadUpdateSchema
} = require('../schemas/content.schema');

const router = Router();
const idSchema = z.object({ id: z.string().uuid() });
router.use(authMiddleware, isAdmin, tenantContext, requireActiveTenant);

router.get('/analytics', validate(dashboardQuerySchema, 'query'), controller.dashboard);
router.get('/leads/export.csv', validate(leadQuerySchema, 'query'), controller.exportLeads);
router.get('/leads', validate(leadQuerySchema, 'query'), controller.listLeads);
router.get('/leads/:id', validate(idSchema, 'params'), controller.getLead);
router.patch('/leads/:id', validate(idSchema, 'params'), validate(leadUpdateSchema), controller.updateLead);
router.delete('/leads/:id', validate(idSchema, 'params'), controller.deleteLead);

router.get('/blog/posts', validate(paginationQuerySchema, 'query'), controller.listPosts);
router.get('/blog/posts/:id', validate(idSchema, 'params'), controller.getPost);
router.post('/blog/posts', validate(blogPostSchema), controller.createPost);
router.put('/blog/posts/:id', validate(idSchema, 'params'), validate(blogPostSchema), controller.updatePost);
router.post('/blog/posts/:id/publicar-threads', validate(idSchema, 'params'), controller.publishPostToThreads);
router.delete('/blog/posts/:id', validate(idSchema, 'params'), controller.deletePost);
// Capa do artigo: o editor pedia URL de texto e o admin tinha que hospedar a
// imagem por fora, num produto que já sobe arquivo para o R2 em outros quatro
// lugares.
router.post('/blog/imagem', upload.single('imagem'), controller.uploadBlogImage);

router.get('/blog/categories', controller.listCategories);
router.post('/blog/categories', validate(categorySchema), controller.createCategory);
router.delete('/blog/categories/:id', validate(idSchema, 'params'), controller.deleteCategory);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
