export const KILL_CHAIN_CHECKLISTS = {
  uas: {
    label: 'UAS Defensive Chain',
    color: '#FF6B00',
    steps: [
      {
        id: 'detect',
        phase: 'Detect',
        task: 'Primary sensor or observer detects UAS activity.',
        evidence: 'Radar, RF, EO/IR, acoustic, OSINT, visual, or external track feed.',
      },
      {
        id: 'classify',
        phase: 'Classify',
        task: 'Classify UAS group, altitude, speed, payload risk, and likely intent.',
        evidence: 'Group 1-5, fixed wing/rotary, payload notes, flight profile, confidence.',
      },
      {
        id: 'track',
        phase: 'Track',
        task: 'Maintain custody and correlate track across available sensors.',
        evidence: 'Track continuity, sensor handoff, projected path, current confidence.',
      },
      {
        id: 'warn',
        phase: 'Warn',
        task: 'Alert protected units and likely affected areas.',
        evidence: 'Warning sent, expected time to defended asset, protective action window.',
      },
      {
        id: 'decide',
        phase: 'Decide',
        task: 'Confirm defensive response authority and deconfliction status.',
        evidence: 'ROE, airspace deconfliction, friendly positions, collateral constraints.',
      },
      {
        id: 'defeat_or_protect',
        phase: 'Defeat / Protect',
        task: 'Cue available defensive capability or execute protection measures.',
        evidence: 'EW, kinetic, directed energy, maneuver, cover, concealment, dispersion.',
      },
      {
        id: 'assess',
        phase: 'Assess',
        task: 'Assess outcome and update the recognized air picture.',
        evidence: 'Track dropped, defeated, bypassed, impact/no-impact, residual threat.',
      },
    ],
  },
  missile: {
    label: 'Missile Warning Chain',
    color: '#FF3300',
    steps: [
      {
        id: 'launch_detect',
        phase: 'Launch Detect',
        task: 'Detect or receive cue of launch, inbound track, or probable launch origin.',
        evidence: 'Radar track, external warning, OSINT/cyber cue, launch point estimate.',
      },
      {
        id: 'trajectory',
        phase: 'Trajectory',
        task: 'Estimate trajectory type, speed, impact area, and time to impact.',
        evidence: 'Ballistic/cruise/hypersonic/rocket profile, TTI, CEP, impact rings.',
      },
      {
        id: 'sensor_correlation',
        phase: 'Correlate',
        task: 'Correlate detections across radar and sensor architecture.',
        evidence: 'First detection, downstream cueing, confidence, blind-gap status.',
      },
      {
        id: 'warning',
        phase: 'Warning',
        task: 'Issue protective warning to affected forces and facilities.',
        evidence: 'Shelter deadline, cover deadline, react deadline, warning level.',
      },
      {
        id: 'defense_posture',
        phase: 'Defense Posture',
        task: 'Confirm IAMD / C-UAS defensive posture and protected asset priorities.',
        evidence: 'Available systems, readiness, defended asset list, engagement status.',
      },
      {
        id: 'protection',
        phase: 'Protection',
        task: 'Execute force protection actions before impact.',
        evidence: 'Shelter, cover, dispersion, halt movement, medical/fire response staged.',
      },
      {
        id: 'post_impact',
        phase: 'Post Impact',
        task: 'Assess impact effects and update operational risk.',
        evidence: 'Impact/no-impact, casualties/damage estimate, unexploded hazard, re-attack risk.',
      },
    ],
  },
};

export function createKillChainStatus() {
  return Object.fromEntries(
    Object.entries(KILL_CHAIN_CHECKLISTS).map(([key, checklist]) => [
      key,
      Object.fromEntries(checklist.steps.map(step => [step.id, false])),
    ])
  );
}
