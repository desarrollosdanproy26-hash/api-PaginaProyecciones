const express = require('express');
const router = express.Router();
const tableController = require('../controllers/tableController');
const authController = require('../controllers/authController');
const fenologiaController = require('../controllers/fenologiaController');
const conteoFrutosController = require('../controllers/conteoFrutosController');

// ==================== RUTAS DE AUTENTICACIÓN ====================

// Login (pública)
router.post('/auth/login', authController.login);

// Verificar token (pública)
router.get('/auth/verify', authController.verifyToken);

// Cambiar contraseña (requiere autenticación)
router.post('/auth/change-password', 
  authController.authenticateToken, 
  authController.changePassword
);

// ==================== RUTAS DE FENOLOGÍA (NUEVAS) ====================

// Obtener fundos
router.get('/fenologia/fundos', fenologiaController.getFundos);

// Obtener módulos por fundo
router.get('/fenologia/fundos/:idFundo/modulos', fenologiaController.getModulosByFundo);

// Obtener turnos por módulo
router.get('/fenologia/modulos/:idModulo/turnos', fenologiaController.getTurnosByModulo);

// Obtener datos de turno con 3 semanas
router.get('/fenologia/turnos/:idTurno/tres-semanas', fenologiaController.getDatosTurnoTresSemanas);

// Obtener datos de lote con 3 semanas
router.get('/fenologia/lotes/:idLote/tres-semanas', fenologiaController.getDatosLoteTresSemanas);

// Actualizar registro individual (nivel muestra)
router.put('/fenologia/registros/:id', fenologiaController.actualizarRegistro);

// Editar promedios a nivel lote
router.put('/fenologia/lotes/:idLote/editar-promedios', fenologiaController.editarPromediosLote);

// Editar promedios a nivel turno
router.put('/fenologia/turnos/:idTurno/editar-promedios', fenologiaController.editarPromediosTurno);

// Marcar turno como revisado sin editar
router.put('/fenologia/turnos/:idTurno/marcar-revisado', fenologiaController.marcarTurnoRevisado);

// ==================== RUTAS DE CONTEO DE FRUTOS ====================

// Obtener fundos
router.get('/conteofrutos/fundos', conteoFrutosController.getFundos);

// Obtener módulos por fundo
router.get('/conteofrutos/fundos/:idFundo/modulos', conteoFrutosController.getModulosByFundo);

// Obtener turnos por módulo
router.get('/conteofrutos/modulos/:idModulo/turnos', conteoFrutosController.getTurnosByModulo);

// Obtener lotes por turno
router.get('/conteofrutos/turnos/:idTurno/lotes', conteoFrutosController.getLotesByTurno);

// Obtener datos de conteo por lote
router.get('/conteofrutos/lotes/:idLote/datos', conteoFrutosController.getDatosConteo);

// Actualizar registro de conteo
router.put('/conteofrutos/registros/:id', conteoFrutosController.actualizarRegistro);

module.exports = router;