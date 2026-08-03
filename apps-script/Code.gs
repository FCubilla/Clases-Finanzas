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
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  )
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
