function doPost() {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, ping: 'apps-script funcionando' }),
  ).setMimeType(ContentService.MimeType.JSON)
}
