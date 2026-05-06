# Agente facturas-drive

Automatizacion propuesta para procesar facturas de compras subidas a Google Drive.

## Objetivo

Cada dia, n8n revisa la carpeta de entrada, analiza las facturas de compra, calcula año/trimestre, mueve el archivo a la carpeta correcta y añade una fila en el registro maestro.

## IDs reales

- Entrada compras pendiente:
  `1ETAzvmssbDM7cLDUEy89quY0xEnNecd4`
  `99_PENDIENTE_DE_CLASIFICAR`

- Carpeta raiz del sistema:
  `1Cf1MxBpJ1UsE4wNh_93-eplycyg69u7T`

- Carpeta compras:
  `1Q627xLAkvxB_MqUMCYPsTXRKoJIOvMvR`
  `02_COMPRAS`

- Compras 2026:
  `1DdOU176x510MbGGoGCagu5pfvWKdsI3R`

- Trimestres 2026:
  - T1: `1EP7xP5fYmgcit8cCmRrcXTtTy1UG52tP`
  - T2: `1Z4J2e8Nfm9Z-o2AjQ5ZKbdJwxTRvLO6G`
  - T3: `1neQiDnzu6Fa0CRxh2VFfmRLWq_dyySA9`
  - T4: `19pJwQJM4sv2BFuVC4JQ8v10UIOT8S2Sw`

- Registro maestro:
  `1wbpVv9TpJGz7KkM-k2BusqHnEzUikOaadRWbdkMDbDU`
  `Gonsol de la Vega - Registro maestro`

- Hoja principal:
  `REGISTRO`

## Columnas de REGISTRO

1. Fecha documento
2. Fecha registro
3. Tipo
4. Subtipo
5. Serie / Nº
6. Cliente / Proveedor
7. NIF/CIF
8. Concepto
9. Categoría
10. Base imponible
11. IVA %
12. Cuota IVA
13. Total
14. Estado
15. Método pago
16. Mes
17. Trimestre
18. Año
19. Ruta / enlace Drive
20. Nombre archivo
21. Revisado
22. Observaciones

## Agente OpenClaw

Agente creado:

```powershell
openclaw agent --local --agent facturas-drive --message "Clasifica esta factura..." --json
```

El agente debe devolver JSON con este formato:

```json
{
  "fecha_documento": "2026-05-02",
  "tipo": "compra",
  "subtipo": "factura",
  "numero": "FV006-00000000",
  "proveedor": "FRUTAS Y PATATAS GAYCA, S.A.",
  "nif_cif": "A04037677",
  "concepto": "PATATAS AGRIA",
  "categoria": "Materia prima",
  "base_imponible": 105.0,
  "iva_porcentaje": 4,
  "cuota_iva": 4.2,
  "total": 109.2,
  "estado": "pagado",
  "mes": "05_MAYO",
  "trimestre": "T2",
  "anio": "2026",
  "nombre_archivo_sugerido": "2026-05-02_FACTURA_COMPRA_GAYCA_FV006-00000000_109,20.pdf",
  "requiere_revision": false,
  "confianza": 0.91,
  "observaciones": ""
}
```

## Modo seguro recomendado

Primera fase:

- Descargar y analizar facturas.
- Escribir fila en REGISTRO con `Revisado = no` si confianza baja.
- Mover automaticamente solo si `confianza >= 0.80` y fecha/total/proveedor existen.
- Si no, dejar en pendiente o mover a revision manual.

Segunda fase:

- Activar movimiento automatico completo.
- Crear carpetas de años/trimestres futuros si no existen.
- Añadir deteccion de duplicados por proveedor + numero + total.

