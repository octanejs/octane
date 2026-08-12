export function createProbePdf(): Uint8Array {
	const content = 'BT /F1 18 Tf 40 120 Td (Octane PDF probe) Tj ET';
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R /Outlines 7 0 R /PageMode /UseOutlines >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R /Annots [6 0 R] >>',
		`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
		'<< /Type /Annot /Subtype /Link /Rect [40 75 215 105] /Border [0 0 1] /A << /S /URI /URI (https://octanejs.com/) >> >>',
		'<< /Type /Outlines /First 8 0 R /Last 8 0 R /Count 1 >>',
		'<< /Title (Probe page) /Parent 7 0 R /Dest [3 0 R /Fit] >>',
	];

	let pdf = '%PDF-1.7\n';
	const offsets = [0];
	for (let index = 0; index < objects.length; index += 1) {
		offsets.push(pdf.length);
		pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
	}
	const xrefOffset = pdf.length;
	pdf += `xref\n0 ${objects.length + 1}\n`;
	pdf += '0000000000 65535 f \n';
	for (const offset of offsets.slice(1)) {
		pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
	}
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
	return Uint8Array.from(pdf, (character) => character.charCodeAt(0));
}
