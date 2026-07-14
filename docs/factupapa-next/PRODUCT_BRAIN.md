# FactuPapa Next — Product Brain

**Versión:** 1.0  
**Fecha:** 14 de julio de 2026  
**Estado:** Documento rector del proyecto  
**Rama de trabajo inicial:** `design/factupapa-full-prototype`

---

## 1. Misión

Crear una aplicación móvil de gestión y facturación extremadamente sencilla, elegante y profesional, capaz de convertirse en la herramienta principal de trabajo de un autónomo.

La primera beta será exclusiva para el negocio de Nando y estará optimizada para su operativa real. Sin embargo, la arquitectura interna debe quedar preparada desde el primer día para evolucionar hacia un producto genérico utilizable por autónomos de distintos sectores.

La aplicación debe permitir gestionar el negocio desde el móvil con rapidez, claridad y confianza: facturar, cobrar, registrar compras y gastos, organizar documentos, consultar rentabilidad, controlar clientes y tomar decisiones.

---

## 2. Visión de producto

FactuPapa Next no debe ser una copia pequeña de un ERP complejo.

Debe ser una aplicación móvil que:

- Resuelva las tareas habituales en pocos toques.
- Presente primero lo importante y lo pendiente.
- Automatice tareas repetitivas.
- Evite errores administrativos.
- Centralice documentos y datos.
- Tenga una estética premium y reconocible.
- Pueda usarse sin conocimientos contables avanzados.
- Sea útil primero para un negocio real y después ampliable a otros.

La referencia no es “tener muchas funciones”, sino distribuirlas tan bien que la aplicación siga pareciendo sencilla.

---

## 3. Regla principal de desarrollo

La aplicación actual de producción es intocable.

Todo FactuPapa Next se desarrollará en paralelo y de forma aislada.

### Queda prohibido

- Modificar `main` para probar funcionalidades de FactuPapa Next.
- Alterar la aplicación actual de producción.
- Sustituir la base de datos o almacenamiento actual antes de completar y validar la migración.
- Hacer merge sin una autorización explícita de Nando.
- Utilizar datos reales como campo de pruebas sin una copia o entorno aislado.
- Desplegar una versión como producción sin validación previa.

### Se permite

- Crear ramas independientes.
- Crear entornos de preview.
- Crear una base de datos y almacenamiento nuevos.
- Importar copias de datos para pruebas.
- Desarrollar módulos completos en paralelo.
- Realizar despliegues temporales de preview para pruebas móviles.

La aplicación actual seguirá siendo la herramienta diaria hasta que FactuPapa Next sea claramente superior, estable y compatible con la operativa real.

---

## 4. Estrategia de producto

### Fase inicial

La primera versión será específica para Nando.

Debe reflejar:

- Venta de productos alimentarios.
- Facturación por quincenas o periodos.
- Productos vendidos por peso.
- Precios específicos por cliente.
- Albaranes acumulables.
- Compras de materia prima.
- Gastos del negocio.
- Cobros completos y parciales.
- Deuda por cliente.
- Envío de facturas por WhatsApp y correo.
- Impresión directa.
- Uso intensivo desde el móvil.

### Preparación futura

Aunque la interfaz inicial sea específica, el núcleo debe modelarse de forma genérica:

- Empresas.
- Usuarios.
- Clientes.
- Proveedores.
- Productos y servicios.
- Documentos comerciales.
- Líneas de documento.
- Cobros y pagos.
- Gastos y compras.
- Archivos adjuntos.
- Impuestos.
- Series y numeración.
- Automatizaciones.
- Roles y permisos.

La personalización sectorial debe construirse como configuración o módulos, no como lógica rígida imposible de reutilizar.

---

## 5. Principios no negociables

1. **Móvil primero.** Toda acción habitual debe diseñarse primero para teléfono.
2. **Sencillez visible.** La complejidad puede existir internamente, pero no debe trasladarse al usuario.
3. **Acciones frecuentes a un toque.** Facturar, imprimir, enviar, cobrar y consultar deuda deben estar visibles.
4. **Datos fiables.** Ninguna operación económica debe desaparecer silenciosamente.
5. **Trabajo sin interrupciones.** La aplicación debe tolerar conexiones deficientes y reintentar sincronizaciones.
6. **Documentos propios.** FactuPapa debe almacenar y organizar sus propios documentos sin depender estructuralmente de Google Drive.
7. **Automatización supervisada.** El OCR y la IA deben proponer datos; el usuario confirma antes de contabilizar.
8. **Auditoría.** Debe quedar constancia de cambios, eliminaciones, cobros y sincronizaciones.
9. **Recuperabilidad.** Papelera, copias y restauración deben existir antes de confiar datos críticos.
10. **Escalabilidad razonable.** No construir un sistema empresarial gigante antes de necesitarlo.
11. **Impacto visual.** La aplicación debe transmitir calidad desde la primera pantalla.
12. **Utilidad medible.** Una función solo entra si ahorra tiempo, reduce errores o mejora el control económico.

---

## 6. Identidad visual

### Dirección estética

- Profesional.
- Elegante.
- Sobria.
- Moderna.
- Cálida sin ser infantil.
- Con alta percepción de calidad.

### Paleta inicial

- Azul tinta principal: `#14213D`
- Azul profundo: `#0B132B`
- Dorado principal: `#D6A649`
- Dorado claro: `#E8C879`
- Marfil de fondo: `#F7F6F1`
- Blanco de superficies: `#FFFFFF`
- Verde positivo: `#27865D`
- Ámbar pendiente: `#D78A21`
- Rojo vencido/error: `#C64B4B`
- Azul pago parcial: `#3976C6`

La identidad puede evolucionar, pero debe mantener esta sensación general: aplicación financiera premium con personalidad propia.

---

## 7. Navegación principal propuesta

La navegación base tendrá cinco áreas:

1. **Inicio**
2. **Ventas**
3. **Nuevo**
4. **Contactos**
5. **Más**

El botón central “Nuevo” permitirá crear:

- Factura.
- Albarán.
- Presupuesto.
- Cobro.
- Compra.
- Gasto.
- Cliente.
- Proveedor.

La sección “Más” incluirá inicialmente:

- Negocio.
- Informes.
- Documentos.
- Sincronización.
- Configuración.
- Papelera.

Esta estructura podrá ajustarse tras probarla con uso real, pero no debe llenarse la barra principal con demasiadas secciones.

---

## 8. Módulos funcionales

### 8.1 Inicio

Debe responder rápidamente:

- Cuánto se ha facturado.
- Cuánto se ha cobrado.
- Cuánto queda pendiente.
- Cuánto se ha gastado.
- Cuál es el resultado estimado.
- Qué requiere atención.

Debe mostrar:

- Facturas vencidas.
- Albaranes sin facturar.
- Gastos sin justificante.
- Compras pendientes.
- Errores de sincronización.
- Copias pendientes.

### 8.2 Ventas

Incluye:

- Facturas.
- Albaranes.
- Presupuestos.
- Cobros.

Acciones de primer nivel en factura:

- Abrir.
- Imprimir.
- Generar o ver PDF.
- Enviar por WhatsApp.
- Enviar por correo.
- Registrar cobro.
- Duplicar.
- Rectificar.
- Editar cuando sea legalmente posible.

### 8.3 Contactos

Clientes y proveedores.

La ficha de cliente mostrará:

- Facturación acumulada.
- Pendiente.
- Vencido.
- Pagos parciales.
- Productos habituales.
- Precio acordado.
- Historial de precios.
- Documentos.
- Extracto de cuenta.
- Acciones rápidas.

### 8.4 Compras y gastos

Debe permitir:

- Crear compra manualmente.
- Fotografiar una factura o ticket.
- Subir PDF o imagen.
- Procesar con OCR.
- Proponer proveedor, fecha, base, IVA, total y categoría.
- Confirmar o corregir.
- Guardar el archivo original.
- Marcar pago.
- Asociar compra a producto o coste.

### 8.5 Productos y stock

Debe manejar:

- Productos y servicios.
- Unidades.
- Precios.
- Costes estimados.
- Margen.
- Precios específicos por cliente.
- Historial de precios.
- Entradas y salidas de stock.
- Mermas y ajustes.

### 8.6 Documentos

FactuPapa debe incorporar almacenamiento documental propio.

Cada archivo debe:

- Estar asociado a una empresa.
- Tener tipo documental.
- Tener fecha y proveedor o cliente.
- Conservar el archivo original.
- Conservar los datos extraídos por OCR.
- Tener estado de revisión.
- Poder descargarse, imprimirse y compartirse.

Google Drive podrá mantenerse como importador o copia externa opcional, pero no como dependencia estructural.

### 8.7 Informes

Inicialmente:

- Ventas.
- Cobros.
- Deuda.
- Compras.
- Gastos.
- IVA.
- Margen.
- Rentabilidad por cliente.
- Rentabilidad por producto.

Los informes deben responder preguntas concretas, no presentar gráficas decorativas.

---

## 9. Arquitectura funcional objetivo

FactuPapa Next deberá funcionar como un sistema real cliente-servidor.

### Aplicación cliente

Responsable de:

- Interfaz.
- Captura de fotografías.
- Navegación.
- Trabajo temporal sin conexión.
- Envío de cambios al servidor.
- Recepción de datos actualizados.

### Backend

Responsable de:

- Autenticación.
- Reglas de negocio.
- Numeración documental.
- Persistencia de datos.
- Procesamiento de OCR.
- Gestión de archivos.
- Permisos.
- Auditoría.
- Copias.
- API para móvil y web.

### Base de datos

Debe almacenar datos estructurados del negocio.

### Almacenamiento de objetos

Debe guardar:

- Facturas.
- Tickets.
- Fotografías.
- PDFs.
- Logos.
- Adjuntos.
- Copias exportadas.

### OCR

Debe funcionar como proceso independiente:

1. Se captura o sube un documento.
2. Se almacena el original.
3. Se lanza el OCR.
4. Se extraen campos.
5. Se calcula una confianza.
6. Se presenta una propuesta.
7. El usuario confirma o corrige.
8. Se crea la compra o gasto.

---

## 10. Infraestructura y coste inicial

La primera beta puede ejecutarse en la VPS de Hetzner de Nando.

El objetivo inicial es mantener el coste próximo a cero utilizando la infraestructura ya contratada.

La VPS puede alojar:

- API/backend.
- Base de datos PostgreSQL.
- Almacenamiento inicial de documentos.
- Procesamiento OCR básico.
- Copias programadas.
- Entorno de pruebas.

Antes de usarla con datos críticos deberán existir:

- HTTPS.
- Copias automáticas externas.
- Control de acceso.
- Cifrado de secretos.
- Supervisión de espacio y errores.
- Separación entre pruebas y producción.

Los costes variables aparecerán principalmente cuando crezcan:

- Número de usuarios.
- Cantidad de documentos.
- OCR procesado.
- Almacenamiento.
- Correos enviados.
- Notificaciones.
- Copias externas.
- Publicación en tiendas.

No se contratarán servicios de pago antes de que aporten una ventaja clara sobre la VPS disponible.

---

## 11. Orden de construcción

### Etapa 0 — Protección del sistema actual

- Documentar la aplicación actual.
- Confirmar backups.
- Confirmar ramas y despliegues.
- Definir aislamiento de FactuPapa Next.
- Prohibir cambios accidentales en producción.

### Etapa 1 — Cimientos de FactuPapa Next

- Crear proyecto independiente.
- Configurar backend.
- Configurar PostgreSQL.
- Configurar almacenamiento.
- Crear usuarios y empresa.
- Crear API base.
- Configurar copias y auditoría mínima.

### Etapa 2 — Núcleo de facturación

- Clientes.
- Productos.
- Series.
- Facturas.
- Líneas.
- PDF.
- Impresión.
- WhatsApp.
- Correo.
- Cobros.
- Pagos parciales.

### Etapa 3 — Albaranes y precios

- Albaranes.
- Conversión a factura.
- Agrupación por cliente.
- Precios particulares.
- Historial de precios.
- Periodos y quincenas.

### Etapa 4 — Compras, gastos y documentos

- Proveedores.
- Compras.
- Gastos.
- Subida de archivos.
- Cámara.
- OCR.
- Validación.
- Organización documental.

### Etapa 5 — Stock y rentabilidad

- Movimientos de stock.
- Costes.
- Margen.
- Mermas.
- Rentabilidad por cliente y producto.

### Etapa 6 — Migración de prueba

- Importar una copia de datos actuales.
- Comparar resultados.
- Probar durante un periodo en paralelo.
- Corregir diferencias.
- Preparar reversión.

### Etapa 7 — Sustitución controlada

Solo cuando:

- Las funciones esenciales estén completas.
- Los datos cuadren.
- Se hayan probado copias y restauración.
- La app funcione desde móvil.
- La impresión, PDF, WhatsApp y cobros estén validados.
- Nando pueda completar su jornada sin volver a la aplicación antigua.

### Etapa 8 — Preparación comercial

- Multiempresa.
- Registro de usuarios.
- Suscripciones.
- Configuración sectorial.
- Onboarding.
- Soporte.
- Privacidad y condiciones.
- Publicación en App Store y Google Play.

---

## 12. Forma de trabajo

Nando no tiene que decidir tecnologías, arquitectura ni orden técnico.

La responsabilidad del asistente es:

- Elegir el siguiente paso lógico.
- Explicar las consecuencias en lenguaje de negocio.
- Proponer soluciones completas.
- Evitar decisiones que obliguen a rehacer el sistema.
- Proteger producción.
- Mantener este documento actualizado.
- Registrar decisiones importantes.
- Avisar cuando una sesión se vuelva demasiado larga o costosa.

Nando debe intervenir principalmente en:

- Describir cómo trabaja.
- Probar flujos.
- Identificar molestias o necesidades.
- Validar que una función resuelve el problema real.
- Crear o autorizar cuentas cuando legalmente sea necesario.

No se le pedirá decidir entre tecnologías salvo que afecte directamente al coste, propiedad, privacidad o dependencia de terceros.

---

## 13. Gestión de contexto y coste de sesiones

Este documento será la fuente principal de contexto.

Para evitar conversaciones excesivamente largas:

- Cada sesión tendrá un objetivo concreto.
- Al terminar, se actualizará el estado del proyecto.
- Las decisiones se registrarán aquí o en documentos vinculados.
- Cuando una conversación acumule demasiado contexto, se preparará un resumen de relevo.
- Una conversación nueva deberá poder continuar leyendo solo este documento y el registro de estado.

No se dependerá de recordar conversaciones extensas.

---

## 14. Estado actual

### Producción

- Aplicación actual en uso diario.
- Repositorio: `gonsoldelavega/apPatatas3`.
- Rama de producción: `main`.
- Producción no debe alterarse.

### Prototipo

- Rama: `design/factupapa-full-prototype`.
- Prototipo visual navegable creado en `prototype/factupapa-v2/`.
- Preview temporal disponible mediante Vercel.
- Incluye diseño de Inicio, Ventas, Contactos, Negocio, creación de factura y detalle.
- Se ha añadido impresión como acción de primer nivel.
- Utiliza datos ficticios.
- No está conectado a la lógica real.

### Siguiente objetivo recomendado

La base técnica aislada de FactuPapa Next ya incluye:

- Entorno Docker de desarrollo definido con PostgreSQL, Redis, MinIO, migrador y API, pendiente de validación integral en un host con Docker.
- Backend TypeScript mínimo con endpoints de vida y disponibilidad.
- Migraciones iniciales versionadas con comprobación de integridad.
- Pruebas básicas y documentación de arquitectura, arranque y verificación.

El siguiente objetivo recomendado es validar el Compose completo en un host con Docker, documentar la infraestructura disponible en la VPS de Hetzner y diseñar la autenticación inicial de usuario único, sin modificar la aplicación actual ni desplegar en producción.

### Estado del primer entregable técnico

- Backend mínimo: preparado.
- Base de datos PostgreSQL: preparada mediante Docker.
- Almacenamiento de archivos: MinIO preparado; integración desde la API pendiente.
- Autenticación de un solo usuario: pendiente.
- Página de estado: endpoints de vida y disponibilidad preparados.
- Copia automática: pendiente.

Todavía no se migrarán datos reales ni se sustituirá ninguna función de producción.

---

## 15. Criterio de éxito de la beta privada

La beta privada se considerará preparada para uso diario cuando Nando pueda:

- Crear una factura.
- Imprimirla.
- Generar PDF.
- Enviarla por WhatsApp y correo.
- Registrar cobros totales y parciales.
- Crear y agrupar albaranes.
- Consultar deuda por cliente.
- Registrar compras y gastos.
- Fotografiar una factura y validar el OCR.
- Consultar los documentos originales.
- Trabajar desde el móvil.
- Recuperar datos desde una copia.
- Ver datos consistentes en varios dispositivos.

Y todo ello sin depender de Google Drive como sistema central.

---

## 16. Decisión vigente

**FactuPapa Next se construye primero como la mejor herramienta posible para Nando, pero con un núcleo preparado para convertirse más adelante en un producto para autónomos.**

**La aplicación actual no se modifica ni se sustituye hasta que la nueva versión esté completa, probada y validada en paralelo.**
