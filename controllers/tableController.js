const { getConnection, sql } = require('../config/database');

/**
 * Obtiene todas las tablas disponibles en la base de datos
 */
async function getTables(req, res) {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE' 
      AND TABLE_NAME NOT LIKE 'sys%'
      ORDER BY TABLE_NAME
    `);
    
    res.json({ success: true, tables: result.recordset.map(r => r.TABLE_NAME) });
  } catch (err) {
    console.error('Error obteniendo tablas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Obtiene el esquema (columnas) de una tabla específica
 */
async function getTableSchema(req, res) {
  try {
    const { tableName } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('tableName', sql.NVarChar, tableName)
      .query(`
        SELECT 
          COLUMN_NAME as name,
          DATA_TYPE as type,
          CHARACTER_MAXIMUM_LENGTH as maxLength,
          IS_NULLABLE as nullable,
          COLUMN_DEFAULT as defaultValue
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @tableName
        ORDER BY ORDINAL_POSITION
      `);
    
    // Obtener primary keys
    const pkResult = await pool.request()
      .input('tableName', sql.NVarChar, tableName)
      .query(`
        SELECT COLUMN_NAME as name
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE OBJECTPROPERTY(OBJECT_ID(CONSTRAINT_SCHEMA + '.' + CONSTRAINT_NAME), 'IsPrimaryKey') = 1
        AND TABLE_NAME = @tableName
      `);
    
    const primaryKeys = pkResult.recordset.map(r => r.name);
    
    res.json({ 
      success: true, 
      schema: result.recordset,
      primaryKeys: primaryKeys
    });
  } catch (err) {
    console.error('Error obteniendo esquema:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Obtiene todos los registros de una tabla
 */
async function getTableData(req, res) {
  try {
    const { tableName } = req.params;
    const { page = 1, pageSize = 100, sortBy, sortOrder = 'ASC' } = req.query;

    const pool = await getConnection();
    
    // Obtener primary key
    const pkResult = await pool.request()
      .input('tableName', sql.NVarChar, tableName)
      .query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_NAME = @tableName 
        AND CONSTRAINT_NAME LIKE 'PK%'
      `);
    
    const primaryKey = pkResult.recordset[0]?.COLUMN_NAME || 'id';
    const orderColumn = sortBy || primaryKey;
    
    // Calcular offset
    const offset = (page - 1) * pageSize;
    const startRow = offset + 1;
    const endRow = offset + parseInt(pageSize);
    
    // Usar ROW_NUMBER en lugar de OFFSET/FETCH
    const query = `
      WITH PaginatedData AS (
        SELECT *, ROW_NUMBER() OVER (ORDER BY [${orderColumn}] ${sortOrder}) AS RowNum
        FROM [${tableName}]
      )
      SELECT *
      FROM PaginatedData
      WHERE RowNum BETWEEN ${startRow} AND ${endRow}
      ORDER BY RowNum
    `;
    
    const result = await pool.request().query(query);
    
    // Obtener total de registros
    const countResult = await pool.request()
      .query(`SELECT COUNT(*) as total FROM [${tableName}]`);
    
    const total = countResult.recordset[0].total;
    
    res.json({
      success: true,
      data: result.recordset.map(row => {
        const { RowNum, ...data } = row;
        return data;
      }),
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });

  } catch (err) {
    console.error('❌ Error al obtener datos:', err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
}

/**
 * Obtiene un registro específico por ID
 */
async function getRecord(req, res) {
  try {
    const { tableName, id } = req.params;
    const pool = await getConnection();
    
    // Obtener primary key de la tabla
    const pkResult = await pool.request()
      .input('tableName', sql.NVarChar, tableName)
      .query(`
        SELECT COLUMN_NAME as name
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE OBJECTPROPERTY(OBJECT_ID(CONSTRAINT_SCHEMA + '.' + CONSTRAINT_NAME), 'IsPrimaryKey') = 1
        AND TABLE_NAME = @tableName
      `);
    
    if (pkResult.recordset.length === 0) {
      return res.status(400).json({ success: false, error: 'Tabla sin primary key' });
    }
    
    const primaryKey = pkResult.recordset[0].name;
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT * FROM [${tableName}] WHERE [${primaryKey}] = @id`);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('Error obteniendo registro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Crea un nuevo registro
 */
async function createRecord(req, res) {
  try {
    const { tableName } = req.params;
    const data = req.body;
    
    const pool = await getConnection();
    
    // Obtener columnas de la tabla
    const columnsResult = await pool.request()
      .input('tableName', sql.NVarChar, tableName)
      .query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE,
               COLUMNPROPERTY(OBJECT_ID(TABLE_SCHEMA + '.' + TABLE_NAME), COLUMN_NAME, 'IsIdentity') as IsIdentity
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @tableName
        ORDER BY ORDINAL_POSITION
      `);
    
    // Filtrar columnas identity (auto-incrementales)
    const columns = columnsResult.recordset.filter(col => col.IsIdentity === 0);
    
    // Construir query INSERT
    const columnNames = columns.map(col => `[${col.COLUMN_NAME}]`).join(', ');
    const paramNames = columns.map((col, idx) => `@param${idx}`).join(', ');
    
    const insertQuery = `
      INSERT INTO [${tableName}] (${columnNames}) 
      OUTPUT INSERTED.*
      VALUES (${paramNames})
    `;
    
    const request = pool.request();
    
    // Agregar parámetros
    columns.forEach((col, idx) => {
      const value = data[col.COLUMN_NAME];
      const sqlType = getSqlType(col.DATA_TYPE);
      request.input(`param${idx}`, sqlType, value);
    });
    
    const result = await request.query(insertQuery);
    
    res.status(201).json({ 
      success: true, 
      message: 'Registro creado exitosamente',
      data: result.recordset[0] 
    });
  } catch (err) {
    console.error('Error creando registro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Actualiza un registro existente
 */
async function updateRecord(req, res) {
  try {
    const { tableName, id } = req.params;
    const data = req.body;
    
    const pool = await getConnection();
    
    // Obtener primary key
    const pkResult = await pool.request()
      .input('tableName', sql.NVarChar, tableName)
      .query(`
        SELECT COLUMN_NAME as name
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE OBJECTPROPERTY(OBJECT_ID(CONSTRAINT_SCHEMA + '.' + CONSTRAINT_NAME), 'IsPrimaryKey') = 1
        AND TABLE_NAME = @tableName
      `);
    
    if (pkResult.recordset.length === 0) {
      return res.status(400).json({ success: false, error: 'Tabla sin primary key' });
    }
    
    const primaryKey = pkResult.recordset[0].name;
    
    // Obtener columnas
    const columnsResult = await pool.request()
      .input('tableName', sql.NVarChar, tableName)
      .query(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @tableName
        AND COLUMN_NAME != @primaryKey
      `, { primaryKey });
    
    // Construir SET clause
    const setClauses = [];
    const request = pool.request();
    
    columnsResult.recordset.forEach((col, idx) => {
      if (data.hasOwnProperty(col.COLUMN_NAME)) {
        setClauses.push(`[${col.COLUMN_NAME}] = @param${idx}`);
        const sqlType = getSqlType(col.DATA_TYPE);
        request.input(`param${idx}`, sqlType, data[col.COLUMN_NAME]);
      }
    });
    
    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: 'No hay datos para actualizar' });
    }
    
    request.input('id', sql.Int, id);
    
    const updateQuery = `
      UPDATE [${tableName}] 
      SET ${setClauses.join(', ')}
      OUTPUT INSERTED.*
      WHERE [${primaryKey}] = @id
    `;
    
    const result = await request.query(updateQuery);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    }
    
    res.json({ 
      success: true, 
      message: 'Registro actualizado exitosamente',
      data: result.recordset[0] 
    });
  } catch (err) {
    console.error('Error actualizando registro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Elimina un registro
 */
async function deleteRecord(req, res) {
  try {
    const { tableName, id } = req.params;
    const pool = await getConnection();
    
    // Obtener primary key
    const pkResult = await pool.request()
      .input('tableName', sql.NVarChar, tableName)
      .query(`
        SELECT COLUMN_NAME as name
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE OBJECTPROPERTY(OBJECT_ID(CONSTRAINT_SCHEMA + '.' + CONSTRAINT_NAME), 'IsPrimaryKey') = 1
        AND TABLE_NAME = @tableName
      `);
    
    if (pkResult.recordset.length === 0) {
      return res.status(400).json({ success: false, error: 'Tabla sin primary key' });
    }
    
    const primaryKey = pkResult.recordset[0].name;
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`DELETE FROM [${tableName}] WHERE [${primaryKey}] = @id`);
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    }
    
    res.json({ 
      success: true, 
      message: 'Registro eliminado exitosamente' 
    });
  } catch (err) {
    console.error('Error eliminando registro:', err);
    
    // Detectar violación de foreign key constraint
    if (err.message.includes('REFERENCE constraint')) {
      return res.status(400).json({ 
        success: false, 
        error: 'No se puede eliminar: el registro está siendo usado en otras tablas' 
      });
    }
    
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Obtiene datos relacionados para foreign keys
 */
async function getRelatedData(req, res) {
  try {
    const { tableName, columnName } = req.params;
    const pool = await getConnection();
    
    // Obtener tabla referenciada
    const fkResult = await pool.request()
      .input('tableName', sql.NVarChar, tableName)
      .input('columnName', sql.NVarChar, columnName)
      .query(`
        SELECT 
          OBJECT_NAME(f.referenced_object_id) AS ReferencedTable,
          COL_NAME(fc.referenced_object_id, fc.referenced_column_id) AS ReferencedColumn
        FROM sys.foreign_keys AS f
        INNER JOIN sys.foreign_key_columns AS fc 
          ON f.object_id = fc.constraint_object_id
        WHERE OBJECT_NAME(f.parent_object_id) = @tableName
        AND COL_NAME(fc.parent_object_id, fc.parent_column_id) = @columnName
      `);
    
    if (fkResult.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Foreign key no encontrada' });
    }
    
    const refTable = fkResult.recordset[0].ReferencedTable;
    const refColumn = fkResult.recordset[0].ReferencedColumn;
    
    // Obtener datos de la tabla referenciada
    const dataResult = await pool.request().query(`
      SELECT * FROM [${refTable}] ORDER BY [${refColumn}]
    `);
    
    res.json({ 
      success: true, 
      referencedTable: refTable,
      referencedColumn: refColumn,
      data: dataResult.recordset 
    });
  } catch (err) {
    console.error('Error obteniendo datos relacionados:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Ejecuta una consulta personalizada (con precaución)
 */
async function executeQuery(req, res) {
  try {
    const { query } = req.body;
    
    // Validación básica (mejorar en producción)
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'Query inválido' });
    }
    
    // Prevenir operaciones destructivas sin WHERE
    const lowerQuery = query.toLowerCase().trim();
    if ((lowerQuery.includes('delete') || lowerQuery.includes('update')) && 
        !lowerQuery.includes('where')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Operaciones DELETE/UPDATE requieren cláusula WHERE' 
      });
    }
    
    const pool = await getConnection();
    const result = await pool.request().query(query);
    
    res.json({ 
      success: true, 
      data: result.recordset,
      rowsAffected: result.rowsAffected 
    });
  } catch (err) {
    console.error('Error ejecutando query:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Mapea tipos de datos SQL a tipos de mssql
 */
function getSqlType(dataType) {
  const typeMap = {
    'int': sql.Int,
    'bigint': sql.BigInt,
    'smallint': sql.SmallInt,
    'tinyint': sql.TinyInt,
    'bit': sql.Bit,
    'float': sql.Float,
    'real': sql.Real,
    'decimal': sql.Decimal,
    'numeric': sql.Numeric,
    'money': sql.Money,
    'smallmoney': sql.SmallMoney,
    'varchar': sql.VarChar,
    'nvarchar': sql.NVarChar,
    'char': sql.Char,
    'nchar': sql.NChar,
    'text': sql.Text,
    'ntext': sql.NText,
    'date': sql.Date,
    'datetime': sql.DateTime,
    'datetime2': sql.DateTime2,
    'smalldatetime': sql.SmallDateTime,
    'time': sql.Time,
    'uniqueidentifier': sql.UniqueIdentifier,
    'xml': sql.Xml,
    'varbinary': sql.VarBinary,
    'binary': sql.Binary
  };
  
  return typeMap[dataType.toLowerCase()] || sql.NVarChar;
}

module.exports = {
  getTables,
  getTableSchema,
  getTableData,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  getRelatedData,
  executeQuery
};
