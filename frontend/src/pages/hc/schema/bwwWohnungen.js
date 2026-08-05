function zeile(eintrag, index) {
  return {
    id: String(eintrag?.id || `wohnung-${index + 1}`),
    name: String(eintrag?.name || `Wohnung ${index + 1}`),
    flaeche_m2: eintrag?.flaeche_m2 ?? '',
  };
}

export function wohnungenAusDaten(data = {}) {
  if (Array.isArray(data.bww_wohnungen) && data.bww_wohnungen.length) {
    return data.bww_wohnungen.map(zeile);
  }
  if (Array.isArray(data.bww_nutzflaechen_m2) && data.bww_nutzflaechen_m2.length) {
    return data.bww_nutzflaechen_m2.map((flaeche_m2, index) =>
      zeile({ flaeche_m2 }, index));
  }
  return [zeile({}, 0)];
}

export function wohnungHinzufuegen(wohnungen) {
  const belegt = new Set(wohnungen.map(w => w.id));
  let nummer = wohnungen.length + 1;
  while (belegt.has(`wohnung-${nummer}`)) nummer += 1;
  return [...wohnungen, {
    id: `wohnung-${nummer}`,
    name: `Wohnung ${nummer}`,
    flaeche_m2: '',
  }];
}

export function wohnungAendern(wohnungen, id, feld, wert) {
  return wohnungen.map(w => w.id === id ? { ...w, [feld]: wert } : w);
}

export function wohnungEntfernen(wohnungen, id) {
  const verbleibend = wohnungen.filter(w => w.id !== id);
  return verbleibend.length ? verbleibend : [zeile({}, 0)];
}
