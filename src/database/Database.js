import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

const DATABASE_NAME = 'CPAP_DB.db';

export const getDBConnection = async () => {
  try {
    const db = await SQLite.openDatabase({
      name: DATABASE_NAME,
      location: 'default',
    });
    await createTables(db);
    return db;
  } catch (error) {
    throw error;
  }
};

export const createTables = async db => {
  try {
    const profilesTableQuery = `
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        dob TEXT,
        image_uri TEXT,
        first_name TEXT,
        last_name TEXT,
        gender TEXT
      );
    `;

    const homeScreenDataTableQuery = `
      CREATE TABLE IF NOT EXISTS home_screen_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date_key TEXT,
        day INTEGER, month INTEGER, year INTEGER,
        hour INTEGER, min INTEGER, sec INTEGER,
        mode_selection TEXT,
        cpap_pressure_set REAL,
        mask_type TEXT,
        tube_type TEXT,
        smart_start_on_off TEXT,
        filter_on_off TEXT,
        ramp_min_pressure REAL,
        c_flex_set INTEGER,
        c_trig_set TEXT,
        ramp_time INTEGER,
        humidifier_level INTEGER,
        A_CPAP_min_p REAL,
        A_CPAP_max_p REAL,
        E_day INTEGER,
        E_month INTEGER,
        E_year INTEGER,
        E_hour INTEGER,
        E_min INTEGER,
        E_sec INTEGER,
        session_AI INTEGER,
        events_per_hour INTEGER,
        session_Press REAL,
        session_LEAK REAL,
        session_Usage_hrs INTEGER,
        session_Usage_mins INTEGER,
        mask_on_off_count INTEGER
      );
    `;

    const settingsTableQuery = `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `;

    await db.executeSql(profilesTableQuery);
    await db.executeSql(homeScreenDataTableQuery);
    await db.executeSql(settingsTableQuery);
  } catch (error) {
    throw error;
  }
};

export const saveHomeScreenData = async (db, data) => {
  const {
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
    mask_on_off_count = 0,
  } = data;

  const insertQuery = `
    INSERT INTO home_screen_data (
      date_key, day, month, year, hour, min, sec,
      mode_selection, cpap_pressure_set, mask_type, tube_type,
      smart_start_on_off, filter_on_off, ramp_min_pressure,
      c_flex_set, c_trig_set, ramp_time, humidifier_level,
      A_CPAP_min_p, A_CPAP_max_p,
      E_day, E_month, E_year, E_hour, E_min, E_sec,
      session_AI, events_per_hour, session_Press, session_LEAK,
      session_Usage_hrs, session_Usage_mins, mask_on_off_count
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
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
  ];

  try {
    await db.executeSql(insertQuery, params);
  } catch (error) {
    throw error;
  }
};

export const getHomeScreenDataForDate = async (db, date) => {
  try {
    const query = `
      SELECT * FROM home_screen_data
      WHERE date_key = ?
      ORDER BY hour DESC, min DESC, sec DESC
      LIMIT 1;
    `;
    const [results] = await db.executeSql(query, [date]);
    return results.rows.length > 0 ? results.rows.item(0) : null;
  } catch (error) {
    throw error;
  }
};

export const getAllSessionsForDate = async (db, date) => {
  try {
    const query = `
      SELECT * FROM home_screen_data
      WHERE date_key = ?
      ORDER BY hour ASC, min ASC, sec ASC;
    `;
    const [results] = await db.executeSql(query, [date]);
    const sessions = [];
    for (let i = 0; i < results.rows.length; i++) {
      sessions.push(results.rows.item(i));
    }
    return sessions;
  } catch (error) {
    return [];
  }
};

export const getHomeScreenDataForDateRange = async (db, startDate, endDate) => {
  try {
    const query = `
      SELECT * FROM home_screen_data
      WHERE date_key BETWEEN ? AND ?
      ORDER BY date_key ASC, hour ASC, min ASC, sec ASC;
    `;
    const [results] = await db.executeSql(query, [startDate, endDate]);
    const rows = [];
    for (let i = 0; i < results.rows.length; i++) {
      rows.push(results.rows.item(i));
    }
    return rows;
  } catch (error) {
    return [];
  }
};

export const getProfile = async (db, email) => {
  try {
    const [results] = await db.executeSql(
      'SELECT * FROM profiles WHERE email = ?',
      [email],
    );
    return results.rows.length > 0 ? results.rows.item(0) : null;
  } catch (error) {
    return null;
  }
};

export const saveProfile = async (db, profile, originalEmail = null) => {
  const existing = await getProfile(db, originalEmail || profile.email);
  if (existing) {
    const query = `
      UPDATE profiles SET 
        name = ?, email = ?, dob = ?, image_uri = ?, first_name = ?, last_name = ?, gender = ?
      WHERE id = ?;
    `;
    const params = [
      profile.name,
      profile.email,
      profile.dob,
      profile.image_uri,
      profile.first_name,
      profile.last_name,
      profile.gender,
      existing.id,
    ];
    await db.executeSql(query, params);
  } else {
    const query = `
      INSERT INTO profiles (name, email, dob, image_uri, first_name, last_name, gender)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `;
    const params = [
      profile.name,
      profile.email,
      profile.dob,
      profile.image_uri || '',
      profile.first_name,
      profile.last_name,
      profile.gender,
    ];
    await db.executeSql(query, params);
  }
};

export const deleteProfile = async (db, email) => {
  if (!email) return;
  await db.executeSql('DELETE FROM profiles WHERE email = ?', [email]);
};

export const emailExists = async (db, email, excludeId = null) => {
  const query = excludeId
    ? 'SELECT COUNT(*) AS count FROM profiles WHERE email = ? AND id != ?'
    : 'SELECT COUNT(*) AS count FROM profiles WHERE email = ?';
  const params = excludeId ? [email, excludeId] : [email];
  const [results] = await db.executeSql(query, params);
  return results.rows.item(0).count > 0;
};

export const closeDB = async db => {
  try {
    if (db) {
      await db.close();
    }
  } catch (error) {
    throw error;
  }
};

export const getLatestPatientProfile = async db => {
  try {
    const query = 'SELECT * FROM profiles ORDER BY id DESC LIMIT 1';
    const [results] = await db.executeSql(query);
    return results.rows.length > 0 ? results.rows.item(0) : null;
  } catch (error) {
    throw error;
  }
};

export const savePinToDb = async (db, pinValue) => {
  try {
    const query = `
      INSERT OR REPLACE INTO settings (key, value)
      VALUES (?, ?);
    `;
    await db.executeSql(query, ['app_pin', pinValue]);
  } catch (error) {
    throw error;
  }
};

export const getPinFromDb = async db => {
  try {
    const query = `SELECT value FROM settings WHERE key = ?;`;
    const [results] = await db.executeSql(query, ['app_pin']);
    return results.rows.length > 0 ? results.rows.item(0).value : null;
  } catch (error) {
    return null;
  }
};

export const deletePinFromDb = async db => {
  try {
    const query = `DELETE FROM settings WHERE key = ?;`;
    await db.executeSql(query, ['app_pin']);
  } catch (error) {
    throw error;
  }
};

// Add this new function to your Database.js file

export const isDuplicatePacket = async (db, data) => {
  try {
    const query = `
      SELECT COUNT(*) as count FROM home_screen_data
      WHERE date_key = ? AND day = ? AND month = ? AND year = ? 
      AND hour = ? AND min = ? AND sec = ?
      AND mode_selection = ? AND cpap_pressure_set = ? 
      AND mask_type = ? AND tube_type = ?
      AND smart_start_on_off = ? AND filter_on_off = ?
      AND ramp_min_pressure = ? AND c_flex_set = ?
      AND c_trig_set = ? AND ramp_time = ?
      AND humidifier_level = ? AND A_CPAP_min_p = ?
      AND A_CPAP_max_p = ? AND E_day = ?
      AND E_month = ? AND E_year = ? AND E_hour = ?
      AND E_min = ? AND E_sec = ? AND session_AI = ?
      AND events_per_hour = ? AND session_Press = ?
      AND session_LEAK = ? AND session_Usage_hrs = ?
      AND session_Usage_mins = ? AND mask_on_off_count = ?
    `;

    const params = [
      data.date_key,
      data.day,
      data.month,
      data.year,
      data.hour,
      data.min,
      data.sec,
      data.mode_selection,
      data.cpap_pressure_set,
      data.mask_type,
      data.tube_type,
      data.smart_start_on_off,
      data.filter_on_off,
      data.ramp_min_pressure,
      data.c_flex_set,
      data.c_trig_set,
      data.ramp_time,
      data.humidifier_level,
      data.A_CPAP_min_p,
      data.A_CPAP_max_p,
      data.E_day,
      data.E_month,
      data.E_year,
      data.E_hour,
      data.E_min,
      data.E_sec,
      data.session_AI,
      data.events_per_hour,
      data.session_Press,
      data.session_LEAK,
      data.session_Usage_hrs,
      data.session_Usage_mins,
      data.mask_on_off_count || 0,
    ];

    const [results] = await db.executeSql(query, params);
    return results.rows.item(0).count > 0;
  } catch (error) {
    console.error('Error checking for duplicate packet:', error);
    return false; // If error occurs, assume it's not a duplicate to be safe
  }
};

// Updated saveHomeScreenData function with duplicate check
export const saveHomeScreenDataWithDuplicateCheck = async (db, data) => {
  try {
    // Check if this exact packet already exists
    const isDuplicate = await isDuplicatePacket(db, data);

    if (isDuplicate) {
      console.log('Duplicate packet detected, skipping save');
      return { success: false, reason: 'duplicate' };
    }

    // If not duplicate, save the data
    await saveHomeScreenData(db, data);
    return { success: true, reason: 'saved' };
  } catch (error) {
    console.error('Error saving home screen data:', error);
    return { success: false, reason: 'error', error: error.message };
  }
};
