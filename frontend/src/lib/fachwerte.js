/**
 * Frontend-Zugriff auf die zentrale Fachwerte-Registry des Backends.
 *
 * Fachliche Codes und Labels werden nicht im Frontend nachgebaut. Dadurch
 * verwenden LV-Review, Referenzprojekte, Filter und Kostenschätzung garantiert
 * dieselbe Sprache.
 */
export const fachwertOptionen = (listen, name) =>
  (listen?.[name] || []).map((item) => ({
    value: item.code,
    label: item.label,
  }));

export const fachwertLabel = (listen, name, value, fallback = "—") => {
  if (!value) return fallback;
  return (listen?.[name] || []).find((item) => item.code === value)?.label || value;
};

export const fachwertLabels = (listen, name, values, fallback = "—") => {
  const labels = (values || []).map((value) => fachwertLabel(listen, name, value, value));
  return labels.length ? labels.join(", ") : fallback;
};
