# Pruebas E2E

Playwright se ejecuta contra Compose completo con seed ficticio. Los proyectos cubren 360×800, 390×844, 430×932 y 1280×900. Comprueban autenticación, restauración, logout, dos pestañas, catálogo, validación y cancelación de importación, consola, overflow, targets táctiles y ventas. El smoke previo recorre además catálogo → albarán → emisión → factura → emisión → PDF.

```bash
cd factupapa-next/apps/web
DEMO_USER_EMAIL='demo@example.test' DEMO_USER_PASSWORD='valor-no-versionado' \
WEB_URL='http://127.0.0.1:4173' npm run test:e2e
```

Capturas de login, inicio, catálogo, detalle, errores de importación, albaranes y facturas, junto con traces, informe y un PDF ficticio, se guardan en directorios ignorados. El workflow los publica como artifact durante siete días y los elimina al finalizar.
