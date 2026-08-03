# Conexion con Google Sheets

Este archivo te deja la app sincronizada entre celular y compu.

## 1) Crear la planilla

1. Crea una planilla en Google Sheets.
2. Renombra la primera hoja a `Clases`.
3. Crea otra hoja llamada `Gastos`.

## 2) Crear Apps Script

1. En la planilla, abre `Extensiones > Apps Script`.
2. Borra el codigo que aparece.
3. Usa el script exacto que ya tenes en el proyecto en [apps-script/Code.gs](apps-script/Code.gs).

Si queres validar primero que tu Apps Script publica bien, usa temporalmente [apps-script/Code-min-test.gs](apps-script/Code-min-test.gs).

```javascript
const APP_TOKEN = 'facupadel_token_2026'
const CLASSES_SHEET = 'Clases'
const EXPENSES_SHEET = 'Gastos'

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}')

    if (payload.token !== APP_TOKEN) {
      return json({ ok: false, error: 'Token invalido' })
    }

    const action = payload.action

    if (action === 'getData') {
      return json({
        ok: true,
        classes: readRows(CLASSES_SHEET),
        expenses: readRows(EXPENSES_SHEET),
      })
    }

    if (action === 'saveAll') {
      writeRows(CLASSES_SHEET, payload.classes || [])
      writeRows(EXPENSES_SHEET, payload.expenses || [])
      return json({ ok: true })
    }

    return json({ ok: false, error: 'Accion no soportada' })
  } catch (error) {
    return json({ ok: false, error: String(error) })
  }
}

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
}

function readRows(sheetName) {
  const sheet = getOrCreateSheet(sheetName)
  const values = sheet.getDataRange().getValues()

  if (values.length <= 1) return []

  const headers = values[0]
  const rows = values.slice(1)

  return rows
    .filter((row) => row.some((cell) => String(cell).trim() !== ''))
    .map((row) => {
      const obj = {}
      headers.forEach((header, index) => {
        obj[header] = row[index]
      })

      if (sheetName === CLASSES_SHEET) {
        obj.amount = Number(obj.amount || 0)
        obj.paid = String(obj.paid) === 'true' || obj.paid === true
      }

      if (sheetName === EXPENSES_SHEET) {
        obj.amount = Number(obj.amount || 0)
      }

      return obj
    })
}

function writeRows(sheetName, rows) {
  const sheet = getOrCreateSheet(sheetName)
  const headers = getHeadersFor(sheetName)

  sheet.clearContents()
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])

  if (!rows.length) return

  const data = rows.map((item) => headers.map((h) => item[h] ?? ''))
  sheet.getRange(2, 1, data.length, headers.length).setValues(data)
}

function getHeadersFor(sheetName) {
  if (sheetName === CLASSES_SHEET) {
    return ['id', 'date', 'student', 'type', 'amount', 'paid', 'paymentMethod', 'notes']
  }

  return ['id', 'date', 'concept', 'amount', 'category', 'notes']
}

function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName(name)

  if (!sheet) {
    sheet = ss.insertSheet(name)
  }

  return sheet
}
```

## Diagnostico rapido (si falla subida)

1. Publica primero el contenido de [apps-script/Code-min-test.gs](apps-script/Code-min-test.gs).
2. Hace POST a tu URL /exec y debe responder JSON con `ok: true`.
3. Si eso funciona, reemplaza por [apps-script/Code.gs](apps-script/Code.gs).
4. Vuelve a implementar nueva version web y proba en la app.

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
