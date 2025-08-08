import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  SafeAreaView,
  Image,
  ActivityIndicator,
  Platform,
  Modal,
  StatusBar,
  Linking,
  Alert,
} from 'react-native';
import AntDesignIcon from 'react-native-vector-icons/AntDesign';
import * as Progress from 'react-native-progress';
import LinearGradient from 'react-native-linear-gradient';
import moment from 'moment';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import dgram from 'react-native-udp';
import { Buffer } from 'buffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WifiManager from 'react-native-wifi-reborn';
import {
  getDBConnection,
  createTables,
  saveHomeScreenData,
  getHomeScreenDataForDate,
  getProfile,
  deletePinFromDb,
} from '../database/Database';
import { appendToDebugFile } from './Login';
import {
  getUsageScore,
  getMaskSealScore,
  getAHIScore,
  getMaskOnOffScore,
  parseCpapPacket,
  formatDate,
  formatTime,
  setValuesDisplayList,
  generateDates,
} from '../utils/Data.js';
global.Buffer = Buffer;

const { width } = Dimensions.get('window');

const OUTER_CIRCLE_SIZE = 200;
const INNER_CIRCLE_SIZE = 140;
const CPAP_RING_THICKNESS = (OUTER_CIRCLE_SIZE - INNER_CIRCLE_SIZE) / 2;

const ClockImage = require('../../assets/images/Clock.png');
const GoodMaskSealImage = require('../../assets/images/GoodMaskSeal.png');
const EventsImage = require('../../assets/images/Events.png');
const MaskOnOffImage = require('../../assets/images/MaskOnOff.png');
const TotalCPAPScoreImage = require('../../assets/images/TotalCPAPScore.png');

const UDP_CONFIG = {
  LOCAL_PORT: 5000,
};

let udpBuffer = '';

const COLORS = {
  darkBackground: '#242e39',
  headerBackground: '#3a434d',
  accent: '#5f72d4',
  textPrimary: '#fff',
  textSecondary: '#a1a9b3',
  textAccent: '#D2D7FF',
  divider: '#757b82',
  progressBlue: '#257bda',
  progressPurple: '#653fc1',
  progressCyan: '#27bfd9',
  progressPink: '#c82bae',
  progressYellow: '#c7b70f',
  progressUnfilled: '#b2c6d4',
  modalOverlay: 'rgba(0, 0, 0, 0.5)',
  modalCancel: '#757b82',
  modalConfirm: '#e74c3c',
};

const SIZES = {
  fontSize14: 14,
  fontSize15: 15,
  fontSize16: 16,
  fontSize18: 18,
  fontSize20: 20,
  fontSize24: 24,
  progressHeight: 15,
  icon: 24,
  logoutIcon: 26,
  modalTitle: 20,
};

const SPACING = {
  containerPadding: 20,
  cardPaddingVertical: 15,
  cardPaddingHorizontal: 20,
  marginBottom5: 5,
  marginBottom10: 10,
  marginBottom15: 15,
  marginBottom20: 20,
  marginBottom25: 25,
  marginBottom30: 30,
  marginTop0: 0,
  marginTop5: 5,
  marginTop10: 10,
  marginTop25: 25,
  paddingBottom20: 20,
  paddingTop30: 30,
  modalPadding: 25,
  modalButtonMarginHorizontal: 5,
};

const BORDER_RADIUS = {
  card: 15,
  header: 0,
  progressBar: 6,
  modal: 15,
  modalButton: 8,
};

const FONT_WEIGHT = {
  bold: 'bold',
  semibold: '600',
};

const COMMON_STYLES = {
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowSpaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowCentered: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  textWhite: {
    color: COLORS.textPrimary,
  },
};

const HomeScreen = () => {
  const navigation = useNavigation();
  const scrollViewRef = useRef(null);
  const hasScrolledOnMount = useRef(false);
  const [displayUser, setDisplayUser] = useState('Bharath');
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    moment().format('YYYY-MM-DD'),
  );
  const [hasDataForSelectedDate, setHasDataForSelectedDate] = useState(false);
  const [usageScore, setUsageScore] = useState(0);
  const [maskSealScore, setMaskSealScore] = useState(0);
  const [ahiScore, setAhiScore] = useState(0);
  const [maskOnOffScore, setMaskOnOffScore] = useState(0);
  const [cpapScore, setCpapScore] = useState(0);
  const [maskSealLabel, setMaskSealLabel] = useState('N/A');
  const [eventsValue, setEventsValue] = useState(0);
  const [maskOnOffCount, setMaskOnOffCount] = useState(0);
  const [setValues, setSetValues] = useState({});
  const [rawUsageHours, setRawUsageHours] = useState(0);
  const [rawUsageMinutes, setRawUsageMinutes] = useState(0);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [scrollViewReady, setScrollViewReady] = useState(false);

  const dates = useMemo(() => generateDates(), []);

  useEffect(() => {
    const initializeDatabase = async () => {
      try {
        const connection = await getDBConnection();
        await createTables(connection);
        setDb(connection);
      } catch (error) {}
    };
    initializeDatabase();
  }, []);

  useEffect(() => {
    if (!db) return;
    const sock = dgram.createSocket('udp4');
    sock.on('listening', () => {});
    sock.bind(UDP_CONFIG.LOCAL_PORT);
    sock.on('message', async msg => {
      const receivedHex = msg.toString('hex');
      udpBuffer += receivedHex;
      try {
        await appendToDebugFile(`UDP_PACKET: ${receivedHex}`);
      } catch (_) {}

      let startIndex = udpBuffer.indexOf('24');
      while (startIndex !== -1 && udpBuffer.length >= startIndex + 70) {
        const potentialPacketHex = udpBuffer.substring(
          startIndex,
          startIndex + 70,
        );
        try {
          const decoded = parseCpapPacket(potentialPacketHex);
          if (db) {
            try {
              await saveHomeScreenData(db, decoded);
            } catch (_) {}
          }
          udpBuffer = udpBuffer.substring(startIndex + 70);
          startIndex = udpBuffer.indexOf('24');
        } catch (_) {
          udpBuffer = udpBuffer.substring(startIndex + 2);
          startIndex = udpBuffer.indexOf('24');
        }
      }
    });
    sock.on('error', err => {});
    sock.on('close', () => {});

    return async () => {
      sock.removeAllListeners();
      sock.close();
      const databaseConnection = await getDBConnection();
      await deletePinFromDb(databaseConnection);
    };
  }, [db]);

  useEffect(() => {
    if (!db) return;

    const fetchAndSetData = async () => {
      setLoading(true);
      setHasDataForSelectedDate(false);
      try {
        const data = await getHomeScreenDataForDate(db, selectedDate);
        if (data) {
          const usageVal = getUsageScore(
            data.session_Usage_hrs,
            data.session_Usage_mins,
          );
          const sealVal = getMaskSealScore(data.session_LEAK);
          const ahiVal = getAHIScore(data.events_per_hour);
          const onOffVal = getMaskOnOffScore(data.mask_on_off_count);

          setUsageScore(usageVal);
          setMaskSealScore(sealVal);
          setAhiScore(ahiVal);
          setMaskOnOffScore(onOffVal);
          setCpapScore(usageVal + sealVal + ahiVal + onOffVal);
          setMaskSealLabel(
            sealVal >= 18
              ? 'Excellent'
              : sealVal >= 15
              ? 'Good'
              : 'Needs Attention',
          );
          setEventsValue(data.events_per_hour || 0);
          setMaskOnOffCount(data.mask_on_off_count || 0);
          setRawUsageHours(data.session_Usage_hrs || 0);
          setRawUsageMinutes(data.session_Usage_mins || 0);

          const sessionStartDate = formatDate(data.year, data.month, data.day);
          const sessionStartTime = formatTime(data.hour, data.min, data.sec);
          const sessionEndDate = formatDate(
            data.E_year,
            data.E_month,
            data.E_day,
          );
          const sessionEndTime = formatTime(
            data.E_hour,
            data.E_min,
            data.E_sec,
          );

          const newSetValues = {};
          setValuesDisplayList.forEach(item => {
            let val = data[item.key];
            if (typeof val === 'number') {
              if (item.unit && item.unit.includes('cmH₂O')) {
                val = parseFloat(val).toFixed(1);
              } else {
                val = val.toString();
              }
            }
            newSetValues[item.key] = val == null ? 'N/A' : val;
          });
          newSetValues['sessionStartDate'] = sessionStartDate;
          newSetValues['sessionStartTime'] = sessionStartTime;
          newSetValues['sessionEndDate'] = sessionEndDate;
          newSetValues['sessionEndTime'] = sessionEndTime;

          setSetValues(newSetValues);
          setHasDataForSelectedDate(true);
        } else {
          setUsageScore(0);
          setMaskSealScore(0);
          setAhiScore(0);
          setMaskOnOffScore(0);
          setCpapScore(0);
          setMaskSealLabel('N/A');
          setEventsValue(0);
          setMaskOnOffCount(0);
          setRawUsageHours(0);
          setRawUsageMinutes(0);
          setHasDataForSelectedDate(false);
          const blankSetValues = {};
          setValuesDisplayList.forEach(item => {
            blankSetValues[item.key] = 'N/A';
          });
          setSetValues(blankSetValues);
        }
      } catch (error) {
        setHasDataForSelectedDate(false);
      } finally {
        setLoading(false);
      }
    };
    fetchAndSetData();
  }, [db, selectedDate]);

  useFocusEffect(
    React.useCallback(() => {
      let isActive = true;
      const fetchProfileNameFromDB = async () => {
        if (!db) {
          if (isActive) setDisplayUser('Unknown User');
          return;
        }

        try {
          const userEmail = await AsyncStorage.getItem('userEmail');
          let userNameToDisplay = 'Imeds Global';

          if (userEmail) {
            const profile = await getProfile(db, userEmail);
            if (profile && profile.name) {
              userNameToDisplay = profile.name;
            } else {
              const storedUserName = await AsyncStorage.getItem('userName');
              if (storedUserName) {
                userNameToDisplay = storedUserName;
              }
            }
          } else {
            const storedUserName = await AsyncStorage.getItem('userName');
            if (storedUserName) {
              userNameToDisplay = storedUserName;
            }
          }

          if (isActive) {
            setDisplayUser(userNameToDisplay);
          }
        } catch (error) {
          if (isActive) {
            setDisplayUser('Unknown User');
          }
        }
      };
      fetchProfileNameFromDB();
      return () => {
        isActive = false;
      };
    }, [db]),
  );

  useFocusEffect(
    React.useCallback(() => {
      StatusBar.setBarStyle('light-content', true);
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor(COLORS.headerBackground, true);
      }
      return () => {};
    }, []),
  );

  useEffect(() => {
    if (
      scrollViewReady &&
      !hasScrolledOnMount.current &&
      scrollViewRef.current &&
      dates.length > 0
    ) {
      const todayIndex = dates.findIndex(d => d.isSame(moment(), 'day'));
      if (todayIndex !== -1) {
        const itemWidth = 100;
        const scrollToX = Math.max(
          0,
          todayIndex * itemWidth - width / 2 + itemWidth / 2,
        );
        scrollViewRef.current.scrollTo({ x: scrollToX, animated: true });
        hasScrolledOnMount.current = true;
      }
    }
  }, [scrollViewReady, dates, width]);

  const navigateToHistory = activeTab => {
    navigation.navigate('HistoryScreen', {
      activeTab: activeTab,
      selectedDate: selectedDate,
    });
  };

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    try {
      await handleWizFiDisconnection();
      AsyncStorage.removeItem('userEmail');
      AsyncStorage.removeItem('userName');
      AsyncStorage.setItem('isLoggedIn', JSON.stringify(false));
      getDBConnection()
        .then(databaseConnection => {
          deletePinFromDb(databaseConnection);
        })
        .catch(dbError => {});
      navigation.reset({
        index: 0,
        routes: [{ name: 'Welcome' }],
      });
    } catch (error) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Welcome' }],
      });
    }
  };

  const showManualDisconnectionAlert = () => {
    const instructions =
      Platform.OS === 'ios'
        ? 'Please go to Settings > Wi-Fi, find the WizFi network, tap the "i" button, and select "Forget This Network"'
        : 'Please go to Settings > Wi-Fi, find the WizFi network, and select "Forget" or "Disconnect"';

    Alert.alert(
      'Manual Disconnection Required',
      `Unable to automatically disconnect from the WizFi network.\n\n${instructions}`,
      [
        {
          text: 'Open Settings',
          onPress: () => {
            if (Platform.OS === 'ios') {
              Linking.openURL('App-Prefs:root=WIFI').catch(() => {
                Linking.openURL('App-Prefs:root=Settings');
              });
            } else {
              Linking.sendIntent('android.settings.WIFI_SETTINGS').catch(() => {
                Linking.openSettings();
              });
            }
          },
        },
        { text: 'Continue', style: 'default' },
      ],
      { cancelable: false },
    );
  };

  const handleWizFiDisconnection = async () => {
    const performForceDisconnect = async () => {
      try {
        await WifiManager.disconnect();
        await new Promise(resolve => setTimeout(resolve, 800));
      } catch (error) {}
      try {
        await WifiManager.connectToProtectedSSID(
          '__DUMMY_DISCONNECT__',
          'dummy',
          false,
          false,
        );
      } catch (error) {}
    };

    try {
      const currentSSID = await WifiManager.getCurrentWifiSSID();
      if (!currentSSID || !currentSSID.startsWith('WizFi')) {
        return;
      }
      try {
        await WifiManager.removeWifiNetwork(currentSSID);
        await new Promise(resolve => setTimeout(resolve, 2000));
        const afterRemoveSSID = await WifiManager.getCurrentWifiSSID();
        if (!afterRemoveSSID || !afterRemoveSSID.startsWith('WizFi')) {
          return;
        }
      } catch (error) {}
      await performForceDisconnect();
      const finalSSID = await WifiManager.getCurrentWifiSSID();
      if (finalSSID && finalSSID.startsWith('WizFi')) {
        showManualDisconnectionAlert();
      }
    } catch (error) {}
  };

  const renderMetricCard = (
    image,
    text,
    score,
    denominator,
    color,
    onPress,
  ) => (
    <TouchableOpacity style={styles.metricCard} onPress={onPress}>
      <View style={styles.metricHeader}>
        <View style={styles.metricHeaderContent}>
          <Image source={image} style={styles.metricIcon} />
          <Text style={[styles.commonText, { marginHorizontal: 10 }]}>
            {text}
          </Text>
        </View>
        <Text style={styles.metricValueText}>
          {score} / {denominator}
        </Text>
      </View>
      <Progress.Bar
        progress={score / denominator}
        width={null}
        height={SIZES.progressHeight}
        color={color}
        unfilledColor={COLORS.progressUnfilled}
        borderWidth={0}
        borderRadius={BORDER_RADIUS.progressBar}
        style={styles.progressBar}
      />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.headerCont]}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{displayUser}</Text>
          <TouchableOpacity onPress={handleLogout}>
            <AntDesignIcon
              name="logout"
              size={SIZES.logoutIcon}
              color="white"
            />
          </TouchableOpacity>
        </View>
        <Text style={styles.welcomeMessage}>Welcome Back!</Text>

        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dateNavigationContainer}
          contentContainerStyle={styles.dateNavigationContent}
          onLayout={() => setScrollViewReady(true)}
        >
          {dates.map(date => {
            const isSelected = date.format('YYYY-MM-DD') === selectedDate;
            const isFuture = date.isAfter(moment(), 'day');
            return (
              <TouchableOpacity
                key={date.format('YYYY-MM-DD')}
                onPress={() =>
                  !isFuture && setSelectedDate(date.format('YYYY-MM-DD'))
                }
                style={styles.dateItem}
                disabled={isFuture}
              >
                <Text
                  style={[
                    isSelected ? styles.dateTextFocused : styles.dateText,
                    isFuture && styles.dateTextDisabled,
                  ]}
                >
                  {date.format('ddd, MMM D')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.progressBlue} />
          </View>
        )}

        {!loading && !hasDataForSelectedDate && (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>
              No Data Available for this Date
            </Text>
            <Text style={styles.noDataSubText}>
              Please select another date or ensure your device is connected.
            </Text>
          </View>
        )}

        {!loading && hasDataForSelectedDate && (
          <>
            <View style={styles.cpapScoreContainer}>
              <Progress.Circle
                size={OUTER_CIRCLE_SIZE}
                progress={cpapScore / 100}
                showsText={false}
                color={COLORS.accent}
                unfilledColor="transparent"
                borderWidth={0.2}
                thickness={CPAP_RING_THICKNESS}
                strokeCap="round"
                style={styles.progressCircleOverlay}
              />
              <LinearGradient
                colors={['#5a67a6', '#3a498f']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.innerCircle,
                  {
                    width: INNER_CIRCLE_SIZE,
                    height: INNER_CIRCLE_SIZE,
                    borderRadius: INNER_CIRCLE_SIZE / 2,
                  },
                ]}
              >
                <Text style={styles.cpapScoreLabelInner}>CPAP Score</Text>
                <Text style={styles.cpapScoreValueInner}>{cpapScore}</Text>
                <Text style={styles.cpapScorePointsInner}>100 Points</Text>
              </LinearGradient>
            </View>

            <Text style={styles.greatScoreText}>That's a great score!</Text>
            <Text style={styles.healthImprovementText}>
              You're well on your way to improving your health
            </Text>

            {renderMetricCard(
              ClockImage,
              `${rawUsageHours}h ${rawUsageMinutes}m Usage Hours`,
              usageScore,
              70,
              COLORS.progressBlue,
              () => navigateToHistory('Usage Hours'),
            )}

            {renderMetricCard(
              GoodMaskSealImage,
              `${maskSealLabel} Mask Seal`,
              maskSealScore,
              20,
              COLORS.progressPurple,
              () => navigateToHistory('Mask Seal'),
            )}

            {renderMetricCard(
              EventsImage,
              `${eventsValue} Events Per Hour (AHI)`,
              ahiScore,
              5,
              COLORS.progressCyan,
              () => navigateToHistory('Events'),
            )}

            {renderMetricCard(
              MaskOnOffImage,
              `${maskOnOffCount} Mask On/Off`,
              maskOnOffScore,
              5,
              COLORS.progressPink,
              () => navigateToHistory('Mask On/Off'),
            )}

            {renderMetricCard(
              TotalCPAPScoreImage,
              'Total CPAP Score',
              cpapScore,
              100,
              COLORS.progressYellow,
              () => navigateToHistory('Total CPAP Score'),
            )}

            <View style={styles.setValuesCard}>
              <View style={styles.setValuesHeader}>
                <Text style={styles.setValuesTitle}>Set Values</Text>
              </View>
              <View style={styles.setValuesContent}>
                {setValuesDisplayList.map(({ label, key, unit }) => (
                  <View key={key} style={styles.setValuesRow}>
                    <Text style={styles.setValuesLabel}>{label}</Text>
                    <Text style={styles.setValuesColon}>:</Text>
                    <Text style={styles.setValuesValue}>
                      {setValues[key] !== undefined &&
                      setValues[key] !== null &&
                      setValues[key] !== 'N/A'
                        ? `${setValues[key]}${unit ? ' ' + unit : ''}`
                        : 'N/A'}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={showLogoutModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Logout</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to logout?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowLogoutModal(false);
                }}
              >
                <Text style={styles.cancelButtonText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={confirmLogout}
              >
                <Text style={styles.confirmButtonText}>Yes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.darkBackground,
    flex: 1,
  },
  headerCont: {
    backgroundColor: COLORS.headerBackground,
    paddingTop: Platform.OS === 'android' ? 24 : 50,
    paddingBottom: 0,
    borderBottomLeftRadius: BORDER_RADIUS.header,
    borderBottomRightRadius: BORDER_RADIUS.header,
    overflow: 'hidden',
  },
  userInfo: {
    ...COMMON_STYLES.rowSpaceBetween,
    paddingHorizontal: SPACING.containerPadding,
    marginBottom: SPACING.marginBottom10,
  },
  userName: {
    ...COMMON_STYLES.textWhite,
    fontSize: SIZES.fontSize24,
    fontWeight: FONT_WEIGHT.bold,
  },
  welcomeMessage: {
    ...COMMON_STYLES.textWhite,
    fontSize: SIZES.fontSize16,
    fontWeight: FONT_WEIGHT.semibold,
    paddingHorizontal: SPACING.containerPadding,
    marginBottom: SPACING.marginBottom20,
    marginTop: SPACING.marginTop0,
  },
  dateNavigationContainer: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    height: 33,
    marginTop: SPACING.marginTop10,
    paddingBottom: -200,
  },
  dateNavigationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  dateItem: {
    ...COMMON_STYLES.centered,
    minWidth: 100,
    height: '100%',
    paddingHorizontal: 15,
  },
  dateText: {
    color: COLORS.textSecondary,
    fontSize: SIZES.fontSize14,
    fontWeight: FONT_WEIGHT.semibold,
    paddingBottom: 5,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  dateTextFocused: {
    color: COLORS.textAccent,
    fontSize: SIZES.fontSize15,
    fontWeight: FONT_WEIGHT.bold,
    borderBottomWidth: 2,
    borderStyle: 'solid',
    borderBottomColor: COLORS.textAccent,
    paddingBottom: 5,
  },
  dateTextDisabled: {
    color: '#5e6773',
    opacity: 0.6,
  },
  scrollViewContent: {
    ...COMMON_STYLES.centered,
    paddingBottom: SPACING.paddingBottom20,
    paddingTop: SPACING.paddingTop30,
    flexGrow: 1,
  },
  cpapScoreContainer: {
    width: OUTER_CIRCLE_SIZE,
    height: OUTER_CIRCLE_SIZE,
    ...COMMON_STYLES.centered,
    marginBottom: SPACING.marginBottom30,
    position: 'relative',
    borderRadius: OUTER_CIRCLE_SIZE / 2,
  },
  progressCircleOverlay: {
    position: 'absolute',
  },
  innerCircle: {
    ...COMMON_STYLES.centered,
    position: 'absolute',
  },
  cpapScoreLabelInner: {
    color: COLORS.textAccent,
    fontSize: 11,
    fontWeight: FONT_WEIGHT.semibold,
  },
  cpapScoreValueInner: {
    fontSize: 30,
    fontWeight: FONT_WEIGHT.bold,
    ...COMMON_STYLES.textWhite,
  },
  cpapScorePointsInner: {
    color: COLORS.textAccent,
    fontSize: 11,
    fontWeight: FONT_WEIGHT.semibold,
    borderTopWidth: 1,
    borderTopColor: COLORS.textPrimary,
    borderStyle: 'solid',
    paddingTop: 3,
    marginTop: SPACING.marginTop5,
  },
  greatScoreText: {
    ...COMMON_STYLES.textWhite,
    fontSize: SIZES.fontSize18,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: SPACING.marginBottom5,
    textAlign: 'center',
  },
  healthImprovementText: {
    color: COLORS.textSecondary,
    fontSize: SIZES.fontSize14,
    textAlign: 'center',
    marginBottom: SPACING.marginBottom30,
  },
  metricCard: {
    backgroundColor: COLORS.headerBackground,
    borderRadius: BORDER_RADIUS.card,
    paddingHorizontal: SPACING.cardPaddingHorizontal,
    paddingVertical: SPACING.cardPaddingVertical,
    marginBottom: SPACING.marginBottom15,
    width: width * 0.93,
    ...COMMON_STYLES.cardShadow,
  },
  metricHeader: {
    ...COMMON_STYLES.rowSpaceBetween,
    marginBottom: SPACING.marginBottom10,
  },
  metricHeaderContent: {
    ...COMMON_STYLES.rowCentered,
  },
  metricIcon: {
    width: SIZES.icon,
    height: SIZES.icon,
    tintColor: COLORS.textAccent,
    marginRight: 10,
  },
  commonText: {
    ...COMMON_STYLES.textWhite,
    fontSize: SIZES.fontSize14,
    fontWeight: FONT_WEIGHT.semibold,
  },
  metricValueText: {
    color: COLORS.textAccent,
    fontSize: SIZES.fontSize16,
    marginLeft: 'auto',
    fontWeight: FONT_WEIGHT.bold,
  },
  progressBar: {
    marginTop: SPACING.marginTop5,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  setValuesCard: {
    backgroundColor: COLORS.headerBackground,
    borderRadius: BORDER_RADIUS.card,
    marginBottom: SPACING.marginBottom15,
    width: width * 0.93,
    marginTop: SPACING.marginTop25,
  },
  setValuesHeader: {
    backgroundColor: '#48515a',
    paddingHorizontal: SPACING.cardPaddingHorizontal,
    paddingVertical: SPACING.cardPaddingVertical,
    borderTopLeftRadius: BORDER_RADIUS.card,
    borderTopRightRadius: BORDER_RADIUS.card,
  },
  setValuesTitle: {
    ...COMMON_STYLES.textWhite,
    fontSize: SIZES.fontSize18,
    fontWeight: FONT_WEIGHT.bold,
  },
  setValuesContent: {
    paddingHorizontal: SPACING.cardPaddingHorizontal,
    paddingVertical: SPACING.paddingBottom20,
  },
  setValuesRow: {
    ...COMMON_STYLES.rowSpaceBetween,
    marginBottom: SPACING.marginBottom15,
  },
  setValuesLabel: {
    color: COLORS.textSecondary,
    fontSize: SIZES.fontSize14,
    flex: 1.5,
    textAlign: 'left',
  },
  setValuesColon: {
    ...COMMON_STYLES.textWhite,
    fontSize: SIZES.fontSize14,
    width: 12,
    textAlign: 'center',
  },
  setValuesValue: {
    ...COMMON_STYLES.textWhite,
    fontSize: SIZES.fontSize14,
    flex: 1,
    textAlign: 'right',
    fontWeight: FONT_WEIGHT.semibold,
  },
  noDataContainer: {
    flex: 1,
    ...COMMON_STYLES.centered,
    padding: SPACING.containerPadding,
    minHeight: 300,
  },
  noDataText: {
    color: COLORS.textAccent,
    fontSize: SIZES.fontSize20,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: SPACING.marginBottom10,
    textAlign: 'center',
  },
  noDataSubText: {
    color: COLORS.textSecondary,
    fontSize: SIZES.fontSize14,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    ...COMMON_STYLES.centered,
    padding: SPACING.containerPadding,
    minHeight: 300,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.modalOverlay,
    ...COMMON_STYLES.centered,
  },
  modalContainer: {
    backgroundColor: COLORS.headerBackground,
    borderRadius: BORDER_RADIUS.modal,
    padding: SPACING.modalPadding,
    width: width * 0.8,
    alignItems: 'center',
  },
  modalTitle: {
    ...COMMON_STYLES.textWhite,
    fontSize: SIZES.modalTitle,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: SPACING.marginBottom15,
  },
  modalMessage: {
    color: COLORS.textSecondary,
    fontSize: SIZES.fontSize16,
    textAlign: 'center',
    marginBottom: SPACING.marginBottom25,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: SPACING.containerPadding,
    borderRadius: BORDER_RADIUS.modalButton,
    ...COMMON_STYLES.centered,
    marginHorizontal: SPACING.modalButtonMarginHorizontal,
  },
  cancelButton: {
    backgroundColor: COLORS.modalCancel,
  },
  confirmButton: {
    backgroundColor: COLORS.modalConfirm,
  },
  cancelButtonText: {
    ...COMMON_STYLES.textWhite,
    fontSize: SIZES.fontSize16,
    fontWeight: FONT_WEIGHT.semibold,
  },
  confirmButtonText: {
    ...COMMON_STYLES.textWhite,
    fontSize: SIZES.fontSize16,
    fontWeight: FONT_WEIGHT.semibold,
  },
});

export default HomeScreen;
