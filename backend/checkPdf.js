const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function checkPdf() {
  const pdfBytes = fs.readFileSync('templates/To-Khai-01-CNKD.pdf');
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  console.log('Number of fields:', fields.length);
  fields.forEach(f => {
    console.log(f.getName(), f.constructor.name);
  });
}
checkPdf().catch(console.error);
