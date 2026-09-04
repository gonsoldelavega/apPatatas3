# CLAUDE.md — Guía específica para Claude

## Política canónica

Lee y aplica primero `AGENTS.md`.

`AGENTS.md` es la autoridad del repositorio para:

- autonomía;
- aprobaciones;
- definición de tarea terminada;
- verificación;
- Git y despliegue;
- cuándo ejecutar auditorías de datos o cierres mensuales.

Este archivo añade contexto específico de Factupapa y del entorno de Claude. **No crea nuevas puertas de aprobación.** Si una frase de este archivo pudiera interpretarse como una confirmación adicional, prevalece `AGENTS.md`.

## Qué es este proyecto

Factupapa es una PWA mobile-first de facturación y gestión para un negocio pequeño de patatas/hortalizas.

- **Fuente de verdad de las compras:** Google Sheets `REGISTRO` (`Gonsol de la Vega - Registro maestro`), consumido por `/api/purchase-registry`.
- **Supabase** es almacenamiento secundario y puede estar pausado; no debe asumirse como fuente principal de compras.
- **Sin IA/OCR/escáner dentro de la app:** esas funciones se eliminaron. No reintroducirlas salvo petición explícita del usuario, según `AGENTS.md`.

## Agente de facturas de Google Apps Script

Proyecto: `Gonsol Drive Organizer` en `apps-script/gonsol-drive-organizer/`.

Responsabilidades conocidas:

- lee facturas desde la bandeja de Drive usando OCR de Google;
- extrae datos mediante reglas/parsers;
- registra en `REGISTRO`;
- archiva en `02_COMPRAS/<año>/<trimestre>/<mes>`;
- importa PDFs de determinados proveedores desde Gmail cuando la configuración correspondiente está activa.

Proveedores con parser/NIF conocido:

- `A04037677` → FRUTAS Y PATATAS GAYCA, S.A.
- `B04854154` → J. EXPÓSITO CAZORLA E HIJOS, S.L.
- `B42743211` → HIGIENLAB 2020 S.L.
- Solred/Repsol → combustible

NIF propio a excluir como proveedor: `45313973V`.

Regla contable clave: **cada factura pertenece a su mes; nunca mezclar meses.**

Cuando la importación automática de Gmail de GAYCA esté activa, no dupliques esa entrada mediante un segundo flujo manual/automático.

### Despliegue de Apps Script

Existe `.github/workflows/deploy-appsscript.yml` con credenciales gestionadas como secretos de GitHub.

La documentación histórica indica que el flujo tuvo un problema `invalid_grant` relacionado con OAuth en modo prueba. **No asumas que ese estado histórico sigue vigente**: antes de afirmar que el despliegue de Apps Script está roto o activo, verifica el estado actual del workflow y de sus ejecuciones si las herramientas disponibles lo permiten.

Tras introducir por primera vez scopes nuevos de Google, puede ser necesaria una autorización interactiva en Apps Script. Si ese paso sigue siendo necesario y no puede realizarse con las herramientas disponibles, repórtalo como bloqueo externo real; no lo conviertas en una confirmación rutinaria.

## Capacidades del entorno

Las capacidades de conectores cambian con el tiempo. Antes de afirmar que una operación es imposible, comprueba las herramientas disponibles en la sesión.

Reglas estables:

- nunca guardes `APP_SYNC_TOKEN`, OAuth tokens, claves, secretos o credenciales en el repositorio público;
- usa variables de entorno o mecanismos de secretos cuando estén disponibles;
- si una acción requiere una interfaz o permiso no disponible, completa primero todo lo que sí pueda hacerse y reporta únicamente el paso externo pendiente.

## Reglas de trabajo específicas

- Mantén español en la UI y textos de cara al usuario.
- El usuario trabaja con frecuencia desde móvil: cuando quede un paso manual inevitable, descríbelo de forma concreta.
- No pidas confirmación para commit, push, merge a `main` o despliegue verificado de cambios ya solicitados: esa autorización está definida en `AGENTS.md`.
- No ejecutes auditorías de datos ni cierres mensuales como ritual al comienzo de cualquier sesión. Usa las condiciones de `AGENTS.md`.
- Para despliegues, usa `.claude/commands/desplegar.md` o `.agents/skills/factupapa-deploy/SKILL.md`.
- Para integridad de datos, usa `.claude/commands/revisar-datos.md` o `.agents/skills/factupapa-data-audit/SKILL.md`.
- Para cierre mensual, usa `.claude/commands/cierre-mensual.md` o `.agents/skills/factupapa-monthly-close/SKILL.md`.

## Eficiencia

- Mantén el contexto enfocado en el trabajo actual.
- No vuelques salidas enormes si basta con filtros, rangos o búsquedas dirigidas.
- En archivos grandes, usa búsquedas y lecturas por secciones en lugar de imprimir el archivo entero cuando no sea necesario.
- No repitas información ya confirmada.
- La eficiencia nunca debe usarse como excusa para saltarse verificaciones necesarias o terminar una tarea a medias.
