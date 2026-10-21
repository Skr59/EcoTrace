/**
 * CPCB / CAAQMS reference monitoring locations across the Delhi NCR region.
 * Coordinates correspond to the official station locations so that the
 * Power BI "ArcGIS bubble map" pins land on the correct monitoring sites.
 *
 * zoneAreaKm2 -> representative gridded cell (25 km2) used for emission
 * baseline and carbon credit potential estimation.
 */
export const STATIONS = [
  // --- Delhi ---
  { id: "mundka", locationName: "Mundka", region: "West Delhi", state: "Delhi", lat: 28.6826, lng: 77.0327, zoneAreaKm2: 25 },
  { id: "airport", locationName: "Airport (IGI)", region: "South West Delhi", state: "Delhi", lat: 28.5627, lng: 77.1187, zoneAreaKm2: 25 },
  { id: "east-delhi", locationName: "East Delhi (Vivek Vihar)", region: "East Delhi", state: "Delhi", lat: 28.6644, lng: 77.315, zoneAreaKm2: 25 },
  { id: "central-delhi", locationName: "Central Delhi (ITO)", region: "Central Delhi", state: "Delhi", lat: 28.6285, lng: 77.2411, zoneAreaKm2: 25 },
  { id: "mdc-stadium", locationName: "Major Dhyan Chand Stadium", region: "Central Delhi", state: "Delhi", lat: 28.6111, lng: 77.2374, zoneAreaKm2: 25 },
  { id: "ashok-vihar", locationName: "Ashok Vihar", region: "North West Delhi", state: "Delhi", lat: 28.6915, lng: 77.1805, zoneAreaKm2: 25 },
  { id: "bawana", locationName: "Bawana", region: "North West Delhi", state: "Delhi", lat: 28.7765, lng: 77.0517, zoneAreaKm2: 25 },
  { id: "rohini", locationName: "Rohini", region: "North West Delhi", state: "Delhi", lat: 28.7495, lng: 77.0566, zoneAreaKm2: 25 },
  { id: "dwarka", locationName: "Dwarka (Sector 8)", region: "South West Delhi", state: "Delhi", lat: 28.5921, lng: 77.046, zoneAreaKm2: 25 },
  { id: "punjabi-bagh", locationName: "Punjabi Bagh", region: "West Delhi", state: "Delhi", lat: 28.6741, lng: 77.131, zoneAreaKm2: 25 },
  { id: "jahangirpuri", locationName: "Jahangirpuri", region: "North West Delhi", state: "Delhi", lat: 28.7294, lng: 77.1625, zoneAreaKm2: 25 },
  { id: "rk-puram", locationName: "R K Puram", region: "South Delhi", state: "Delhi", lat: 28.5645, lng: 77.1855, zoneAreaKm2: 25 },
  { id: "sirifort", locationName: "Sirifort", region: "South Delhi", state: "Delhi", lat: 28.548, lng: 77.2157, zoneAreaKm2: 25 },
  { id: "mandir-marg", locationName: "Mandir Marg", region: "Central Delhi", state: "Delhi", lat: 28.636, lng: 77.2, zoneAreaKm2: 25 },
  { id: "wazirpur", locationName: "Wazirpur", region: "North Delhi", state: "Delhi", lat: 28.7, lng: 77.165, zoneAreaKm2: 25 },
  { id: "patparganj", locationName: "Patparganj", region: "East Delhi", state: "Delhi", lat: 28.6234, lng: 77.2864, zoneAreaKm2: 25 },
  { id: "sonia-vihar", locationName: "Sonia Vihar", region: "North East Delhi", state: "Delhi", lat: 28.7108, lng: 77.2495, zoneAreaKm2: 25 },
  { id: "dilshad-garden", locationName: "Dilshad Garden", region: "East Delhi", state: "Delhi", lat: 28.68, lng: 77.32, zoneAreaKm2: 25 },
  { id: "najafgarh", locationName: "Najafgarh", region: "South West Delhi", state: "Delhi", lat: 28.5708, lng: 76.9339, zoneAreaKm2: 25 },
  { id: "narela", locationName: "Narela", region: "North Delhi", state: "Delhi", lat: 28.8228, lng: 77.1017, zoneAreaKm2: 25 },
  { id: "okhla-phase-2", locationName: "Okhla Phase-2", region: "South East Delhi", state: "Delhi", lat: 28.53, lng: 77.27, zoneAreaKm2: 25 },

  // --- Haryana (NCR) ---
  { id: "gurugram", locationName: "Gurugram", region: "Haryana NCR", state: "Haryana", lat: 28.4595, lng: 77.0266, zoneAreaKm2: 25 },
  { id: "faridabad", locationName: "Faridabad", region: "Haryana NCR", state: "Haryana", lat: 28.4089, lng: 77.3178, zoneAreaKm2: 25 },
  { id: "bahadurgarh", locationName: "Bahadurgarh", region: "Haryana NCR", state: "Haryana", lat: 28.393, lng: 76.937, zoneAreaKm2: 25 },
  { id: "dharuhera", locationName: "Dharuhera", region: "Haryana NCR", state: "Haryana", lat: 28.236, lng: 76.645, zoneAreaKm2: 25 },
  { id: "manesar", locationName: "Manesar", region: "Haryana NCR", state: "Haryana", lat: 28.35, lng: 76.94, zoneAreaKm2: 25 },
  { id: "sohna", locationName: "Sohna", region: "Haryana NCR", state: "Haryana", lat: 28.24, lng: 76.85, zoneAreaKm2: 25 },
  { id: "alwar", locationName: "Alwar", region: "Rajasthan NCR", state: "Rajasthan", lat: 27.5665, lng: 76.625, zoneAreaKm2: 25 },

  // --- Uttar Pradesh (NCR) ---
  { id: "noida", locationName: "Noida", region: "UP NCR", state: "Uttar Pradesh", lat: 28.5355, lng: 77.391, zoneAreaKm2: 25 },
  { id: "greater-noida", locationName: "Greater Noida", region: "UP NCR", state: "Uttar Pradesh", lat: 28.4744, lng: 77.504, zoneAreaKm2: 25 },
  { id: "ghaziabad", locationName: "Ghaziabad", region: "UP NCR", state: "Uttar Pradesh", lat: 28.6692, lng: 77.4538, zoneAreaKm2: 25 },
  { id: "hapur", locationName: "Hapur", region: "UP NCR", state: "Uttar Pradesh", lat: 28.7306, lng: 77.7759, zoneAreaKm2: 25 },
  { id: "bulandshahr", locationName: "Bulandshahr", region: "UP NCR", state: "Uttar Pradesh", lat: 28.4069, lng: 77.8498, zoneAreaKm2: 25 },
  { id: "meerut", locationName: "Meerut", region: "UP NCR", state: "Uttar Pradesh", lat: 28.9845, lng: 77.7064, zoneAreaKm2: 25 },
];

export const TIME_POINTS = {
  t1: { key: "0230", clock: "02:30", label: "02:30", period: "Night / Off-Peak" },
  t2: { key: "1759", clock: "17:59", label: "17:59", period: "Evening Peak Hour" },
};
