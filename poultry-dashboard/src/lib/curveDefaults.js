// Default setpoint-curve checkpoints, shared by SetpointCurveEditor and FlockManagement.
// (Kept out of the component file so React Fast Refresh keeps working.)

// ── Default checkpoint templates (matching the images) ────────────────────

export const DEFAULT_NUTRITIONAL = [
  { day: 0,  label: 'Début', female_weight_g: 60,   female_feed_g: 5,   female_water_ml: 15,  male_weight_g: 60,   male_feed_g: 20,  male_water_ml: 60  },
  { day: 7,  label: 'J7',    female_weight_g: 180,  female_feed_g: 27,  female_water_ml: 90,  male_weight_g: 180,  male_feed_g: 29,  male_water_ml: 90  },
  { day: 14, label: 'J14',   female_weight_g: 360,  female_feed_g: 47,  female_water_ml: 150, male_weight_g: 400,  male_feed_g: 53,  male_water_ml: 160 },
  { day: 21, label: 'J21',   female_weight_g: 610,  female_feed_g: 75,  female_water_ml: 225, male_weight_g: 760,  male_feed_g: 86,  male_water_ml: 300 },
  { day: 28, label: 'J28',   female_weight_g: 1010, female_feed_g: 107, female_water_ml: 300, male_weight_g: 1180, male_feed_g: 127, male_water_ml: 375 },
  { day: 35, label: 'J35',   female_weight_g: 1540, female_feed_g: 130, female_water_ml: 400, male_weight_g: 1850, male_feed_g: 150, male_water_ml: 450 },
  { day: 42, label: 'J42',   female_weight_g: 2050, female_feed_g: 145, female_water_ml: 450, male_weight_g: 2600, male_feed_g: 165, male_water_ml: 510 },
];

export const DEFAULT_ENVIRONMENTAL = [
  { day: 0,  label: 'Début', temperature_c: 34.5, humidity_pct: 40, air_requirement: 3.00, co2_ppm: 2500 },
  { day: 7,  label: 'J7',    temperature_c: 32.0, humidity_pct: 50, air_requirement: 3.00, co2_ppm: 2500 },
  { day: 14, label: 'J14',   temperature_c: 29.0, humidity_pct: 55, air_requirement: 3.00, co2_ppm: 2500 },
  { day: 28, label: 'J28',   temperature_c: 28.5, humidity_pct: 60, air_requirement: 3.00, co2_ppm: 2000 },
  { day: 35, label: 'J35',   temperature_c: 26.5, humidity_pct: 65, air_requirement: 2.50, co2_ppm: 2000 },
  { day: 49, label: 'J49',   temperature_c: 24.0, humidity_pct: 65, air_requirement: 1.00, co2_ppm: 2000 },
];
