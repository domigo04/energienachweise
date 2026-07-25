// Underlay-Datei einlesen (§ Editor #5). Bilder werden (bei Bedarf verkleinert)
// als PNG/JPG übernommen, PDFs EINMAL im Browser zur PNG gerastert (pdfjs, lazy
// geladen). Danach ist Anzeige und Speicherung einheitlich ein Bild — kein pdfjs
// im Renderpfad, keine schwere Backend-Abhängigkeit. Ergebnis passt auf die vom
// Backend akzeptierten Formate (PNG/JPG/WebP) und die Grössengrenze.

const MAX_KANTE = 2400; // Zielauflösung der langen Kante — scharf genug zum Nachzeichnen

function dateiLesen(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ladeBild(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function pdfErsteSeite(file) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url,
  ).toString();
  const daten = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: daten }).promise;
  const page = await doc.getPage(1);
  const roh = page.getViewport({ scale: 1 });
  const skala = Math.min(MAX_KANTE / Math.max(roh.width, roh.height), 4);
  const viewport = page.getViewport({ scale: Math.max(skala, 0.1) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height); // weisser Grund statt transparent
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { mime: 'image/png', data: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
}

async function bildDatei(file) {
  const dataUrl = await dateiLesen(file);
  const img = await ladeBild(dataUrl);
  const gross = Math.max(img.naturalWidth, img.naturalHeight);
  const skala = Math.min(1, MAX_KANTE / (gross || 1));
  const bereitsOk = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
  // Original behalten, wenn es klein genug und ein akzeptiertes Format ist.
  if (skala === 1 && bereitsOk) {
    return { mime: file.type, data: dataUrl, w: img.naturalWidth, h: img.naturalHeight };
  }
  // Sonst (zu gross oder z. B. GIF/BMP/SVG) auf PNG normalisieren und verkleinern.
  const w = Math.max(1, Math.round(img.naturalWidth * skala));
  const h = Math.max(1, Math.round(img.naturalHeight * skala));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return { mime: 'image/png', data: canvas.toDataURL('image/png'), w, h };
}

export async function dateiZuUnderlay(file) {
  const istPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  const basis = istPdf ? await pdfErsteSeite(file) : await bildDatei(file);
  return { ...basis, name: (file.name || 'Plan').slice(0, 200) };
}
