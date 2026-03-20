const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verificarToken, esRol } = require('../middleware/authMiddleware');
const soloAdmin = [verificarToken, esRol(['administrador', 'admin'])];

router.post('/login', authController.login);
router.post('/crear-admin', authController.crearUsuarioAdmin);

router.get('/usuarios', soloAdmin, authController.getUsuarios);
router.post('/crear-usuario', soloAdmin, authController.crearUsuario);
router.put('/usuario/:id', soloAdmin, authController.updateUsuario);
router.get('/roles', soloAdmin, authController.getRoles);

router.get('/buscar-ad/:search', soloAdmin, authController.buscarUsuariosAD);

module.exports = router;