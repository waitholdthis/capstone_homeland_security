// Real homeland security doctrine references mapped to decision categories and scenarios

export const DOCTRINE_REFERENCES = {
  accessControl: {
    cbrn: [
      {
        id: 'nims-ics-zones',
        doctrine: 'NIMS/ICS',
        citation: 'NIMS 3rd Ed., Ch. 3 — Incident Command System',
        description: 'Establish hot/warm/cold zones per ICS protocols; Incident Commander authorizes zone access tiers.',
      },
      {
        id: 'epa-pags-access',
        doctrine: 'EPA PAGs',
        citation: 'EPA PAG Manual (2017), Ch. 3 — Early Phase PAGs',
        description: 'Protective Action Guides define dose-based thresholds for restricting public access to contaminated areas.',
      },
      {
        id: 'osha-hazwoper',
        doctrine: 'OSHA HAZWOPER',
        citation: '29 CFR 1910.120(q) — Emergency Response',
        description: 'PPE requirements and site control zones for hazardous substance emergency response.',
      },
    ],
    terrorism: [
      {
        id: 'nrf-esf13-access',
        doctrine: 'NRF ESF-13',
        citation: 'NRF 4th Ed., ESF #13 — Public Safety and Security',
        description: 'Federal law enforcement support for perimeter security, access control, and credentialing at incident sites.',
      },
      {
        id: 'fbi-conops-scene',
        doctrine: 'FBI CONOPS',
        citation: 'FBI Crisis Management CONOPS — Scene Control',
        description: 'FBI assumes lead federal agency (LFA) role; coordinates crime scene access with local law enforcement.',
      },
      {
        id: 'hspd5-coordination',
        doctrine: 'HSPD-5',
        citation: 'HSPD-5 §4 — Federal Domestic Incident Management',
        description: 'Directs federal agencies to coordinate access control under a single Incident Command or Unified Command structure.',
      },
    ],
    natural_disaster: [
      {
        id: 'stafford-act-evac',
        doctrine: 'Stafford Act',
        citation: '42 U.S.C. §5170 — Major Disaster Declarations',
        description: 'Governor requests presidential declaration; enables federal assistance and mandatory evacuation enforcement.',
      },
      {
        id: 'nrf-esf1-transport',
        doctrine: 'NRF ESF-1',
        citation: 'NRF 4th Ed., ESF #1 — Transportation',
        description: 'Coordinates federal transportation support for evacuation, access control, and movement restrictions.',
      },
      {
        id: 'nims-area-command',
        doctrine: 'NIMS/ICS',
        citation: 'NIMS 3rd Ed., Ch. 3 — Area Command',
        description: 'Establish Area Command when multiple incidents require coordinated access management across jurisdictions.',
      },
    ],
  },
  routeManagement: {
    cbrn: [
      {
        id: 'nrf-esf1-cbrn-routes',
        doctrine: 'NRF ESF-1',
        citation: 'NRF 4th Ed., ESF #1 — Transportation',
        description: 'Federal coordination of evacuation routes avoiding contamination plume; highway contraflow operations.',
      },
      {
        id: 'epa-pags-evac',
        doctrine: 'EPA PAGs',
        citation: 'EPA PAG Manual (2017), Ch. 2 — Evacuation vs. Shelter-in-Place',
        description: 'PAG dose projections inform evacuation route selection to minimize population exposure.',
      },
      {
        id: 'nrf-esf12-energy',
        doctrine: 'NRF ESF-12',
        citation: 'NRF 4th Ed., ESF #12 — Energy',
        description: 'Coordinate fuel availability and power for traffic signals along designated evacuation routes.',
      },
    ],
    terrorism: [
      {
        id: 'nrf-esf13-routes',
        doctrine: 'NRF ESF-13',
        citation: 'NRF 4th Ed., ESF #13 — Public Safety and Security',
        description: 'Law enforcement route security; vehicle screening checkpoints on approach routes.',
      },
      {
        id: 'fbi-conops-cordon',
        doctrine: 'FBI CONOPS',
        citation: 'FBI Crisis Management CONOPS — Tactical Perimeter',
        description: 'FBI tactical teams coordinate inner/outer perimeter corridors; safe routes for hostage rescue or evacuation.',
      },
      {
        id: 'dhs-ntas',
        doctrine: 'DHS NTAS',
        citation: 'DHS National Terrorism Advisory System Bulletin Procedures',
        description: 'NTAS bulletins inform public transit rerouting and elevated screening at transportation hubs.',
      },
    ],
    natural_disaster: [
      {
        id: 'stafford-act-routes',
        doctrine: 'Stafford Act',
        citation: '42 U.S.C. §5170b — Essential Assistance',
        description: 'Federal assistance for debris clearance and emergency access route restoration.',
      },
      {
        id: 'nrf-esf1-nd-routes',
        doctrine: 'NRF ESF-1',
        citation: 'NRF 4th Ed., ESF #1 — Transportation',
        description: 'Damage assessment of transportation infrastructure; alternate routing and contraflow operations.',
      },
      {
        id: 'ppd8-logistics',
        doctrine: 'PPD-8',
        citation: 'PPD-8 National Preparedness — Response Core Capability: Logistics & Supply Chain Mgmt',
        description: 'Pre-identified supply routes and logistics staging areas per national preparedness goal.',
      },
    ],
  },
  resourcePrioritization: {
    cbrn: [
      {
        id: 'nrf-esf8-medical',
        doctrine: 'NRF ESF-8',
        citation: 'NRF 4th Ed., ESF #8 — Public Health and Medical Services',
        description: 'Federal medical countermeasure distribution priorities; CDC Strategic National Stockpile deployment.',
      },
      {
        id: 'cdc-sns',
        doctrine: 'CDC/SNS',
        citation: 'CDC SNS Operations Plan — Push Package Protocols',
        description: 'Strategic National Stockpile 12-hour push package; state receipt, staging, and distribution priorities.',
      },
      {
        id: 'nims-resource-typing',
        doctrine: 'NIMS',
        citation: 'NIMS 3rd Ed., Ch. 4 — Resource Management',
        description: 'Standard resource typing and credentialing for mutual aid deployment; CBRN-qualified team categories.',
      },
    ],
    terrorism: [
      {
        id: 'nrf-esf9-sar',
        doctrine: 'NRF ESF-9',
        citation: 'NRF 4th Ed., ESF #9 — Search and Rescue',
        description: 'Federal SAR coordination; urban SAR team deployment priorities for structural collapse or mass casualty.',
      },
      {
        id: 'nrf-esf13-le-resources',
        doctrine: 'NRF ESF-13',
        citation: 'NRF 4th Ed., ESF #13 — Public Safety and Security',
        description: 'Federal law enforcement resource allocation between tactical response, investigation, and crowd control.',
      },
      {
        id: 'nrf-esf8-mci',
        doctrine: 'NRF ESF-8',
        citation: 'NRF 4th Ed., ESF #8 — Public Health and Medical Services',
        description: 'Mass casualty incident medical surge; hospital notification and patient distribution protocols.',
      },
    ],
    natural_disaster: [
      {
        id: 'stafford-act-resources',
        doctrine: 'Stafford Act',
        citation: '42 U.S.C. §5170b — Essential Assistance',
        description: 'Federal resource allocation priorities: life safety, property protection, environmental stabilization.',
      },
      {
        id: 'nrf-esf6-mass-care',
        doctrine: 'NRF ESF-6',
        citation: 'NRF 4th Ed., ESF #6 — Mass Care, Emergency Assistance, Temporary Housing',
        description: 'Shelter resource allocation; feeding operations; distribution of emergency supplies to displaced populations.',
      },
      {
        id: 'nrf-esf9-nd-sar',
        doctrine: 'NRF ESF-9',
        citation: 'NRF 4th Ed., ESF #9 — Search and Rescue',
        description: 'SAR team prioritization based on damage assessment; greatest probability of detection methodology.',
      },
    ],
  },
  riskMitigation: {
    cbrn: [
      {
        id: 'epa-pags-protection',
        doctrine: 'EPA PAGs',
        citation: 'EPA PAG Manual (2017), Ch. 1 — Protective Action Decision Framework',
        description: 'Dose-based protective action decisions: shelter-in-place vs. evacuation thresholds for risk reduction.',
      },
      {
        id: 'nrf-esf10-hazmat',
        doctrine: 'NRF ESF-10',
        citation: 'NRF 4th Ed., ESF #10 — Oil and Hazardous Materials',
        description: 'Federal hazmat containment and environmental cleanup coordination; long-term contamination monitoring.',
      },
      {
        id: 'nrf-esf8-countermeasures',
        doctrine: 'NRF ESF-8',
        citation: 'NRF 4th Ed., ESF #8 — Public Health and Medical Services',
        description: 'Prophylactic medical countermeasure distribution to at-risk populations; health surveillance.',
      },
    ],
    terrorism: [
      {
        id: 'dhs-ntas-risk',
        doctrine: 'DHS NTAS',
        citation: 'DHS NTAS Bulletin Procedures — Threat Communication',
        description: 'Public threat communication balancing awareness with panic mitigation; protective action guidance.',
      },
      {
        id: 'ppd8-prevention',
        doctrine: 'PPD-8',
        citation: 'PPD-8 National Preparedness — Prevention Core Capability',
        description: 'Counter secondary attack planning; intelligence sharing through fusion centers and JTTFs.',
      },
      {
        id: 'nrf-esf13-protection',
        doctrine: 'NRF ESF-13',
        citation: 'NRF 4th Ed., ESF #13 — Public Safety and Security',
        description: 'Critical infrastructure hardening; protective security advisors deploy to high-value targets.',
      },
    ],
    natural_disaster: [
      {
        id: 'ppd8-mitigation',
        doctrine: 'PPD-8',
        citation: 'PPD-8 National Preparedness — Mitigation Core Capability',
        description: 'Cascading failure prevention; long-term risk reduction aligned with national mitigation framework.',
      },
      {
        id: 'nrf-esf12-utilities',
        doctrine: 'NRF ESF-12',
        citation: 'NRF 4th Ed., ESF #12 — Energy',
        description: 'Utility shutoff coordination to prevent secondary hazards (gas leaks, electrocution, fires).',
      },
      {
        id: 'nrf-esf8-nd-health',
        doctrine: 'NRF ESF-8',
        citation: 'NRF 4th Ed., ESF #8 — Public Health and Medical Services',
        description: 'Post-disaster disease surveillance; water/sanitation safety; vector control operations.',
      },
    ],
  },
}

export const DECISION_TEMPLATES = {
  accessControl: {
    cbrn: [
      {
        id: 'tpl-ac-cbrn-1',
        summary: 'Establish three-tier CBRN access zones per ICS protocol',
        rationale: 'NIMS/ICS Ch.3 requires hot/warm/cold zone delineation based on contamination levels. EPA PAG dose thresholds define zone boundaries. Only HAZWOPER-certified personnel with appropriate PPE authorized for hot zone entry.',
        doctrineRef: 'nims-ics-zones',
      },
      {
        id: 'tpl-ac-cbrn-2',
        summary: 'Activate decontamination checkpoints at all zone transition points',
        rationale: 'OSHA HAZWOPER 29 CFR 1910.120(q) mandates decontamination corridors at zone boundaries. Technical decon for responders, mass decon for civilians, per EPA PAG early-phase guidance.',
        doctrineRef: 'osha-hazwoper',
      },
    ],
    terrorism: [
      {
        id: 'tpl-ac-terr-1',
        summary: 'Establish Unified Command and federal credentialing for scene access',
        rationale: 'HSPD-5 directs unified incident management. FBI CONOPS designates FBI as lead federal agency for crime scene. ESF-13 provides federal law enforcement credentialing support for multi-agency access control.',
        doctrineRef: 'hspd5-coordination',
      },
      {
        id: 'tpl-ac-terr-2',
        summary: 'Deploy inner/outer perimeter with identity verification at access points',
        rationale: 'FBI CONOPS crime scene protocols require inner perimeter for investigation and outer perimeter for security. NRF ESF-13 coordinates federal law enforcement support for sustained perimeter operations.',
        doctrineRef: 'fbi-conops-scene',
      },
    ],
    natural_disaster: [
      {
        id: 'tpl-ac-nd-1',
        summary: 'Issue mandatory evacuation order and request presidential disaster declaration',
        rationale: 'Stafford Act 42 U.S.C. §5170 enables federal assistance upon governor request and presidential declaration. Mandatory evacuation authority flows from state emergency powers activated by declaration.',
        doctrineRef: 'stafford-act-evac',
      },
      {
        id: 'tpl-ac-nd-2',
        summary: 'Activate Area Command for multi-jurisdiction access coordination',
        rationale: 'NIMS Area Command structure manages multiple incidents across jurisdictions. ESF-1 provides federal transportation coordination for movement restrictions and re-entry management.',
        doctrineRef: 'nims-area-command',
      },
    ],
  },
  routeManagement: {
    cbrn: [
      {
        id: 'tpl-rm-cbrn-1',
        summary: 'Designate evacuation routes perpendicular to plume trajectory',
        rationale: 'EPA PAG Ch.2 evacuation guidance requires routes that minimize population dose. ESF-1 coordinates federal transportation assets for route management. Plume dispersion models determine safe corridors.',
        doctrineRef: 'epa-pags-evac',
      },
      {
        id: 'tpl-rm-cbrn-2',
        summary: 'Establish dedicated hazmat response corridors with ESF-12 fuel support',
        rationale: 'NRF ESF-1 designates priority routes for emergency vehicles. ESF-12 ensures fuel and power availability for sustained operations along response corridors.',
        doctrineRef: 'nrf-esf1-cbrn-routes',
      },
    ],
    terrorism: [
      {
        id: 'tpl-rm-terr-1',
        summary: 'Secure evacuation corridors with law enforcement and vehicle screening',
        rationale: 'NRF ESF-13 provides law enforcement route security against secondary threats. FBI CONOPS tactical perimeter protocols ensure safe evacuation corridors away from threat area.',
        doctrineRef: 'nrf-esf13-routes',
      },
      {
        id: 'tpl-rm-terr-2',
        summary: 'Reroute public transit and issue NTAS-informed transportation guidance',
        rationale: 'DHS NTAS bulletins inform elevated screening at transportation hubs. Transit rerouting minimizes civilian exposure to threat area while maintaining emergency mobility.',
        doctrineRef: 'dhs-ntas',
      },
    ],
    natural_disaster: [
      {
        id: 'tpl-rm-nd-1',
        summary: 'Activate contraflow operations and federal debris clearance under Stafford Act',
        rationale: 'Stafford Act §5170b authorizes federal debris removal for emergency access. ESF-1 coordinates highway contraflow and alternate routing based on infrastructure damage assessments.',
        doctrineRef: 'stafford-act-routes',
      },
      {
        id: 'tpl-rm-nd-2',
        summary: 'Open pre-identified PPD-8 logistics staging routes for supply convoys',
        rationale: 'PPD-8 National Preparedness logistics capability includes pre-identified supply routes and staging areas. ESF-1 coordinates federal transportation for sustained supply chain operations.',
        doctrineRef: 'ppd8-logistics',
      },
    ],
  },
  resourcePrioritization: {
    cbrn: [
      {
        id: 'tpl-rp-cbrn-1',
        summary: 'Request CDC Strategic National Stockpile 12-hour push package',
        rationale: 'CDC SNS Operations Plan provides 12-hour push package delivery to state staging area. NRF ESF-8 coordinates federal medical countermeasure distribution by population exposure priority.',
        doctrineRef: 'cdc-sns',
      },
      {
        id: 'tpl-rp-cbrn-2',
        summary: 'Deploy NIMS-typed CBRN response teams via mutual aid',
        rationale: 'NIMS Ch.4 resource typing ensures interoperable CBRN teams. Standard credentialing enables mutual aid deployment across jurisdictions for decontamination and detection assets.',
        doctrineRef: 'nims-resource-typing',
      },
    ],
    terrorism: [
      {
        id: 'tpl-rp-terr-1',
        summary: 'Activate ESF-9 Urban SAR and ESF-8 mass casualty protocols',
        rationale: 'NRF ESF-9 coordinates federal SAR resources for structural collapse. ESF-8 activates hospital surge notification and patient distribution to distribute medical load across facilities.',
        doctrineRef: 'nrf-esf9-sar',
      },
      {
        id: 'tpl-rp-terr-2',
        summary: 'Allocate ESF-13 law enforcement across tactical, investigative, and security missions',
        rationale: 'NRF ESF-13 provides framework for federal law enforcement allocation balancing active threat response, evidence preservation, and public safety across the incident footprint.',
        doctrineRef: 'nrf-esf13-le-resources',
      },
    ],
    natural_disaster: [
      {
        id: 'tpl-rp-nd-1',
        summary: 'Prioritize ESF-9 SAR teams to highest probability of detection areas',
        rationale: 'NRF ESF-9 greatest probability of detection methodology prioritizes SAR to areas with highest likelihood of live victims based on damage assessment and population density.',
        doctrineRef: 'nrf-esf9-nd-sar',
      },
      {
        id: 'tpl-rp-nd-2',
        summary: 'Activate ESF-6 mass care for shelter and feeding operations',
        rationale: 'NRF ESF-6 coordinates shelter allocation, feeding operations, and emergency supplies. Stafford Act §5170b essential assistance authorizes federal resource support for displaced populations.',
        doctrineRef: 'nrf-esf6-mass-care',
      },
    ],
  },
  riskMitigation: {
    cbrn: [
      {
        id: 'tpl-rk-cbrn-1',
        summary: 'Implement EPA PAG-based protective actions: evacuation beyond 1 rem, shelter-in-place 1-5 rem',
        rationale: 'EPA PAG Manual Ch.1 protective action framework defines dose-based thresholds. Evacuation for projected dose >1 rem early phase; shelter-in-place where evacuation risk exceeds exposure risk.',
        doctrineRef: 'epa-pags-protection',
      },
      {
        id: 'tpl-rk-cbrn-2',
        summary: 'Activate ESF-10 federal hazmat containment and long-term monitoring',
        rationale: 'NRF ESF-10 provides federal hazmat response coordination for containment, cleanup, and ongoing environmental monitoring to prevent continued exposure.',
        doctrineRef: 'nrf-esf10-hazmat',
      },
    ],
    terrorism: [
      {
        id: 'tpl-rk-terr-1',
        summary: 'Issue NTAS bulletin and deploy protective security advisors to critical infrastructure',
        rationale: 'DHS NTAS provides calibrated public threat communication. ESF-13 protective security advisors conduct vulnerability assessments at high-value targets to counter secondary attack planning.',
        doctrineRef: 'dhs-ntas-risk',
      },
      {
        id: 'tpl-rk-terr-2',
        summary: 'Activate PPD-8 prevention capabilities through fusion centers and JTTFs',
        rationale: 'PPD-8 Prevention Core Capability leverages intelligence sharing through state/local fusion centers and FBI Joint Terrorism Task Forces to identify and disrupt follow-on threats.',
        doctrineRef: 'ppd8-prevention',
      },
    ],
    natural_disaster: [
      {
        id: 'tpl-rk-nd-1',
        summary: 'Coordinate ESF-12 utility shutoffs to prevent secondary hazards',
        rationale: 'NRF ESF-12 coordinates utility shutoff decisions with energy providers to prevent gas leaks, electrocution, and fire. Risk assessment balances shutoff impacts against secondary hazard probability.',
        doctrineRef: 'nrf-esf12-utilities',
      },
      {
        id: 'tpl-rk-nd-2',
        summary: 'Activate ESF-8 post-disaster health surveillance and PPD-8 mitigation planning',
        rationale: 'NRF ESF-8 deploys epidemiological surveillance for waterborne disease, vector-borne illness, and environmental health threats. PPD-8 mitigation framework addresses cascading failure prevention.',
        doctrineRef: 'ppd8-mitigation',
      },
    ],
  },
}

export const DOCTRINE_COMPLIANCE_CHECKLIST = [
  {
    id: 'nims-ics-activation',
    category: 'NIMS/ICS',
    item: 'NIMS/ICS structure activated with designated Incident Commander',
    description: 'Confirm that the National Incident Management System Incident Command structure has been established per NIMS 3rd Ed.',
  },
  {
    id: 'unified-command',
    category: 'NIMS/ICS',
    item: 'Unified Command established for multi-jurisdiction/multi-agency response',
    description: 'Verify Unified Command is in place when multiple agencies or jurisdictions share incident authority.',
  },
  {
    id: 'esf-activation',
    category: 'NRF',
    item: 'Applicable Emergency Support Functions (ESFs) identified and activated',
    description: 'Confirm that relevant NRF Emergency Support Functions have been requested and activated through proper channels.',
  },
  {
    id: 'hspd5-notification',
    category: 'HSPD-5',
    item: 'Federal incident management notification completed per HSPD-5',
    description: 'Verify that DHS and appropriate federal agencies have been notified per Homeland Security Presidential Directive 5.',
  },
  {
    id: 'ppd8-alignment',
    category: 'PPD-8',
    item: 'Response aligned with PPD-8 National Preparedness core capabilities',
    description: 'Confirm response activities map to applicable PPD-8 core capabilities (Prevention, Protection, Mitigation, Response, Recovery).',
  },
  {
    id: 'resource-typing',
    category: 'NIMS',
    item: 'Deployed resources typed and credentialed per NIMS standards',
    description: 'Verify that all deployed resources use NIMS resource typing definitions and personnel hold appropriate credentials.',
  },
  {
    id: 'mutual-aid',
    category: 'NIMS',
    item: 'Mutual aid agreements activated through proper channels',
    description: 'Confirm that any mutual aid requests follow established EMAC or local mutual aid compact procedures.',
  },
  {
    id: 'jis-pio',
    category: 'NIMS/ICS',
    item: 'Joint Information System (JIS) and Public Information Officer (PIO) designated',
    description: 'Verify that public information is coordinated through a Joint Information System with a designated PIO per NIMS.',
  },
  {
    id: 'aar-planning',
    category: 'HSEEP',
    item: 'After-Action Review (AAR) process planned for incident conclusion',
    description: 'Confirm that an AAR is scheduled per HSEEP guidelines to capture lessons learned and improvement actions.',
  },
  {
    id: 'scenario-doctrine',
    category: 'Scenario-Specific',
    item: 'Scenario-specific doctrine consulted and applied',
    description: 'Verify that doctrine specific to the incident type (EPA PAGs for CBRN, FBI CONOPS for terrorism, Stafford Act for disasters) has been referenced.',
  },
]
