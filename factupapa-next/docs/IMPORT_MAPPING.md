# Mapeo de columnas

El asistente móvil sigue cinco pasos: archivo, columnas, errores, estrategia y confirmación. Admite contactos, productos y precios específicos desde CSV o JSON.

`POST /imports/detect-columns` devuelve cabeceras, campos disponibles, obligatorios, propuesta, desconocidos, duplicados y ambigüedades. `POST /imports/validate` acepta `mappingId` o `mapping`, nunca ambos. El mapping normalizado relaciona campo de destino con columna de origen. Una fuente no puede repetirse y todos los obligatorios deben existir.

Las plantillas se gestionan con `GET/POST /import-mappings`, `GET/PATCH/DELETE /import-mappings/:id`. Son privadas de la empresa, tienen RLS y `FORCE RLS`, baja lógica, nombre único activo por entidad y auditoría. `company_id` nunca se acepta del cliente.

El archivo original no se persiste. Solo quedan checksum, mapping normalizado, filas normalizadas y diagnósticos acotados. La preview neutraliza valores que parezcan fórmulas; nada del archivo se ejecuta. Los decimales siguen siendo strings para conservar precisión.

Errores como obligatorio ausente, origen duplicado, cabecera duplicada, campo desconocido, ambigüedad, vacío o formato inválido bloquean la confirmación. El lote se bloquea durante confirmación para impedir dobles commits y carreras con limpieza.
