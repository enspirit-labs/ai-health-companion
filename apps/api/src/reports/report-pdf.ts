import PDFDocument from 'pdfkit';
import { WELLNESS_DISCLAIMER, WELLNESS_SIGNAL_LABELS, type ReportDto } from '@aidoctor/shared';

export async function buildReportPdf(report: ReportDto): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).fillColor('#000000').text(report.title);
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#666666').text(`Generated ${new Date(report.createdAt).toLocaleString()}`);
    doc.moveDown();

    if (report.summary) {
      doc.fontSize(12).fillColor('#000000').text(report.summary);
      doc.moveDown();
    }

    for (const section of report.sections) {
      doc.fontSize(15).fillColor('#000000').text(section.heading);
      if (section.score !== null) {
        const signal = section.riskLevel ? WELLNESS_SIGNAL_LABELS[section.riskLevel] : 'N/A';
        doc.fontSize(12).text(`Score: ${Math.round(section.score)} / 100   Wellness signal: ${signal}`);
      }
      doc.moveDown(0.5);

      if (section.observations.length > 0) {
        doc.fontSize(13).text('Observations');
        for (const obs of section.observations) {
          doc.fontSize(11).text(`• ${obs.label}: ${obs.value}`);
        }
        doc.moveDown(0.5);
      }

      if (section.recommendations.length > 0) {
        doc.fontSize(13).text('Recommendations');
        for (const rec of section.recommendations) {
          doc.fontSize(11).text(`• ${rec.title} — ${rec.detail}`);
        }
        doc.moveDown(0.5);
      }

      doc.moveDown();
    }

    doc.fontSize(9).fillColor('#888888').text(WELLNESS_DISCLAIMER);

    doc.end();
  });
}
