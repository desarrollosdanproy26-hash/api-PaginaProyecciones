const sql = require('mssql');
require('dotenv').config();

// Configuración de conexión a SQL Server
const config = {
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERTIFICATE === 'true',
    enableArithAbort: true,
    connectionTimeout: 30000,
    requestTimeout: 30000
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// Pool de conexiones
let pool = null;

/**
 * Obtiene una conexión al pool de SQL Server
 * @returns {Promise<sql.ConnectionPool>}
 */
async function getConnection() {
  try {
    if (!pool) {
      pool = await sql.connect(config);
      console.log('✅ Conectado a SQL Server');
    }
    return pool;
  } catch (err) {
    console.error('❌ Error al conectar a SQL Server:', err);
    throw err;
  }
}

/**
 * Cierra el pool de conexiones
 */
async function closeConnection() {
  try {
    if (pool) {
      await pool.close();
      pool = null;
      console.log('🔌 Conexión a SQL Server cerrada');
    }
  } catch (err) {
    console.error('Error al cerrar conexión:', err);
  }
}

module.exports = {
  sql,
  getConnection,
  closeConnection,
  config
};
