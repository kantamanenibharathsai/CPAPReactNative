import moment from 'moment';

export const maskTypeMap = {
  0: 'Full',
  1: 'Nasal',
  2: 'Pillow Mask',
};

export const tubeTypeMap = {
  0: 'standard',
  1: 'custom',
};

export const cFlexLevelMap = {
  0: '0',
  1: '1',
  2: '2',
  3: '3',
  4: '4',
};

export const cFlexTriggerMap = {
  0: 'Low',
  1: 'Medium',
  2: 'High',
  3: 'Very High',
};

export const humidityLevelMap = {
  0: '0',
  1: '1',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
};

export const getUsageScore = (hours, minutes) => {
  const usage = hours + (minutes || 0) / 60;
  if (usage >= 7) return 70;
  if (usage >= 6) return 60;
  if (usage >= 5) return 50;
  if (usage >= 4) return 35;
  if (usage >= 2) return 10;
  if (usage > 0) return 1;
  return 0;
};

export const getMaskSealScore = leak => {
  if (leak <= 10) return 20;
  if (leak <= 15) return 19;
  if (leak <= 20) return 17;
  if (leak <= 30) return 14;
  return 9;
};

export const getAHIScore = ahi => {
  if (ahi <= 5) return 5;
  if (ahi <= 7) return 4;
  if (ahi <= 10) return 3;
  if (ahi <= 13) return 2;
  if (ahi <= 15) return 1;
  return 0;
};

export const getMaskOnOffScore = count => {
  if (count <= 1) return 5;
  if (count === 2) return 4;
  if (count === 3) return 3;
  if (count === 4) return 2;
  if (count === 5) return 1;
  return 0;
};

export const parseCpapPacket = hexString => {
  if (hexString.length <= 0) throw new Error('Invalid packet length');
  const b = Buffer.from(hexString, 'hex');

  if (
    b[0] !== 0x24 ||
    b[1] < 0x01 ||
    b[1] > 0xff ||
    b[2] !== 0x01 ||
    b[34] !== 0x0a
  ) {
    throw new Error('Packet header/footer/type invalid');
  }

  const criticalIndices = [
    3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
    28, 29, 30, 31, 32, 33,
  ];

  for (const i of criticalIndices) {
    if (b[i] === 0xff) throw new Error('Dummy value found in critical field');
  }

  const formatTwo = n => n.toString().padStart(2, '0');

  const day = b[3];
  const month = b[4];
  const year = b[5];
  const hour = b[6];
  const min = b[7];
  const sec = b[8];
  const E_day = b[22];
  const E_month = b[23];
  const E_year = b[24];
  const E_hour = b[25];
  const E_min = b[26];
  const E_sec = b[27];
  const date_key = `20${formatTwo(year)}-${formatTwo(month)}-${formatTwo(day)}`;
  const mode_selection =
    b[9] === 1 ? 'CPAP' : b[9] === 2 ? 'AUTO CPAP' : `Unknown(${b[9]})`;
  const cpap_pressure_set = +(b[10] / 10).toFixed(1);
  const ramp_min_pressure = +(b[15] / 10).toFixed(1);
  const A_CPAP_min_p = +(b[20] / 10).toFixed(1);
  const A_CPAP_max_p = +(b[21] / 10).toFixed(1);
  const session_Press = +(b[30] / 10).toFixed(1);
  const session_LEAK = +(b[31] / 10).toFixed(1);
  const mask_type = maskTypeMap[b[11]] || `Unknown(${b[11]})`;
  const tube_type = tubeTypeMap[b[12]] || `Unknown(${b[12]})`;
  const smart_start_on_off = b[13] === 1 ? 'On' : 'Off';
  const filter_on_off = b[14] === 1 ? 'On' : 'Off';
  const c_flex_set = cFlexLevelMap[b[16]];
  const c_trig_set = cFlexTriggerMap[b[17]] || `Unknown(${b[17]})`;
  const ramp_time = b[18];
  const humidifier_level = humidityLevelMap[b[19]];
  const session_AI = b[28];
  const events_per_hour = b[29];
  const session_Usage_hrs = b[32];
  const session_Usage_mins = b[33];
  const mask_on_off_count = 0;

  return {
    date_key,
    day,
    month,
    year,
    hour,
    min,
    sec,
    mode_selection,
    cpap_pressure_set,
    mask_type,
    tube_type,
    smart_start_on_off,
    filter_on_off,
    ramp_min_pressure,
    c_flex_set,
    c_trig_set,
    ramp_time,
    humidifier_level,
    A_CPAP_min_p,
    A_CPAP_max_p,
    E_day,
    E_month,
    E_year,
    E_hour,
    E_min,
    E_sec,
    session_AI,
    events_per_hour,
    session_Press,
    session_LEAK,
    session_Usage_hrs,
    session_Usage_mins,
    mask_on_off_count,
  };
};

// export const parseCpapPacket = hexString => {
//   // 1. Initial length check: Minimum possible packet size (e.g., start, length, type, end byte)
//   // Based on your spreadsheet (Screenshot from 2025-07-25 10-19-43.png):
//   // packet start byte (1 byte) + packet length byte (1 byte) + packet type (1 byte) + end byte (1 byte) = minimum 4 bytes
//   // So, minimum hex string length is 4 bytes * 2 hex characters/byte = 8 characters
//   if (hexString.length < 8) {
//     throw new Error(
//       'Invalid packet length: Hex string too short to contain essential fields.',
//     );
//   }
//   const b = Buffer.from(hexString, 'hex');
//   // 2. Validate Start Byte
//   if (b[0] !== 0x24) {
//     throw new Error('Invalid start byte: Expected 0x24.');
//   }

//   // 3. Read and Validate Packet Length (b[1])
//   // This byte now represents the TOTAL number of bytes in the entire packet.
//   const totalPacketBytes = b[1];
//   if (totalPacketBytes < 1 || totalPacketBytes > 255) {
//     throw new Error(
//       `Packet length byte out of range: ${totalPacketBytes} (expected 1-255).`,
//     );
//   }

//   // 4. Verify the actual hexString length against the declared totalPacketBytes
//   // hexString.length is characters, totalPacketBytes is bytes.
//   if (hexString.length !== totalPacketBytes * 2) {
//     throw new Error(
//       `Mismatched packet length: Declared total bytes ${totalPacketBytes} implies ${
//         totalPacketBytes * 2
//       } hex chars, but got ${hexString.length}.`,
//     );
//   }

//   // 5. Validate Packet Type (b[2]) - from spreadsheet example 0x01
//   if (b[2] !== 0x01) {
//     throw new Error('Packet type invalid: Expected 0x01 for Session Data.');
//   }

//   console.log('totalpacketbytes', totalPacketBytes);

//   // 6. Validate End Byte (0x0A) position
//   // The end byte should be the very last byte of the packet.
//   // Since totalPacketBytes is the count, the last byte's index is totalPacketBytes - 1 (0-indexed).
//   const endBytePosition = totalPacketBytes - 1;
//   if (b[endBytePosition] !== 0x0a) {
//     throw new Error(
//       `Packet end byte invalid: Expected 0x0A at position ${endBytePosition}, but got 0x${b[
//         endBytePosition
//       ]
//         .toString(16)
//         .padStart(2, '0')}.`,
//     );
//   }

//   // Critical Indices (these are fixed offsets based on your spreadsheet for a Session Data packet structure)
//   // Ensure these indices are within the received packet length, just in case a malformed shorter packet comes through.
//   const criticalIndices = [
//     3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
//     28, 29, 30, 31, 32, 33,
//   ];

//   for (const i of criticalIndices) {
//     if (i >= totalPacketBytes) {
//       // Check against the actual total packet size
//       throw new Error(
//         `Critical field index ${i} is out of bounds for the declared total packet length of ${totalPacketBytes} bytes. Packet is incomplete.`,
//       );
//     }
//     if (b[i] === 0xff) {
//       throw new Error(
//         `Dummy value (0xFF) found in critical field at byte index ${i}.`,
//       );
//     }
//   }

//   // Helper function for range validation
//   const validateRange = (value, min, max, paramName) => {
//     if (value < min || value > max) {
//       throw new Error(
//         `${paramName} out of range: ${value} (expected ${min}-${max}).`,
//       );
//     }
//   };

//   const formatTwo = n => n.toString().padStart(2, '0');

//   // Extract and Validate Session Start Date/Time
//   const day = b[3];
//   validateRange(day, 1, 31, 'session start day');
//   const month = b[4];
//   validateRange(month, 1, 12, 'session start month');
//   const year = b[5];
//   validateRange(year, 0, 99, 'session start year'); // Assuming 0-99 for 2000-2099
//   const hour = b[6];
//   validateRange(hour, 0, 23, 'session start hour');
//   const min = b[7];
//   validateRange(min, 0, 59, 'session start minute');
//   const sec = b[8];
//   validateRange(sec, 0, 59, 'session start second');

//   const date_key = `20${formatTwo(year)}-${formatTwo(month)}-${formatTwo(day)}`;

//   // Extract and Validate Mode
//   const modeRaw = b[9];
//   validateRange(modeRaw, 1, 4, 'mode selection');
//   const mode_selection =
//     modeRaw === 1
//       ? 'CPAP'
//       : modeRaw === 2
//       ? 'AUTO CPAP'
//       : `Unknown(${modeRaw})`;

//   // Extract and Validate CPAP Pressure Set
//   const cpapPressureSetRaw = b[10];
//   validateRange(cpapPressureSetRaw, 40, 200, 'cpap pressure set (raw)');
//   const cpap_pressure_set = +(cpapPressureSetRaw / 10).toFixed(1);

//   // Extract and Validate Mask Type
//   const maskTypeRaw = b[11];
//   validateRange(maskTypeRaw, 0, 2, 'mask type');
//   const mask_type = maskTypeMap[maskTypeRaw] || `Unknown(${maskTypeRaw})`;

//   // Extract and Validate Tube Type
//   const tubeTypeRaw = b[12];
//   validateRange(tubeTypeRaw, 0, 1, 'tube type');
//   const tube_type = tubeTypeMap[tubeTypeRaw] || `Unknown(${tubeTypeRaw})`;

//   // Extract and Validate Smart Start On/Off
//   const smartStartRaw = b[13];
//   validateRange(smartStartRaw, 0, 1, 'smart start on/off');
//   const smart_start_on_off = smartStartRaw === 1 ? 'On' : 'Off';

//   // Extract and Validate Filter On/Off
//   const filterOnOffRaw = b[14];
//   validateRange(filterOnOffRaw, 0, 1, 'filter on/off');
//   const filter_on_off = filterOnOffRaw === 1 ? 'On' : 'Off';

//   // Extract and Validate Ramp Min Pressure
//   const rampMinPressureRaw = b[15];
//   validateRange(rampMinPressureRaw, 40, 200, 'ramp min pressure (raw)');
//   const ramp_min_pressure = +(rampMinPressureRaw / 10).toFixed(1);

//   // Extract and Validate C-Flex Level
//   const cFlexLevelRaw = b[16];
//   validateRange(cFlexLevelRaw, 0, 4, 'c_flex_Level');
//   const c_flex_set = cFlexLevelMap[cFlexLevelRaw];

//   // Extract and Validate C-Flex Trigger
//   const cFlexTriggerRaw = b[17];
//   validateRange(cFlexTriggerRaw, 0, 3, 'c_flex_trigger');
//   const c_trig_set =
//     cFlexTriggerMap[cFlexTriggerRaw] || `Unknown(${cFlexTriggerRaw})`;

//   // Extract and Validate Ramp Time
//   const rampTime = b[18];
//   validateRange(rampTime, 0, 45, 'ramp time');

//   // Extract and Validate Humidification Level
//   const humidifierLevelRaw = b[19];
//   validateRange(humidifierLevelRaw, 0, 8, 'humidification level');
//   const humidifier_level = humidityLevelMap[humidifierLevelRaw];

//   // Extract and Validate A-CPAP Min Pressure
//   const aCpapMinPRaw = b[20];
//   validateRange(aCpapMinPRaw, 40, 200, 'A-CPAP min pressure (raw)');
//   const A_CPAP_min_p = +(aCpapMinPRaw / 10).toFixed(1);

//   // Extract and Validate A-CPAP Max Pressure
//   const aCpapMaxPRaw = b[21];
//   validateRange(aCpapMaxPRaw, 40, 200, 'A-CPAP max pressure (raw)');
//   const A_CPAP_max_p = +(aCpapMaxPRaw / 10).toFixed(1);

//   // Extract and Validate Session End Date/Time
//   const E_day = b[22];
//   validateRange(E_day, 1, 31, 'session end day');
//   const E_month = b[23];
//   validateRange(E_month, 1, 12, 'session end month');
//   const E_year = b[24];
//   validateRange(E_year, 0, 99, 'session end year'); // Assuming 0-99 for 2000-2099
//   const E_hour = b[25];
//   validateRange(E_hour, 0, 23, 'session end hour');
//   const E_min = b[26];
//   validateRange(E_min, 0, 59, 'session end minute');
//   const E_sec = b[27];
//   validateRange(E_sec, 0, 59, 'session end second');

//   // Extract and Validate Session AI
//   const sessionAI = b[28];
//   validateRange(sessionAI, 0, 255, 'session AI');
//   const session_AI = sessionAI;

//   // Extract and Validate Events Per Hour (AHI)
//   const eventsPerHourRaw = b[29];
//   validateRange(eventsPerHourRaw, 0, 200, 'events per hour (AHI)');
//   const events_per_hour = eventsPerHourRaw;

//   // Extract and Validate Session Pressure
//   const sessionPressureRaw = b[30];
//   validateRange(sessionPressureRaw, 40, 200, 'session pressure (raw)');
//   const session_Press = +(sessionPressureRaw / 10).toFixed(1);

//   // Extract and Validate Session Leak
//   const sessionLeakRaw = b[31];
//   validateRange(sessionLeakRaw, 0, 250, 'session LEAK (raw)');
//   const session_LEAK = +(sessionLeakRaw / 10).toFixed(1);

//   // Extract and Validate Session Usage Hours
//   const sessionUsageHrs = b[32];
//   validateRange(sessionUsageHrs, 0, 23, 'session usage hours');
//   const session_Usage_hrs = sessionUsageHrs;

//   // Extract and Validate Session Usage Minutes
//   const sessionUsageMins = b[33];
//   validateRange(sessionUsageMins, 0, 59, 'session usage minutes');
//   const session_Usage_mins = sessionUsageMins;

//   // IMPORTANT: Placeholder for mask_on_off_count.
//   // This value is not present in the provided spreadsheet for extraction.
//   // You MUST ensure this is correctly extracted from your UDP packet structure if it exists.
//   const mask_on_off_count = 0;

//   return {
//     date_key,
//     day,
//     month,
//     year,
//     hour,
//     min,
//     sec,
//     mode_selection,
//     cpap_pressure_set,
//     mask_type,
//     tube_type,
//     smart_start_on_off,
//     filter_on_off,
//     ramp_min_pressure,
//     c_flex_set,
//     c_trig_set,
//     ramp_time,
//     humidifier_level,
//     A_CPAP_min_p,
//     A_CPAP_max_p,
//     E_day,
//     E_month,
//     E_year,
//     E_hour,
//     E_min,
//     E_sec,
//     session_AI,
//     events_per_hour,
//     session_Press,
//     session_LEAK,
//     session_Usage_hrs,
//     session_Usage_mins,
//     mask_on_off_count,
//   };
// };

// Format helpers
export const formatDate = (year, month, day) => {
  if (year == null || month == null || day == null) return 'N/A';
  const fullYear = 2000 + year;
  return `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(
    2,
    '0',
  )}`;
};

export const formatTime = (hour, min, sec) => {
  if (hour == null || min == null || sec == null) return 'N/A';
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(
    2,
    '0',
  )}:${String(sec).padStart(2, '0')}`;
};

export const setValuesDisplayList = [
  { label: 'Session Start Date', key: 'sessionStartDate', unit: '' },
  { label: 'Session Start Time', key: 'sessionStartTime', unit: '' },
  { label: 'Session End Date', key: 'sessionEndDate', unit: '' },
  { label: 'Session End Time', key: 'sessionEndTime', unit: '' },
  { label: 'Mode', key: 'mode_selection', unit: '' },
  { label: 'CPAP Set Pressure', key: 'cpap_pressure_set', unit: 'cmH₂O' },
  { label: 'Mask Type', key: 'mask_type', unit: 'mask' },
  { label: 'Tube Type', key: 'tube_type', unit: '' },
  { label: 'Smart Start', key: 'smart_start_on_off', unit: '' },
  { label: 'Filter', key: 'filter_on_off', unit: '' },
  { label: 'Ramp Min Pressure', key: 'ramp_min_pressure', unit: 'cmH₂O' },
  { label: 'C-Flex', key: 'c_flex_set', unit: 'Level' },
  { label: 'C-Flex Trigger', key: 'c_trig_set', unit: 'sensitivity' },
  { label: 'Ramp Time', key: 'ramp_time', unit: 'mins' },
  { label: 'Humidity Level', key: 'humidifier_level', unit: 'level' },
  { label: 'Auto CPAP Min Pressure', key: 'A_CPAP_min_p', unit: 'cmH₂O' },
  { label: 'Auto CPAP Max Pressure', key: 'A_CPAP_max_p', unit: 'cmH₂O' },
  { label: 'Session AI', key: 'session_AI', unit: 'AI' },
  { label: 'Events Per Hour (AHI)', key: 'events_per_hour', unit: 'AHI' },
  { label: 'Session Pressure', key: 'session_Press', unit: 'cmH₂O' },
  { label: 'Session Leak', key: 'session_LEAK', unit: 'LPM' },
  { label: 'Session Usage Hours', key: 'session_Usage_hrs', unit: 'hrs' },
  { label: 'Session Usage Minutes', key: 'session_Usage_mins', unit: 'mins' },
];

export const generateDates = () => {
  const dates = [];
  let currentDate = moment('2025-01-01');
  const today = moment();
  while (currentDate.isSameOrBefore(today, 'day')) {
    dates.push(currentDate.clone());
    currentDate.add(1, 'day');
  }
  return dates;
};
