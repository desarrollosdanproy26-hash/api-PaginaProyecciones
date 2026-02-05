const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const { getConnection, closeConnection } = require('./config/database');
const apiRoutes = require('./routes/api');
const { errorHandler, notFound, requestLogger } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// ==================== MIDDLEWARES ====================

// CORS MANUAL - FORZADO (ANTES DE TODO)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// CORS con librería (como respaldo)
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Seguridad HTTP (con configuración permisiva para CORS)
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logger
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(requestLogger);
}

// ==================== RUTAS ====================

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    message: '🚀 API de Proyecciones',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      tables: '/api/tables',
      docs: 'Consultar README.md'
    }
  });
});

// API Routes
app.use('/api', apiRoutes);

// ==================== MANEJO DE ERRORES ====================

// Ruta no encontrada
app.use(notFound);

// Error handler global
app.use(errorHandler);

// ==================== INICIAR SERVIDOR ====================

async function startServer() {
  try {
    // Verificar conexión a la base de datos
    await getConnection();
    console.log('✅ Conexión a base de datos establecida');

    // Iniciar servidor
    app.listen(PORT, () => {
      console.log('╔════════════════════════════════════════╗');
      console.log(`║  🚀 Servidor corriendo en puerto ${PORT}  ║`);
      console.log('╠════════════════════════════════════════╣');
      console.log(`║  📡 URL: http://localhost:${PORT}         ║`);
      console.log(`║  🌍 Entorno: ${process.env.NODE_ENV || 'development'}         ║`);
      console.log('╚════════════════════════════════════════╝');
    });
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

// ==================== MANEJO DE SEÑALES ====================

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM recibido. Cerrando servidor...');
  await closeConnection();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT recibido. Cerrando servidor...');
  await closeConnection();
  process.exit(0);
});

// Manejo de promesas rechazadas
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Excepción no capturada:', error);
  process.exit(1);
});

// Iniciar servidor
startServer();

module.exports = app;