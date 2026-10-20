import express from 'express';
import * as movieController from '../controllers/movieController.js';

const router = express.Router();

router.get('/health', movieController.getHealth);
router.get('/summary', movieController.getSummary);
router.get('/genres', movieController.getGenres);
router.get('/movies', movieController.getMovies);
router.get('/editions', movieController.getEditions);
router.get('/export', movieController.exportCatalog);

router.post('/ingest', movieController.ingestMovie);
router.put('/movies/:id', movieController.updateMovie);

router.get('/search', movieController.searchMetadata);
router.get('/metadata/barcode', movieController.getBarcodeMetadata);

export default router;
