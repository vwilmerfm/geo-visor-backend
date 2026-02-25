const express = require('express');
const router = express.Router();
const mapaController  = require('../controllers/mapController.js');
const { verificarToken } = require('../middleware/authMiddleware');

router.get('/departamentos', verificarToken, mapaController.getDepartamentos);
router.get('/municipios/:departamento_id', verificarToken, mapaController.getMunicipiosPorDepartamento);
router.get('/comunidades/:municipio_id', verificarToken, mapaController.getComunidades);
router.get('/estadisticas', verificarToken, mapaController.getEstadisticas);
router.get('/apa-comunidad/:id', verificarToken, mapaController.getApaComunidad);
router.get('/descargar-excel', verificarToken, mapaController.descargarExcel);

module.exports = router;