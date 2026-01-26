/**
 * Middleware de manejo de errores global
 */
function errorHandler(err, req, res, next) {
  console.error('❌ Error:', err);

  // Errores de validación
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Error de validación',
      details: err.message
    });
  }

  // Errores de SQL Server
  if (err.name === 'RequestError') {
    return res.status(400).json({
      success: false,
      error: 'Error en la consulta SQL',
      details: err.message
    });
  }

  // Errores de conexión
  if (err.name === 'ConnectionError') {
    return res.status(503).json({
      success: false,
      error: 'Error de conexión a la base de datos',
      details: err.message
    });
  }

  // Error por defecto
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

/**
 * Middleware para rutas no encontradas
 */
function notFound(req, res, next) {
  res.status(404).json({
    success: false,
    error: 'Ruta no encontrada',
    path: req.originalUrl
  });
}

/**
 * Logger de peticiones
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`
    );
  });
  
  next();
}

module.exports = {
  errorHandler,
  notFound,
  requestLogger
};
