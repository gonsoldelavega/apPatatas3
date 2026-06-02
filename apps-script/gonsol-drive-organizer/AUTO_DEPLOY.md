# Auto-despliegue del agente a Google Apps Script

Con esto, **cada vez que se mejore el agente** (`Code.gs`), GitHub lo sube solo a tu
proyecto de Apps Script. No tendras que volver a copiar y pegar nada.

El despliegue lo hace el workflow `.github/workflows/deploy-appsscript.yml` usando
[`clasp`](https://github.com/google/clasp) (la herramienta oficial de Google).

---

## Lo que hay que hacer UNA sola vez

Son 3 cosas. Solo la nº 2 necesita un ordenador con Node una vez; el resto es navegador.

### 1. Activar la API de Apps Script (1 clic)

Entra en: <https://script.google.com/home/usersettings>
y pon **"Google Apps Script API"** en **ON**.

### 2. Obtener la credencial de `clasp` (`CLASPRC_JSON`)

En un ordenador con Node instalado, abre una terminal y ejecuta:

```bash
npm install -g @google/clasp@2.4.2
clasp login
```

Se abrira el navegador para iniciar sesion con **tu cuenta de Google** (la misma del
agente). Al terminar, se crea un archivo con la credencial:

- Windows: `%USERPROFILE%\.clasprc.json`
- Mac / Linux: `~/.clasprc.json`

Abre ese archivo y copia **todo su contenido**.

> ¿Sin ordenador con Node? Se puede obtener la misma credencial solo con el navegador
> (OAuth Playground). Pidemelo y te paso los pasos exactos.

### 3. Conseguir el Script ID (`SCRIPT_ID`)

Abre el proyecto en Apps Script -> icono de engranaje (**Configuracion del proyecto**)
-> seccion **IDs** -> copia el **ID de secuencia de comandos / Script ID**.

(Tambien aparece en la URL del editor: `script.google.com/.../projects/SCRIPT_ID/edit`.)

---

## Guardar los dos secretos en GitHub

En el repositorio:

**Settings → Secrets and variables → Actions → New repository secret**

Crea estos dos (todo desde el navegador, sin tocar codigo):

| Nombre | Valor |
| --- | --- |
| `CLASPRC_JSON` | el contenido del archivo `.clasprc.json` del paso 2 |
| `SCRIPT_ID` | el Script ID del paso 3 |

---

## Listo

A partir de ahi:

- Cada cambio en `apps-script/gonsol-drive-organizer/**` que llegue a `main` se
  despliega solo a tu Apps Script.
- Tambien puedes lanzarlo a mano desde GitHub: pestaña **Actions** ->
  **Deploy Apps Script** -> **Run workflow**.

El disparador diario de las 7:00 ya estaba configurado en tu proyecto, asi que seguira
ejecutando el codigo actualizado sin mas pasos.

> Nota: la credencial de `clasp` caduca con el tiempo si no se usa. Como el workflow la
> usa cada vez que hay cambios, se mantiene viva. Si algun dia el despliegue falla por
> credencial caducada, basta con repetir el paso 2 y actualizar el secreto `CLASPRC_JSON`.
