# Pruebas E2E

Playwright ejecuta cinco flujos funcionales contra Compose completo con seed
ficticio. Cada flujo se repite en cuatro viewports: 360×800, 390×844,
430×932 y 1280×900. Comprueban autenticación, restauración, logout, dos
pestañas, catálogo, mapeo automático y manual, campos obligatorios,
duplicados, plantillas, cancelación y confirmación de importaciones, errores de
red, consola, overflow, targets táctiles y ventas.

La versión de Playwright está fijada exactamente en `package.json` y
`package-lock.json`. La instalación reproducible del Chromium correspondiente
se realiza siempre desde la dependencia local bloqueada:

```bash
cd factupapa-next/apps/web
npm ci
npm run playwright:install
```

La dependencia `@playwright/test` está fijada exactamente y Chromium se instala desde esa versión después de `npm ci`; CI no usa un Playwright global.

```bash
cd factupapa-next/apps/web
DEMO_USER_EMAIL='demo@example.test' DEMO_USER_PASSWORD='valor-no-versionado' \
WEB_URL='http://127.0.0.1:4173' npm run test:e2e
```

El flujo de ventas E2E escribe un albarán ficticio desde la interfaz, lo emite,
lo convierte en factura, emite y valida el PDF, cancela la factura, comprueba
que el albarán queda reabierto, lo refactura y emite la nueva factura. Las
pruebas de integración verifican además `released_at` y los eventos de
auditoría con SQL ejecutado por el rol API real.

Capturas de login, inicio, catálogo, detalle, errores de importación, albaranes
y facturas, junto con el informe y un PDF ficticio, se guardan en directorios
ignorados. Los traces están desactivados para no publicar cookies ni cabeceras
de autorización. El workflow publica la evidencia durante siete días y la
elimina al finalizar.
