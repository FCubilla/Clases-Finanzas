# Conexion con Google Sheets

Este archivo te deja la app sincronizada entre celular y compu.

## 1) Crear la planilla

1. Crea una planilla en Google Sheets.
2. Renombra la primera hoja a `Clases`.
3. Crea otra hoja llamada `Gastos`.
4. La hoja `Rendiciones` se crea automáticamente al sincronizar la primera rendición.

## 2) Crear Apps Script

1. En la planilla, abre `Extensiones > Apps Script`.
2. Borra el codigo que aparece.
3. Usa el script exacto que ya tenes en el proyecto en [apps-script/Code.gs](apps-script/Code.gs). Ese script guarda clases, gastos y rendiciones, incluida la fecha y hora de cada rendición.

Si queres validar primero que tu Apps Script publica bien, usa temporalmente [apps-script/Code-min-test.gs](apps-script/Code-min-test.gs).

## Diagnostico rapido (si falla subida)

1. Publica primero el contenido de [apps-script/Code-min-test.gs](apps-script/Code-min-test.gs).
2. Hace POST a tu URL /exec y debe responder JSON con `ok: true`.
3. Si eso funciona, reemplaza por [apps-script/Code.gs](apps-script/Code.gs).
4. Vuelve a implementar una nueva version web y proba en la app.

## 3) Publicar el script

1. Click en `Implementar > Nueva implementacion`.
2. Tipo: `Aplicacion web`.
3. `Ejecutar como`: tu cuenta.
4. `Quien tiene acceso`: `Cualquiera`.
5. Copia la URL final (termina en `/exec`).

## 4) Configurar la app

1. En el proyecto, crea un archivo `.env` en la raiz.
2. Copia el contenido de `.env.example` y reemplaza valores:

```env
VITE_SHEETS_API_URL=https://script.google.com/macros/s/TU_DEPLOY_ID/exec
VITE_SHEETS_API_TOKEN=facupadel_token_2026
```

## 5) Probar sincronizacion

1. Ejecuta `npm run dev`.
2. Entra al panel.
3. Usa `Sincronizar` para traer datos de Sheets.
4. Usa `Subir local` para mandar lo cargado localmente.
5. Desde celular y compu, usa la misma app publicada para compartir datos.

## Notas

- Si cambias `APP_TOKEN` en Apps Script, cambia tambien `VITE_SHEETS_API_TOKEN`.
- Si actualizas el script y haces una nueva implementacion, revisa si cambio la URL.
