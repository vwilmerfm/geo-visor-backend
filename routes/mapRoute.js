const express = require('express');
const router = express.Router();
const mapaController  = require('../controllers/mapController.js');
const { verificarToken } = require('../middleware/authMiddleware');

router.get('/departamentos', verificarToken, mapaController.getDepartamentos);
router.get('/municipios/:departamento_id', verificarToken, mapaController.getMunicipiosPorDepartamento);
router.get('/comunidades/:municipio_id', verificarToken, mapaController.getComunidades);

module.exports = router;