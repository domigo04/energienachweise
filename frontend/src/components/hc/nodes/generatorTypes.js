// Eine zentrale Quelle für Erzeugercodes, UI-Bezeichnungen und Fachgruppen.
// Die Codes sind identisch mit ProjectContext, LV-Import und Kostenschätzung.
export const GENERATOR_TYPES = [
  { value:'ews_wp',     label:'Sole/Wasser-WP (Erdsonden)', family:'wp', source:'sole' },
  { value:'lwwp',       label:'Luft/Wasser-WP', family:'wp', source:'air' },
  { value:'wasser_wp',  label:'Wasser/Wasser-WP', family:'wp', source:'water' },
  { value:'co2_wp',     label:'CO₂-Wärmepumpe', family:'wp', source:'co2' },
  { value:'fernwaerme', label:'Fernwärme', family:'district' },
  { value:'gas',        label:'Gaskessel', family:'boiler', fuel:'Gas' },
  { value:'oel',        label:'Ölkessel', family:'boiler', fuel:'Öl' },
  { value:'holz',       label:'Holz-/Pelletkessel', family:'boiler', fuel:'Holz' },
  { value:'elektro',    label:'Elektroheizung', family:'electric' },
  { value:'hybrid',     label:'Hybridanlage', family:'hybrid' },
  { value:'sonstige',   label:'Sonstiger Wärmeerzeuger', family:'other' },
];

export const GENERATOR_TYPE_LABELS = Object.fromEntries(
  GENERATOR_TYPES.map(item => [item.value, item.label])
);

export const LWWP_BAUARTEN = [
  { value:'aussenaufstellung', label:'Monoblock – Aussenaufstellung' },
  { value:'innenaufstellung', label:'Monoblock – Innenaufstellung' },
  { value:'split', label:'Splitgerät – Aussen- und Inneneinheit' },
];

export const generatorType = value =>
  GENERATOR_TYPES.find(item => item.value === value) || null;

export const istWaermepumpe = value =>
  ['wp', 'hybrid'].includes(generatorType(value)?.family);
export const hatSoleOderWasserkreis = value => ['ews_wp', 'wasser_wp'].includes(value);
