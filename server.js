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

// ==================== CORS CONFIGURACIÓN CORRECTA ====================

const FRONT_URL = 'http://portal-web-proyecciones-frontpagina-swik-cabe34-147-93-190-116.traefik.me';
//const FRONT_URL = 'http://localhost:3000';

app.use(cors({
  origin: FRONT_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ==================== SEGURIDAD ====================

app.use(helmet({
  crossOriginResourcePolicy: false,
}));

// ==================== BODY PARSER ====================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==================== LOGGER ====================

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
    status: 'running'
  });
});

// API Routes
app.use('/api', apiRoutes);

// ==================== ERRORES ====================

app.use(notFound);
app.use(errorHandler);

// ==================== INICIAR SERVIDOR ====================

async function startServer() {
  try {
    await getConnection();
    console.log('✅ Conectado a la base de datos');

    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Error al iniciar:', error);
    process.exit(1);
  }
}

// ==================== CIERRE SEGURO ====================

process.on('SIGTERM', async () => {
  await closeConnection();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await closeConnection();
  process.exit(0);
});

startServer();

module.exports = app;
