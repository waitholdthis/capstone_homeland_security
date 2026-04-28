// MIL-STD-2525D SIDC codes for unit palette
// SIDC format (10-char): StandardIdentity + SymbolSet + Status + HQTFDummy + AmplifierDescriptor + Entity + EntityType + EntitySubtype
// We use the milsymbol library to render these

export const FACTIONS = {
  FRIENDLY: 'friendly',
  ENEMY: 'enemy',
};

// Friendly SIDCs (identity = 'F')
const F = {
  infantry:   'SFGPUCI----',   // Ground / Unit / Combat / Infantry
  armor:      'SFGPUCA----',   // Ground / Unit / Combat / Armor
  artillery:  'SFGPUCF----',   // Ground / Unit / Combat / Field Artillery
  aviation:   'SFAPMF-----',   // Air / Military / Fixed Wing (UAS parent)
  hq:         'SFGPUH-----',   // Ground / Unit / Combat Support / HQ
  engineering:'SFGPUCE----',   // Ground / Unit / Combat Support / Engineer
  logistics:  'SFGPUSS----',   // Ground / Unit / CSS / Supply
};

// Enemy SIDCs (identity = 'H' hostile)
const H = {
  infantry:   'SHGPUCI----',
  armor:      'SHGPUCA----',
  artillery:  'SHGPUCF----',
  aviation:   'SHAPMF-----',
  hq:         'SHGPUH-----',
};

export const UNIT_TYPES = [
  {
    id: 'infantry',
    label: 'Infantry',
    sidcs: { [FACTIONS.FRIENDLY]: F.infantry, [FACTIONS.ENEMY]: H.infantry },
  },
  {
    id: 'armor',
    label: 'Armor',
    sidcs: { [FACTIONS.FRIENDLY]: F.armor, [FACTIONS.ENEMY]: H.armor },
  },
  {
    id: 'artillery',
    label: 'Artillery',
    sidcs: { [FACTIONS.FRIENDLY]: F.artillery, [FACTIONS.ENEMY]: H.artillery },
  },
  {
    id: 'aviation',
    label: 'UAS / Avn',
    sidcs: { [FACTIONS.FRIENDLY]: F.aviation, [FACTIONS.ENEMY]: H.aviation },
  },
  {
    id: 'hq',
    label: 'HQ',
    sidcs: { [FACTIONS.FRIENDLY]: F.hq, [FACTIONS.ENEMY]: H.hq },
  },
  {
    id: 'engineering',
    label: 'Engineer',
    sidcs: { [FACTIONS.FRIENDLY]: F.engineering, [FACTIONS.ENEMY]: H.infantry }, // no enemy eng SIDC needed
  },
];
