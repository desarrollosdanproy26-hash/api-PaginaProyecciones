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

// ==================== RUTAS DE TABLAS (PROTEGIDAS) ====================

// Health check (pública)
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Proyecciones API'
  });
});

// Todas las rutas siguientes requieren autenticación
router.use(authController.authenticateToken);

// Obtener todas las tablas disponibles
router.get('/tables', tableController.getTables);

// Obtener esquema de una tabla específica
router.get('/tables/:tableName/schema', tableController.getTableSchema);

// Obtener todos los registros de una tabla (con paginación)
router.get('/tables/:tableName/data', tableController.getTableData);

// Obtener un registro específico por ID
router.get('/tables/:tableName/records/:id', tableController.getRecord);

// Crear un nuevo registro (Asistente tiene permiso)
router.post('/tables/:tableName/records', 
  authController.authorizeRoles('Asistente'),
  tableController.createRecord
);

// Actualizar un registro existente (Asistente tiene permiso)
router.put('/tables/:tableName/records/:id', 
  authController.authorizeRoles('Asistente'),
  tableController.updateRecord
);

// Eliminar un registro (Asistente tiene permiso)
router.delete('/tables/:tableName/records/:id', 
  authController.authorizeRoles('Asistente'),
  tableController.deleteRecord
);

// Obtener datos relacionados para foreign keys
router.get('/tables/:tableName/related/:columnName', tableController.getRelatedData);

// ==================== RUTAS DE FENOLOGÍA ====================

// Obtener fundos
router.get('/fenologia/fundos', fenologiaController.getFundos);

// Obtener módulos por fundo
router.get('/fenologia/fundos/:idFundo/modulos', fenologiaController.getModulosByFundo);

// Obtener turnos por módulo
router.get('/fenologia/modulos/:idModulo/turnos', fenologiaController.getTurnosByModulo);

// Obtener lotes por turno
router.get('/fenologia/turnos/:idTurno/lotes', fenologiaController.getLotesByTurno);

// Obtener datos de fenología por lote
router.get('/fenologia/lotes/:idLote/datos', fenologiaController.getDatosFenologia);

// Obtener promedios a nivel turno
router.get('/fenologia/turnos/:idTurno/nivel-turno', fenologiaController.getDatosNivelTurno);

// Obtener promedios a nivel lote
router.get('/fenologia/lotes/:idLote/nivel-lote', fenologiaController.getDatosNivelLote);

// Actualizar registro de fenología
router.put('/fenologia/registros/:id', 
  authController.authorizeRoles('Asistente'),
  fenologiaController.actualizarRegistro
);

// ==================== RUTAS DE CONTEO DE FRUTOS ====================

// Obtener fundos
router.get('/conteo-frutos/fundos', conteoFrutosController.getFundos);

// Obtener módulos por fundo
router.get('/conteo-frutos/fundos/:idFundo/modulos', conteoFrutosController.getModulosByFundo);

// Obtener turnos por módulo
router.get('/conteo-frutos/modulos/:idModulo/turnos', conteoFrutosController.getTurnosByModulo);

// Obtener lotes por turno
router.get('/conteo-frutos/turnos/:idTurno/lotes', conteoFrutosController.getLotesByTurno);

// Obtener datos de conteo por lote
router.get('/conteo-frutos/lotes/:idLote/datos', conteoFrutosController.getDatosConteo);

// Actualizar registro de conteo
router.put('/conteo-frutos/registros/:id', 
  authController.authorizeRoles('Asistente'),
  conteoFrutosController.actualizarRegistro
);

router.put('/fenologia/lotes/:idLote/cambiar-validacion', fenologiaController.cambiarValidacionLote);

// ==================== RUTAS ESPECIALES ====================

// Ejecutar query personalizado (Asistente tiene permiso)
router.post('/query', 
  authController.authorizeRoles('Asistente'),
  tableController.executeQuery
);

module.exports = router;
