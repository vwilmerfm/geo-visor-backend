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
router.get('/sectores/:id', verificarToken, mapaController.getSectores);
router.get('/sectores-municipio/:municipio_id', verificarToken, mapaController.getSectoresPorMunicipio);
router.get('/predios-municipio/:municipio_id', verificarToken, mapaController.getPrediosMunicipio);
router.get('/manzanos-municipio/:municipio_id', verificarToken, mapaController.getManzanosMunicipio);
router.get('/periurbano-municipio/:municipio_id', verificarToken, mapaController.getPeriurbanoMunicipio);
router.get('/upas-municipio/:municipio_id', verificarToken, mapaController.getUpasMunicipio);
router.get('/areacensal-municipio/:municipio_id', verificarToken, mapaController.getAreaCensalMunicipio);
router.get('/descargar-excel-sectores-municipal/:id', verificarToken, mapaController.descargarExcelMunicipalSectores);
router.get('/superarea-municipio/:municipio_id', verificarToken, mapaController.getSuperAreaMunicipio);
router.get('/areatrabajo-municipio/:municipio_id', verificarToken, mapaController.getAreaTrabajoMunicipio);

module.exports = router;

module.exports = router;