import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  FlatList,
  Animated,
  Easing,
  Alert,
  Platform,
  Modal,
  TextInput,
  RefreshControl,
  Linking,
  PermissionsAndroid,
} from 'react-native';
import WifiManager from 'react-native-wifi-reborn';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  request,
  PERMISSIONS,
  RESULTS,
  openSettings,
  check,
} from 'react-native-permissions';
import { useNavigation } from '@react-navigation/native';
import { NetworkInfo } from 'react-native-network-info';
import dgram from 'react-native-udp';
import { Buffer } from 'buffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appendToDebugFile } from './Login';
import {
  getDBConnection,
  createTables,
  saveHomeScreenData,
  saveHomeScreenDataWithDuplicateCheck,
} from '../database/Database';
import { parseCpapPacket } from '../utils/Data.js';

global.Buffer = Buffer;

const LOCAL_PORT = 5000;
const TARGET_DEVICE_IP = '192.168.36.7';
const TARGET_DEVICE_PORT = 5000;
const expectedHandshake = 'wifi_handshake\r\n';

let udpBuffer = '';

const WifiConnecting = () => {
  const [wifiList, setWifiList] = useState([]);
  const [selectedSSID, setSelectedSSID] = useState(null);
  const [password, setPassword] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [connectedSSID, setConnectedSSID] = useState(null);
  const [gatewayIP, setGatewayIP] = useState(null);
  const rotation = useRef(new Animated.Value(0)).current;
  const navigation = useNavigation();
  const [udpMessageContent, setUdpMessageContent] = useState('');
  const [udpPacketReceived, setUdpPacketReceived] = useState(false);
  const [phoneIP, setPhoneIP] = useState(null);
  const udpSocketRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const receivedPackets = useRef([]);
  const [db, setDb] = useState(null);
  const [wifiPermissionModalVisible, setWifiPermissionModalVisible] =
    useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // WiFi monitoring states
  const [isMonitoringWifi, setIsMonitoringWifi] = useState(false);
  const wifiMonitorIntervalRef = useRef(null);
  const [wifiEnableModalVisible, setWifiEnableModalVisible] = useState(false);
  const [wifiDisconnectedModalVisible, setWifiDisconnectedModalVisible] =
    useState(false);

  // Store the resolve functions in refs to avoid closure issues
  const wifiEnableResolveRef = useRef(null);
  const wifiDisconnectedResolveRef = useRef(null);

  // Clear all connection-related states
  const clearConnectionStates = () => {
    console.log('Clearing connection states...');
    setConnectedSSID(null);
    setUdpMessageContent('');
    setUdpPacketReceived(false);
    setPhoneIP(null);
    setGatewayIP(null);
    setWifiList([]); // Clear the WiFi list
    setShowSuccess(false); // Clear any success state

    // Close UDP socket if open
    if (udpSocketRef.current && !udpSocketRef.current._destroyed) {
      udpSocketRef.current.close();
      udpSocketRef.current = null;
    }
  };

  const handleExternalWifiConnection = async ssid => {
    console.log('Handling external WiFi connection to:', ssid);

    // Get network info
    NetworkInfo.getIPV4Address().then(ip => {
      setPhoneIP(ip);
    });

    NetworkInfo.getGatewayIPAddress().then(ip => {
      setGatewayIP(ip);
    });

    // Send the initial UDP message
    setTimeout(() => {
      // sendUdpMessage('Hello WizFi360!');
    }, 2000); // Add delay to ensure network is fully established
  };

  const startWifiMonitoring = () => {
    if (isMonitoringWifi) {
      console.log('WiFi monitoring already running');
      return;
    }

    console.log('Starting WiFi monitoring...');
    setIsMonitoringWifi(true);
    let lastWifiState = true;
    let lastConnectedSSID = connectedSSID; // Track the last known connected SSID

    wifiMonitorIntervalRef.current = setInterval(async () => {
      try {
        const wifiEnabled = await WifiManager.isEnabled();

        // WiFi was just turned off
        if (lastWifiState && !wifiEnabled) {
          console.log('WiFi turned off, clearing states and showing modal');
          clearConnectionStates();

          // Stop current monitoring to prevent multiple modals
          setIsMonitoringWifi(false);
          if (wifiMonitorIntervalRef.current) {
            clearInterval(wifiMonitorIntervalRef.current);
            wifiMonitorIntervalRef.current = null;
          }

          // Show disconnect modal immediately with proper resolve function
          wifiDisconnectedResolveRef.current = shouldReconnect => {
            // console.log(
            //   'WiFi disconnected resolve called with:',
            //   shouldReconnect,
            // );
            if (shouldReconnect) {
              handleWifiPermissionAndState().then(wifiHandled => {
                if (wifiHandled) {
                  startRotation();
                  scanWifiNetworks();
                  scanIntervalRef.current = setInterval(scanWifiNetworks, 5000);
                  startWifiMonitoring();
                }
              });
            } else {
              navigation.goBack();
            }
          };
          setWifiDisconnectedModalVisible(true);

          lastWifiState = wifiEnabled;
          lastConnectedSSID = null; // Reset the last connected SSID
          return; // Exit early to prevent further processing
        }

        lastWifiState = wifiEnabled;

        if (!wifiEnabled) return;

        // Rest of monitoring logic for when WiFi is enabled
        const currentSSID = await WifiManager.getCurrentWifiSSID().catch(
          () => null,
        );

        if (currentSSID && currentSSID.startsWith('WizFi')) {
          // Check if this is a new connection
          if (currentSSID !== lastConnectedSSID) {
            // console.log('New WizFi connection detected:', currentSSID);
            setConnectedSSID(currentSSID);

            // Handle as external connection (send UDP message)
            await handleExternalWifiConnection(currentSSID);

            lastConnectedSSID = currentSSID;
          } else if (!connectedSSID) {
            // This handles the case where the component state was cleared but we're still connected
            // console.log('Reconnecting to existing WizFi network:', currentSSID);
            setConnectedSSID(currentSSID);

            // Get network info
            NetworkInfo.getIPV4Address().then(ip => {
              setPhoneIP(ip);
            });

            NetworkInfo.getGatewayIPAddress().then(ip => {
              setGatewayIP(ip);
            });

            lastConnectedSSID = currentSSID;
          }
        } else if (connectedSSID || lastConnectedSSID) {
          console.log('Lost connection to WizFi network');
          clearConnectionStates();
          lastConnectedSSID = null;
        }
      } catch (error) {
        console.log('WiFi monitoring error:', error);
      }
    }, 1000); // Check every second for faster response
  };

  const stopWifiMonitoring = () => {
    console.log('Stopping WiFi monitoring...');
    setIsMonitoringWifi(false);
    if (wifiMonitorIntervalRef.current) {
      clearInterval(wifiMonitorIntervalRef.current);
      wifiMonitorIntervalRef.current = null;
    }
  };

  // const checkCurrentWifiConnection = async () => {
  //   try {
  //     // Get currently connected WiFi SSID
  //     let currentSSID;
  //     try {
  //       currentSSID = await WifiManager.getCurrentWifiSSID();
  //     } catch (error) {
  //       // On some Android devices, we need to load the wifi list first
  //       await WifiManager.loadWifiList();
  //       currentSSID = await WifiManager.getCurrentWifiSSID();
  //     }

  //     if (currentSSID && currentSSID.startsWith('WizFi')) {
  //       const wasAlreadyConnected = connectedSSID === currentSSID;
  //       setConnectedSSID(currentSSID);

  //       // If this is a new connection (not already connected), handle it as external
  //       if (!wasAlreadyConnected) {
  //         await handleExternalWifiConnection(currentSSID);
  //       } else {
  //         // Already connected, just update network info
  //         NetworkInfo.getIPV4Address().then(ip => {
  //           setPhoneIP(ip);
  //         });

  //         NetworkInfo.getGatewayIPAddress().then(ip => {
  //           setGatewayIP(ip);
  //         });
  //       }

  //       return true;
  //     }
  //   } catch (error) {
  //     console.log('Could not get current WiFi status:', error);
  //   }
  //   return false;
  // };

  // Database initialization useEffect

  const checkCurrentWifiConnection = async () => {
    try {
      // Ensure location permission is granted before checking WiFi
      const hasLocationPermission = await requestLocationPermission();
      if (!hasLocationPermission) {
        console.log('Location permission required for WiFi operations');
        return false;
      }

      // Check if WiFi is enabled first
      const wifiEnabled = await WifiManager.isEnabled();
      if (!wifiEnabled) {
        console.log('WiFi is disabled');
        return false;
      }

      // Get currently connected WiFi SSID
      let currentSSID;
      try {
        currentSSID = await WifiManager.getCurrentWifiSSID();
      } catch (error) {
        console.log(
          'Error getting current SSID, trying to load wifi list first:',
          error,
        );
        try {
          // On some Android devices, we need to load the wifi list first
          await WifiManager.loadWifiList();
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a bit
          currentSSID = await WifiManager.getCurrentWifiSSID();
        } catch (secondError) {
          console.log(
            'Failed to get current SSID after loading wifi list:',
            secondError,
          );
          return false;
        }
      }

      if (currentSSID && currentSSID.startsWith('WizFi')) {
        const wasAlreadyConnected = connectedSSID === currentSSID;
        setConnectedSSID(currentSSID);

        // If this is a new connection (not already connected), handle it as external
        if (!wasAlreadyConnected) {
          await handleExternalWifiConnection(currentSSID);
        } else {
          // Already connected, just update network info
          NetworkInfo.getIPV4Address().then(ip => {
            setPhoneIP(ip);
          });

          NetworkInfo.getGatewayIPAddress().then(ip => {
            setGatewayIP(ip);
          });
        }

        return true;
      }
    } catch (error) {
      console.log('Could not get current WiFi status:', error);
    }
    return false;
  };

  useEffect(() => {
    (async () => {
      try {
        const connection = await getDBConnection();
        await createTables(connection);
        setDb(connection);
      } catch (error) {
        Alert.alert('Database Error', 'Could not initialize the database.');
        await appendToDebugFile(`DB INIT ERROR: ${error.message}`);
      }
    })();
  }, []);

  // Enhanced initialization function for the main useEffect
  const enhancedInit = async () => {
    try {
      console.log('Starting enhanced initialization...');

      // First check if we're already connected to a WizFi network
      const isAlreadyConnected = await checkCurrentWifiConnection();

      if (isAlreadyConnected) {
        console.log('Already connected to WizFi network, starting monitoring');
        // If already connected to WizFi, start monitoring but don't scan
        startWifiMonitoring();
        return;
      }

      // Check location permission with better error handling
      const hasLocationPermission = await requestLocationPermission();
      if (!hasLocationPermission) {
        Alert.alert(
          'Permission Required',
          'Location permission is required to scan for Wi-Fi networks. This is needed to find your CPAP device.',
          [
            {
              text: 'Try Again',
              onPress: () => {
                // Retry initialization
                setTimeout(() => enhancedInit(), 1000);
              },
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => navigation.goBack(),
            },
            {
              text: 'Open Settings',
              onPress: () => {
                openSettings();
                // Also go back since user will need to restart
                setTimeout(() => navigation.goBack(), 500);
              },
            },
          ],
        );
        return;
      }

      // Then check and handle Wi-Fi
      const wifiHandled = await handleWifiPermissionAndState();
      if (!wifiHandled) {
        return;
      }

      // If both permissions are good, start scanning with a small delay
      console.log('Permissions OK, starting WiFi operations...');
      startRotation();

      // Add delay before first scan
      setTimeout(() => {
        scanWifiNetworks();
      }, 1000);

      scanIntervalRef.current = setInterval(() => {
        scanWifiNetworks();
      }, 8000); // Increased interval to 8 seconds for better stability

      // Start WiFi monitoring
      startWifiMonitoring();
    } catch (error) {
      console.error('Enhanced init error:', error);
      Alert.alert(
        'Initialization Error',
        'There was an error initializing the WiFi scanner. Please try again.',
        [
          {
            text: 'Retry',
            onPress: () => setTimeout(() => enhancedInit(), 1000),
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => navigation.goBack(),
          },
        ],
      );
    }
  };

  // Main initialization useEffect
  useEffect(() => {
    const init = async () => {
      // First check if we're already connected to a WizFi network
      const isAlreadyConnected = await checkCurrentWifiConnection();

      if (isAlreadyConnected) {
        // If already connected to WizFi, start monitoring but don't scan
        startWifiMonitoring();
        return;
      }

      // Check location permission
      const hasLocationPermission = await requestLocationPermission();
      if (!hasLocationPermission) {
        Alert.alert(
          'Permission Required',
          'Location permission is required to scan for Wi-Fi networks. Please enable it in settings.',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => navigation.goBack(),
            },
            { text: 'Open Settings', onPress: () => openSettings() },
          ],
        );
        return;
      }

      // Then check and handle Wi-Fi
      const wifiHandled = await handleWifiPermissionAndState();
      if (!wifiHandled) {
        return;
      }

      // If both permissions are good, start scanning
      startRotation();
      scanWifiNetworks();

      scanIntervalRef.current = setInterval(() => {
        scanWifiNetworks();
      }, 5000);

      // Start WiFi monitoring
      startWifiMonitoring();
    };

    init();

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      stopWifiMonitoring();
    };
  }, []);

  useEffect(() => {
    enhancedInit();

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      stopWifiMonitoring();
    };
  }, []);

  // UDP socket setup useEffect
  useEffect(() => {
    if (!db || !phoneIP) {
      return;
    }

    const socket = dgram.createSocket('udp4');
    udpSocketRef.current = socket;

    socket.bind(LOCAL_PORT, phoneIP, () => {
      // console.log('scwdnwdvjwndv');
    });

    socket.on('message', async (msg, rinfo) => {
      const message = Buffer.from(msg).toString('utf8');
      console.log('message', message);

      await appendToDebugFile(`RX: ${message}`);

      setUdpPacketReceived(true);

      if (message === expectedHandshake) {
        setUdpMessageContent(message);

        const ackMessage = 'app_ok\r\n';
        const ackBuffer = Buffer.from(ackMessage, 'utf8');

        socket.send(
          ackBuffer,
          0,
          ackBuffer.length,
          rinfo.port,
          rinfo.address,
          err => {},
        );

        await appendToDebugFile(`TX: ${ackMessage}`);
      } else {
        const receivedHex = msg.toString('hex');
        udpBuffer += receivedHex;
        await appendToDebugFile(`RX: ${receivedHex}`);

        let startIndex = udpBuffer.indexOf('24');
        let endIndex = udpBuffer.indexOf('0a', startIndex);

        while (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
          const potentialPacketHex = udpBuffer.substring(
            startIndex,
            startIndex + 70,
          );

          if (potentialPacketHex.length === 70) {
            try {
              const decoded = parseCpapPacket(potentialPacketHex);

              if (db) {
                try {
                  const result = await saveHomeScreenDataWithDuplicateCheck(
                    db,
                    decoded,
                  );
                  if (result.success) {
                    receivedPackets.current.push(decoded);
                  } else if (result.reason === 'duplicate') {
                    // console.log('Duplicate packet detected, not saving');
                  } else {
                    await appendToDebugFile(`SAVE ERROR: ${result.error}`);
                  }
                } catch (e) {
                  await appendToDebugFile(`DB SAVE ERROR: ${e.message}`);
                }
              }

              udpBuffer = udpBuffer.substring(startIndex + 70);
              startIndex = udpBuffer.indexOf('24');
              endIndex = udpBuffer.indexOf('0a', startIndex);
            } catch (e) {
              udpBuffer = udpBuffer.substring(startIndex + 2);
              startIndex = udpBuffer.indexOf('24');
              endIndex = udpBuffer.indexOf('0a', startIndex);
            }
          } else {
            break;
          }
        }
      }
    });

    socket.on('error', err => {
      console.log('error');
    });
    socket.on('close', () => {
      console.log('close');
    });

    return () => {
      if (socket && !socket._destroyed) {
        socket.close();
      }
    };
  }, [phoneIP]);

  // Success modal trigger useEffect
  useEffect(() => {
    if (udpMessageContent === expectedHandshake) {
      setShowSuccess(true);
    }
  }, [udpMessageContent]);

  // const requestLocationPermission = async () => {
  //   if (Platform.OS === 'android') {
  //     const result = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
  //     return result === RESULTS.GRANTED;
  //   } else if (Platform.OS === 'ios') {
  //     const result = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
  //     return result === RESULTS.GRANTED;
  //   }
  //   return false;
  // };

  // const requestLocationPermission = async () => {
  //   try {
  //     if (Platform.OS === 'android') {
  //       // First check if permission is already granted
  //       const currentStatus = await check(
  //         PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
  //       );

  //       if (currentStatus === RESULTS.GRANTED) {
  //         console.log('Location permission already granted');
  //         return true;
  //       }

  //       // For Android 13+, also request NEARBY_WIFI_DEVICES
  //       if (Platform.Version >= 33) {
  //         const wifiDevicesStatus = await check(
  //           PERMISSIONS.ANDROID.NEARBY_WIFI_DEVICES,
  //         );
  //         if (wifiDevicesStatus !== RESULTS.GRANTED) {
  //           const wifiDevicesResult = await request(
  //             PERMISSIONS.ANDROID.NEARBY_WIFI_DEVICES,
  //           );
  //           if (wifiDevicesResult !== RESULTS.GRANTED) {
  //             console.log('NEARBY_WIFI_DEVICES permission denied');
  //           }
  //         }
  //       }

  //       // Request location permission
  //       const result = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);

  //       if (result === RESULTS.GRANTED) {
  //         console.log('Location permission granted');
  //         return true;
  //       } else if (result === RESULTS.DENIED) {
  //         console.log('Location permission denied');
  //         return false;
  //       } else if (result === RESULTS.BLOCKED) {
  //         console.log('Location permission permanently denied');
  //         // Show alert to go to settings
  //         Alert.alert(
  //           'Permission Required',
  //           'Location permission is permanently denied. Please enable it in Settings to scan for WiFi networks.',
  //           [
  //             { text: 'Cancel', style: 'cancel' },
  //             { text: 'Open Settings', onPress: () => openSettings() },
  //           ],
  //         );
  //         return false;
  //       }
  //     } else if (Platform.OS === 'ios') {
  //       const result = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
  //       return result === RESULTS.GRANTED;
  //     }

  //     return false;
  //   } catch (error) {
  //     console.error('Error requesting location permission:', error);
  //     return false;
  //   }
  // };

  // Replace the existing requestLocationPermission function with this updated version:

  // const requestLocationPermission = async () => {
  //   try {
  //     if (Platform.OS === 'android') {
  //       // For Android 13+, first request NEARBY_WIFI_DEVICES
  //       if (Platform.Version >= 33) {
  //         const wifiDevicesStatus = await check(
  //           PERMISSIONS.ANDROID.NEARBY_WIFI_DEVICES,
  //         );

  //         if (wifiDevicesStatus !== RESULTS.GRANTED) {
  //           const wifiDevicesResult = await request(
  //             PERMISSIONS.ANDROID.NEARBY_WIFI_DEVICES,
  //           );

  //           // If NEARBY_WIFI_DEVICES is denied, don't proceed with location permission
  //           if (wifiDevicesResult !== RESULTS.GRANTED) {
  //             console.log(
  //               'NEARBY_WIFI_DEVICES permission denied - stopping permission flow',
  //             );

  //             // Show alert explaining why both permissions are needed
  //             Alert.alert(
  //               'Permission Required',
  //               'Nearby WiFi Devices permission is required to scan for CPAP devices. Without this permission, the app cannot function.',
  //               [
  //                 { text: 'Cancel', style: 'cancel' },
  //                 { text: 'Open Settings', onPress: () => openSettings() },
  //               ],
  //             );

  //             return false;
  //           }
  //         }
  //       }

  //       // Only proceed with location permission if NEARBY_WIFI_DEVICES was granted (or not needed)

  //       // First check if location permission is already granted
  //       const currentStatus = await check(
  //         PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
  //       );

  //       if (currentStatus === RESULTS.GRANTED) {
  //         console.log('Location permission already granted');
  //         return true;
  //       }

  //       // Request location permission
  //       const result = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);

  //       if (result === RESULTS.GRANTED) {
  //         console.log('Location permission granted');
  //         return true;
  //       } else if (result === RESULTS.DENIED) {
  //         console.log('Location permission denied');

  //         Alert.alert(
  //           'Permission Required',
  //           'Location permission is also required for WiFi scanning. Both permissions are needed for the app to work.',
  //           [
  //             { text: 'Cancel', style: 'cancel' },
  //             { text: 'Open Settings', onPress: () => openSettings() },
  //           ],
  //         );

  //         return false;
  //       } else if (result === RESULTS.BLOCKED) {
  //         console.log('Location permission permanently denied');
  //         Alert.alert(
  //           'Permission Required',
  //           'Location permission is permanently denied. Please enable both WiFi and Location permissions in Settings.',
  //           [
  //             { text: 'Cancel', style: 'cancel' },
  //             { text: 'Open Settings', onPress: () => openSettings() },
  //           ],
  //         );
  //         return false;
  //       }
  //     } else if (Platform.OS === 'ios') {
  //       const result = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
  //       return result === RESULTS.GRANTED;
  //     }

  //     return false;
  //   } catch (error) {
  //     console.error('Error requesting permissions:', error);
  //     return false;
  //   }
  // };

  // const requestLocationPermission = async () => {
  //   try {
  //     if (Platform.OS === 'android') {
  //       // For Android 13+, first explain why we need both permissions

  //       if (Platform.Version >= 33) {
  //         // First check current permission states

  //         const [wifiDevicesStatus, locationStatus] = await Promise.all([
  //           check(PERMISSIONS.ANDROID.NEARBY_WIFI_DEVICES),

  //           check(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION),
  //         ]);

  //         // If either permission is already granted, continue

  //         if (
  //           wifiDevicesStatus === RESULTS.GRANTED ||
  //           locationStatus === RESULTS.GRANTED
  //         ) {
  //           // Request any missing permissions

  //           if (wifiDevicesStatus !== RESULTS.GRANTED) {
  //             await request(PERMISSIONS.ANDROID.NEARBY_WIFI_DEVICES);
  //           }

  //           if (locationStatus !== RESULTS.GRANTED) {
  //             await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
  //           }

  //           return true;
  //         }

  //         // Show explanatory alert before requesting permissions

  //         const userResponse = await new Promise(resolve => {
  //           Alert.alert(
  //             'Permissions Needed',

  //             'To connect to your CPAP device, the app needs both Nearby Devices and Location permissions. ' +
  //               'This is required by Android to scan for WiFi devices.',

  //             [
  //               {
  //                 text: 'Cancel',

  //                 style: 'cancel',

  //                 onPress: () => resolve(false),
  //               },

  //               {
  //                 text: 'Continue',

  //                 onPress: () => resolve(true),
  //               },
  //             ],
  //           );
  //         });

  //         if (!userResponse) {
  //           return false;
  //         }

  //         // Request both permissions together

  //         const [wifiResult, locationResult] = await Promise.all([
  //           request(PERMISSIONS.ANDROID.NEARBY_WIFI_DEVICES),

  //           request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION),
  //         ]);

  //         if (
  //           wifiResult === RESULTS.GRANTED &&
  //           locationResult === RESULTS.GRANTED
  //         ) {
  //           return true;
  //         }

  //         // Handle partial or full denial

  //         if (
  //           wifiResult === RESULTS.DENIED ||
  //           locationResult === RESULTS.DENIED
  //         ) {
  //           Alert.alert(
  //             'Permissions Required',

  //             'Both permissions are needed for the app to work properly. ' +
  //               'You can change permissions in Settings.',

  //             [
  //               { text: 'Cancel', style: 'cancel' },

  //               { text: 'Open Settings', onPress: () => openSettings() },
  //             ],
  //           );

  //           return false;
  //         }

  //         if (
  //           wifiResult === RESULTS.BLOCKED ||
  //           locationResult === RESULTS.BLOCKED
  //         ) {
  //           Alert.alert(
  //             'Permissions Blocked',

  //             'Permissions have been permanently denied. ' +
  //               'Please enable them in Settings to use the app.',

  //             [
  //               { text: 'Cancel', style: 'cancel' },

  //               { text: 'Open Settings', onPress: () => openSettings() },
  //             ],
  //           );

  //           return false;
  //         }
  //       } else {
  //         // For Android <13, just request location permission

  //         const result = await request(
  //           PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
  //         );

  //         return result === RESULTS.GRANTED;
  //       }
  //     } else if (Platform.OS === 'ios') {
  //       // iOS permission handling remains the same

  //       const result = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);

  //       return result === RESULTS.GRANTED;
  //     }

  //     return false;
  //   } catch (error) {
  //     console.error('Error requesting permissions:', error);

  //     return false;
  //   }
  // };

  const requestLocationPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        // For Android 13+, check only Location permission
        if (Platform.Version >= 33) {
          // First check current permission state for ACCESS_FINE_LOCATION
          const locationStatus = await check(
            PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
          );

          // If Location permission is already granted, continue
          if (locationStatus === RESULTS.GRANTED) {
            return true;
          }

          // Show explanatory alert before requesting permission
          const userResponse = await new Promise(resolve => {
            Alert.alert(
              'Permissions Needed',
              'To connect to your CPAP device, the app needs Location permission. This is required by Android to scan for WiFi devices.',
              [
                {
                  text: 'Cancel',
                  style: 'cancel',
                  onPress: () => resolve(false),
                },
                {
                  text: 'Continue',
                  onPress: () => resolve(true),
                },
              ],
            );
          });

          if (!userResponse) {
            return false;
          }

          // Request Location permission
          const locationResult = await request(
            PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
          );

          if (locationResult === RESULTS.GRANTED) {
            return true;
          }

          // Handle denial
          if (locationResult === RESULTS.DENIED) {
            Alert.alert(
              'Permissions Required',
              'Location permission is needed for the app to work properly. You can change permissions in Settings.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => openSettings() },
              ],
            );
            return false;
          }

          // Handle blocked (permanently denied)
          if (locationResult === RESULTS.BLOCKED) {
            Alert.alert(
              'Permissions Blocked',
              'Location permission has been permanently denied. Please enable it in Settings to use the app.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => openSettings() },
              ],
            );
            return false;
          }
        } else {
          // For Android <13, just request location permission
          const result = await request(
            PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
          );
          return result === RESULTS.GRANTED;
        }
      } else if (Platform.OS === 'ios') {
        // iOS permission handling remains the same
        const result = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
        return result === RESULTS.GRANTED;
      }

      return false;
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return false;
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    const wifiEnabled = await WifiManager.isEnabled();
    if (!wifiEnabled) {
      clearConnectionStates();
    } else {
      await scanWifiNetworks();
    }
    setRefreshing(false);
  };

  const handleWifiPermissionAndState = async () => {
    try {
      // Check if Wi-Fi is enabled
      const wifiEnabled = await WifiManager.isEnabled();

      if (!wifiEnabled) {
        // Show custom modal to ask user to enable Wi-Fi
        return new Promise(resolve => {
          wifiEnableResolveRef.current = resolve;
          setWifiEnableModalVisible(true);
        });
      }

      return true; // Wi-Fi is already enabled
    } catch (error) {
      Alert.alert(
        'Wi-Fi Error',
        'Could not check Wi-Fi status. Please ensure Wi-Fi is enabled.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ],
        { cancelable: false },
      );
      return false;
    }
  };

  const handleWifiDisconnectedCancel = () => {
    console.log('WiFi disconnected modal cancelled');
    setWifiDisconnectedModalVisible(false);
    if (wifiDisconnectedResolveRef.current) {
      wifiDisconnectedResolveRef.current(false);
      wifiDisconnectedResolveRef.current = null;
    }
  };

  const handleWifiDisconnectedEnable = async () => {
    console.log('WiFi disconnected modal - enable clicked');
    setWifiDisconnectedModalVisible(false);

    // Immediately show WiFi enable modal
    const wifiHandled = await new Promise(resolve => {
      wifiEnableResolveRef.current = resolve;
      setWifiEnableModalVisible(true);
    });

    if (wifiHandled) {
      // Restart the scanning process
      startRotation();
      scanWifiNetworks();

      // Restart scanning interval
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
      scanIntervalRef.current = setInterval(() => {
        scanWifiNetworks();
      }, 5000);

      // Resume WiFi monitoring
      startWifiMonitoring();
    } else {
      navigation.goBack();
    }

    // Call the original resolve function
    if (wifiDisconnectedResolveRef.current) {
      wifiDisconnectedResolveRef.current(wifiHandled);
      wifiDisconnectedResolveRef.current = null;
    }
  };

  const handleWifiEnableCancel = () => {
    console.log('WiFi enable modal cancelled');
    setWifiEnableModalVisible(false);
    navigation.goBack();
    if (wifiEnableResolveRef.current) {
      wifiEnableResolveRef.current(false);
      wifiEnableResolveRef.current = null;
    }
  };

  const handleWifiEnableConfirm = async () => {
    console.log('WiFi enable modal confirmed');
    setWifiEnableModalVisible(false);

    try {
      // For Android, we can try to enable Wi-Fi programmatically
      if (Platform.OS === 'android') {
        await WifiManager.setEnabled(true);

        // Wait for Wi-Fi to actually be enabled
        let attempts = 0;
        const maxAttempts = 10; // Wait up to 5 seconds (10 * 500ms)

        while (attempts < maxAttempts) {
          await new Promise(resolveDelay => setTimeout(resolveDelay, 500)); // Wait 500ms
          const isNowEnabled = await WifiManager.isEnabled();

          if (isNowEnabled) {
            // Add a delay before proceeding!
            setTimeout(() => {
              if (wifiEnableResolveRef.current) {
                wifiEnableResolveRef.current(true);
                wifiEnableResolveRef.current = null;
              }
            }, 2000);
            return;
          }

          attempts++;
        }

        // If Wi-Fi didn't enable after waiting, show error
        Alert.alert(
          'Wi-Fi Enable Failed',
          'Wi-Fi could not be enabled automatically. Please enable it manually in Settings.',
          [
            {
              text: 'Open Settings',
              onPress: () => {
                setTimeout(() => {
                  openSettings();
                  navigation.goBack();
                  if (wifiEnableResolveRef.current) {
                    wifiEnableResolveRef.current(false);
                    wifiEnableResolveRef.current = null;
                  }
                }, 100);
              },
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {
                setTimeout(() => {
                  navigation.goBack();
                  if (wifiEnableResolveRef.current) {
                    wifiEnableResolveRef.current(false);
                    wifiEnableResolveRef.current = null;
                  }
                }, 100);
              },
            },
          ],
          { cancelable: false },
        );
      } else {
        // For iOS, redirect to settings
        Alert.alert(
          'Enable Wi-Fi',
          'Please enable Wi-Fi in Settings and return to the app.',
          [
            {
              text: 'Open Settings',
              onPress: () => {
                setTimeout(() => {
                  Linking.openURL('App-Prefs:WIFI');
                  navigation.goBack();
                  if (wifiEnableResolveRef.current) {
                    wifiEnableResolveRef.current(false);
                    wifiEnableResolveRef.current = null;
                  }
                }, 100);
              },
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {
                setTimeout(() => {
                  navigation.goBack();
                  if (wifiEnableResolveRef.current) {
                    wifiEnableResolveRef.current(false);
                    wifiEnableResolveRef.current = null;
                  }
                }, 100);
              },
            },
          ],
          { cancelable: false },
        );
      }
    } catch (error) {
      Alert.alert(
        'Error',
        'Could not enable Wi-Fi automatically. Please enable it manually in Settings.',
        [
          {
            text: 'Open Settings',
            onPress: () => {
              setTimeout(() => {
                openSettings();
                navigation.goBack();
                if (wifiEnableResolveRef.current) {
                  wifiEnableResolveRef.current(false);
                  wifiEnableResolveRef.current = null;
                }
              }, 100);
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setTimeout(() => {
                navigation.goBack();
                if (wifiEnableResolveRef.current) {
                  wifiEnableResolveRef.current(false);
                  wifiEnableResolveRef.current = null;
                }
              }, 100);
            },
          },
        ],
        { cancelable: false },
      );
    }
  };

  const startRotation = () => {
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 2500,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  };

  // const scanWifiNetworks = async () => {
  //   try {
  //     const wifiEnabled = await WifiManager.isEnabled();
  //     if (!wifiEnabled) {
  //       console.log('WiFi disabled, clearing states');
  //       clearConnectionStates(); // Clear all states if WiFi is off
  //       return;
  //     }

  //     // First check if we're already connected to a WizFi network
  //     const isConnected = await checkCurrentWifiConnection();
  //     if (isConnected) {
  //       return; // Already connected, no need to scan
  //     }

  //     // Force refresh the WiFi list
  //     await WifiManager.reScanAndLoadWifiList();
  //     const wifiList = await WifiManager.loadWifiList();

  //     const parsedList = Array.isArray(wifiList)
  //       ? wifiList
  //       : JSON.parse(wifiList);
  //     const filteredList = parsedList.filter(
  //       item => item.SSID && item.SSID.startsWith('WizFi'),
  //     );

  //     setWifiList(filteredList);
  //   } catch (error) {
  //     console.log('WiFi scan error:', error);
  //     // If scan fails, try to get current connection
  //     try {
  //       const currentSSID = await WifiManager.getCurrentWifiSSID();
  //       if (currentSSID && currentSSID.startsWith('WizFi')) {
  //         setConnectedSSID(currentSSID);
  //       } else {
  //         setWifiList([]);
  //       }
  //     } catch (err) {
  //       setWifiList([]);
  //     }
  //   }
  // };

  const scanWifiNetworks = async () => {
    try {
      // Check location permission first
      const hasLocationPermission = await requestLocationPermission();
      if (!hasLocationPermission) {
        console.log('Location permission not granted, cannot scan WiFi');
        setWifiList([]);
        return;
      }

      const wifiEnabled = await WifiManager.isEnabled();
      if (!wifiEnabled) {
        console.log('WiFi disabled, clearing states');
        clearConnectionStates(); // Clear all states if WiFi is off
        return;
      }

      // First check if we're already connected to a WizFi network
      const isConnected = await checkCurrentWifiConnection();
      if (isConnected) {
        return; // Already connected, no need to scan
      }

      // Add a small delay before scanning
      await new Promise(resolve => setTimeout(resolve, 500));

      // Force refresh the WiFi list
      await WifiManager.reScanAndLoadWifiList();

      // Add another small delay after scanning
      await new Promise(resolve => setTimeout(resolve, 1000));

      const wifiList = await WifiManager.loadWifiList();

      const parsedList = Array.isArray(wifiList)
        ? wifiList
        : JSON.parse(wifiList);
      const filteredList = parsedList.filter(
        item => item.SSID && item.SSID.startsWith('WizFi'),
      );

      setWifiList(filteredList);
    } catch (error) {
      console.log('WiFi scan error:', error);

      // If scan fails, try to get current connection as fallback
      try {
        const hasLocationPermission = await requestLocationPermission();
        if (hasLocationPermission) {
          const currentSSID = await WifiManager.getCurrentWifiSSID();
          if (currentSSID && currentSSID.startsWith('WizFi')) {
            setConnectedSSID(currentSSID);
          } else {
            setWifiList([]);
          }
        } else {
          setWifiList([]);
        }
      } catch (err) {
        console.log('Fallback current SSID check also failed:', err);
        setWifiList([]);
      }
    }
  };

  const sendUdpMessage = message => {
    if (!udpSocketRef.current) {
      return;
    }

    const msgBuffer = Buffer.from(message, 'utf8');

    udpSocketRef.current.send(
      msgBuffer,
      0,
      msgBuffer.length,
      TARGET_DEVICE_PORT,
      TARGET_DEVICE_IP,
      err => {
        if (err) {
          // Alert.alert('UDP Send Error', err.message);
        }
      },
    );
  };

  const connectToOpenWifi = async ssid => {
    try {
      await WifiManager.connectToProtectedSSID(ssid, '', false, false);

      setConnectedSSID(ssid);

      NetworkInfo.getIPV4Address().then(ip => {
        setPhoneIP(ip);
      });

      NetworkInfo.getGatewayIPAddress().then(ip => {
        setGatewayIP(ip);
      });

      // sendUdpMessage('Hello WizFi360!');
    } catch (error) {
      Alert.alert(
        'Connection Failed',
        `Could not connect to ${ssid}. Error: ${
          error.message || 'Unknown error'
        }`,
      );
    }
  };

  const connectToWifi = async () => {
    if (!selectedSSID || !password) {
      Alert.alert('Error', 'Please enter a password.');
      return;
    }

    try {
      await WifiManager.connectToProtectedSSID(
        selectedSSID,
        password,
        false,
        false,
      );

      setConnectedSSID(selectedSSID);
      setModalVisible(false);

      NetworkInfo.getIPV4Address().then(ip => {
        setPhoneIP(ip);
      });

      NetworkInfo.getGatewayIPAddress().then(ip => {
        setGatewayIP(ip);
      });

      // sendUdpMessage('Hello WizFi360!');
    } catch (error) {
      Alert.alert(
        'Connection Failed',
        `Could not connect to ${selectedSSID}. Error: ${
          error.message || 'Unknown error'
        }`,
      );
    }
  };

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handleDevicePress = (ssid, capabilities) => {
    setSelectedSSID(ssid);

    const isSecure =
      capabilities &&
      (capabilities.includes('WEP') ||
        capabilities.includes('WPA') ||
        capabilities.includes('WPA2') ||
        capabilities.includes('WPA3'));

    if (isSecure) {
      setPassword('');
      setModalVisible(true);
    } else {
      connectToOpenWifi(ssid);
    }
  };

  // Component to show WiFi state in empty list
  const EmptyListComponent = () => {
    const [wifiEnabled, setWifiEnabled] = useState(true);

    useEffect(() => {
      const checkWifi = async () => {
        try {
          const enabled = await WifiManager.isEnabled();
          setWifiEnabled(enabled);
        } catch (error) {
          setWifiEnabled(false);
        }
      };
      checkWifi();

      // Check WiFi state every 2 seconds when list is empty
      const interval = setInterval(checkWifi, 2000);
      return () => clearInterval(interval);
    }, []);

    return (
      <Text style={styles.emptyListText}>
        {!wifiEnabled
          ? 'WiFi is turned off. Please enable WiFi to search for devices.'
          : connectedSSID
          ? `Connected to ${connectedSSID}`
          : 'No "WizFi" devices found. Pull down to refresh or check if your device is on.'}
      </Text>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.radarContainer}>
        <Animated.Image
          source={require('../../assets/radar_circle.png')}
          style={[styles.radar, { transform: [{ rotate }] }]}
        />
      </View>
      <Text style={styles.status}>Searching for nearby devices...</Text>
      <Text style={styles.subStatus}>
        Please ensure your CPAP device is turned on
      </Text>
      {udpPacketReceived && (
        <Text style={styles.receivedMessage}>
          Received: {udpMessageContent}
        </Text>
      )}
      <FlatList
        data={
          connectedSSID
            ? [{ SSID: connectedSSID, BSSID: 'Connected' }]
            : wifiList
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        keyExtractor={(item, index) => item.BSSID || index.toString()}
        contentContainerStyle={styles.list}
        ListEmptyComponent={EmptyListComponent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.deviceCard}
            onPress={() => handleDevicePress(item.SSID, item.capabilities)}
            disabled={connectedSSID === item.SSID}
          >
            <Image
              source={require('../../assets/CPAP_logo.png')}
              style={styles.deviceIcon}
            />

            <View style={{ flex: 1 }}>
              <Text style={styles.deviceName}>{item.SSID}</Text>
              <Text style={styles.deviceMac}>{item.BSSID}</Text>

              {connectedSSID === item.SSID &&
                (udpMessageContent === expectedHandshake ? (
                  <View style={styles.connectedRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color="#00FF00"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={styles.connectedText}>Connected</Text>
                  </View>
                ) : (
                  <View style={styles.connectedRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color="#FFD700"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={styles.waitingText}>
                      Connected, waiting for handshake...
                    </Text>
                  </View>
                ))}
            </View>

            <Ionicons
              name="wifi"
              size={20}
              color="#fff"
              style={{ marginLeft: 'auto' }}
            />
          </TouchableOpacity>
        )}
      />

      {/* Password Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(false);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Enter Password for {selectedSSID}
            </Text>

            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor="#888"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={connectToWifi}
                style={styles.connectButton}
              >
                <Text style={styles.buttonText}>Connect</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={showSuccess}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowSuccess(false);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Connection Successful</Text>

            <Text style={styles.modalMessage}>
              Connected to CPAP device successfully.
            </Text>

            <TouchableOpacity
              style={[
                styles.connectButton,
                { alignSelf: 'center', marginTop: 20 },
              ]}
              onPress={async () => {
                await AsyncStorage.setItem('isLoggedIn', JSON.stringify(true));
                setShowSuccess(false);

                if (scanIntervalRef.current) {
                  clearInterval(scanIntervalRef.current);
                  scanIntervalRef.current = null;
                }

                if (udpSocketRef.current) {
                  udpSocketRef.current.close();
                  udpSocketRef.current = null;
                }

                navigation.navigate('BottomTab');
              }}
            >
              <Text style={styles.buttonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* WiFi Disconnected Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={wifiDisconnectedModalVisible}
        onRequestClose={handleWifiDisconnectedCancel}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>WiFi Disconnected</Text>

            <Text style={styles.modalMessage}>
              WiFi has been disabled. Please enable WiFi to continue using the
              CPAP device.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={handleWifiDisconnectedCancel}
                style={styles.cancelButton}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleWifiDisconnectedEnable}
                style={styles.connectButton}
              >
                <Text style={styles.buttonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* WiFi Enable Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={wifiEnableModalVisible}
        onRequestClose={handleWifiEnableCancel}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Wi-Fi Required</Text>

            <Text style={styles.modalMessage}>
              Wi-Fi needs to be enabled to scan for CPAP devices. Would you like
              to enable it?
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={handleWifiEnableCancel}
                style={styles.cancelButton}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleWifiEnableConfirm}
                style={styles.connectButton}
              >
                <Text style={styles.buttonText}>Enable Wi-Fi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default WifiConnecting;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1B2430',
    padding: 25,
  },
  radarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    paddingTop: 20,
  },
  radar: {
    width: 212,
    height: 212,
  },
  status: {
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '600',
  },
  subStatus: {
    textAlign: 'center',
    color: '#ccc',
    fontSize: 15,
    marginBottom: 20,
    fontWeight: '600',
  },
  receivedMessage: {
    color: '#fff',
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
  },
  list: {
    paddingBottom: 40,
  },
  emptyListText: {
    color: '#ccc',
    textAlign: 'center',
    marginTop: 50,
    fontSize: 14,
  },
  deviceCard: {
    backgroundColor: '#2B3643',
    padding: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  deviceIcon: {
    width: 36,
    height: 36,
    marginRight: 10,
  },
  deviceName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  deviceMac: {
    color: '#aaa',
    fontSize: 12,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  connectedText: {
    color: '#00FF00',
    fontSize: 13,
  },
  waitingText: {
    color: '#FFD700',
    fontSize: 13,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContent: {
    backgroundColor: '#2B3643',
    padding: 20,
    borderRadius: 10,
    width: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalMessage: {
    color: '#fff',
    fontSize: 15,
    marginTop: 10,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#444',
    borderRadius: 6,
    padding: 10,
    color: '#fff',
    marginBottom: 15,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  cancelButton: {
    marginRight: 10,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  connectButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  buttonText: {
    color: '#00BFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

// import { useEffect, useState, useRef } from 'react';
// import {
//   View,
//   Text,
//   StyleSheet,
//   Image,
//   TouchableOpacity,
//   FlatList,
//   Animated,
//   Easing,
//   Alert,
//   Platform,
//   Modal,
//   TextInput,
//   RefreshControl,
//   Linking,
// } from 'react-native';
// import WifiManager from 'react-native-wifi-reborn';
// import Ionicons from 'react-native-vector-icons/Ionicons';
// import {
//   request,
//   PERMISSIONS,
//   RESULTS,
//   openSettings,
// } from 'react-native-permissions';
// import { useNavigation } from '@react-navigation/native';
// import { NetworkInfo } from 'react-native-network-info';
// import dgram from 'react-native-udp';
// import { Buffer } from 'buffer';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import { appendToDebugFile } from './Login';
// import {
//   getDBConnection,
//   createTables,
//   saveHomeScreenData,
//   saveHomeScreenDataWithDuplicateCheck,
// } from '../database/Database';
// import { parseCpapPacket } from '../utils/Data.js';

// global.Buffer = Buffer;

// const LOCAL_PORT = 5000;
// const TARGET_DEVICE_IP = '192.168.36.7';
// const TARGET_DEVICE_PORT = 5000;
// const expectedHandshake = 'wifi_handshake\r\n';

// let udpBuffer = '';

// const WifiConnecting = () => {
//   const [wifiList, setWifiList] = useState([]);
//   const [selectedSSID, setSelectedSSID] = useState(null);
//   const [password, setPassword] = useState('');
//   const [modalVisible, setModalVisible] = useState(false);
//   const [connectedSSID, setConnectedSSID] = useState(null);
//   const [gatewayIP, setGatewayIP] = useState(null);
//   const rotation = useRef(new Animated.Value(0)).current;
//   const navigation = useNavigation();
//   const [udpMessageContent, setUdpMessageContent] = useState('');
//   const [udpPacketReceived, setUdpPacketReceived] = useState(false);
//   const [phoneIP, setPhoneIP] = useState(null);
//   const udpSocketRef = useRef(null);
//   const scanIntervalRef = useRef(null);
//   const [showSuccess, setShowSuccess] = useState(false);
//   const receivedPackets = useRef([]);
//   const [db, setDb] = useState(null);
//   const [wifiPermissionModalVisible, setWifiPermissionModalVisible] =
//     useState(false);
//   const [refreshing, setRefreshing] = useState(false);

//   // WiFi monitoring states
//   const [isMonitoringWifi, setIsMonitoringWifi] = useState(false);
//   const wifiMonitorIntervalRef = useRef(null);
//   const [wifiEnableModalVisible, setWifiEnableModalVisible] = useState(false);
//   const [wifiDisconnectedModalVisible, setWifiDisconnectedModalVisible] =
//     useState(false);

//   // Store the resolve functions in refs to avoid closure issues
//   const wifiEnableResolveRef = useRef(null);
//   const wifiDisconnectedResolveRef = useRef(null);

//   // Clear all connection-related states
//   const clearConnectionStates = () => {
//     console.log('Clearing connection states...');
//     setConnectedSSID(null);
//     setUdpMessageContent('');
//     setUdpPacketReceived(false);
//     setPhoneIP(null);
//     setGatewayIP(null);
//     setWifiList([]); // Clear the WiFi list
//     setShowSuccess(false); // Clear any success state

//     // Close UDP socket if open
//     if (udpSocketRef.current && !udpSocketRef.current._destroyed) {
//       udpSocketRef.current.close();
//       udpSocketRef.current = null;
//     }
//   };

//   const handleExternalWifiConnection = async ssid => {
//     console.log('Handling external WiFi connection to:', ssid);

//     // Get network info
//     NetworkInfo.getIPV4Address().then(ip => {
//       setPhoneIP(ip);
//     });

//     NetworkInfo.getGatewayIPAddress().then(ip => {
//       setGatewayIP(ip);
//     });

//     // Send the initial UDP message
//     setTimeout(() => {
//       sendUdpMessage('Hello WizFi360!');
//     }, 2000); // Add delay to ensure network is fully established
//   };

//   const startWifiMonitoring = () => {
//     if (isMonitoringWifi) {
//       console.log('WiFi monitoring already running');
//       return;
//     }

//     console.log('Starting WiFi monitoring...');
//     setIsMonitoringWifi(true);
//     let lastWifiState = true;
//     let lastConnectedSSID = connectedSSID; // Track the last known connected SSID

//     wifiMonitorIntervalRef.current = setInterval(async () => {
//       try {
//         const wifiEnabled = await WifiManager.isEnabled();

//         // WiFi was just turned off
//         if (lastWifiState && !wifiEnabled) {
//           console.log('WiFi turned off, clearing states and showing modal');
//           clearConnectionStates();

//           // Stop current monitoring to prevent multiple modals
//           setIsMonitoringWifi(false);
//           if (wifiMonitorIntervalRef.current) {
//             clearInterval(wifiMonitorIntervalRef.current);
//             wifiMonitorIntervalRef.current = null;
//           }

//           // Show disconnect modal immediately with proper resolve function
//           wifiDisconnectedResolveRef.current = shouldReconnect => {
//             console.log(
//               'WiFi disconnected resolve called with:',
//               shouldReconnect,
//             );
//             if (shouldReconnect) {
//               handleWifiPermissionAndState().then(wifiHandled => {
//                 if (wifiHandled) {
//                   startRotation();
//                   scanWifiNetworks();
//                   scanIntervalRef.current = setInterval(scanWifiNetworks, 5000);
//                   startWifiMonitoring();
//                 }
//               });
//             } else {
//               navigation.goBack();
//             }
//           };
//           setWifiDisconnectedModalVisible(true);

//           lastWifiState = wifiEnabled;
//           lastConnectedSSID = null; // Reset the last connected SSID
//           return; // Exit early to prevent further processing
//         }

//         lastWifiState = wifiEnabled;

//         if (!wifiEnabled) return;

//         // Rest of monitoring logic for when WiFi is enabled
//         const currentSSID = await WifiManager.getCurrentWifiSSID().catch(
//           () => null,
//         );

//         if (currentSSID && currentSSID.startsWith('WizFi')) {
//           // Check if this is a new connection
//           if (currentSSID !== lastConnectedSSID) {
//             console.log('New WizFi connection detected:', currentSSID);
//             setConnectedSSID(currentSSID);

//             // Handle as external connection (send UDP message)
//             await handleExternalWifiConnection(currentSSID);

//             lastConnectedSSID = currentSSID;
//           } else if (!connectedSSID) {
//             // This handles the case where the component state was cleared but we're still connected
//             console.log('Reconnecting to existing WizFi network:', currentSSID);
//             setConnectedSSID(currentSSID);

//             // Get network info
//             NetworkInfo.getIPV4Address().then(ip => {
//               setPhoneIP(ip);
//             });

//             NetworkInfo.getGatewayIPAddress().then(ip => {
//               setGatewayIP(ip);
//             });

//             lastConnectedSSID = currentSSID;
//           }
//         } else if (connectedSSID || lastConnectedSSID) {
//           console.log('Lost connection to WizFi network');
//           clearConnectionStates();
//           lastConnectedSSID = null;
//         }
//       } catch (error) {
//         console.log('WiFi monitoring error:', error);
//       }
//     }, 1000); // Check every second for faster response
//   };

//   const stopWifiMonitoring = () => {
//     console.log('Stopping WiFi monitoring...');
//     setIsMonitoringWifi(false);
//     if (wifiMonitorIntervalRef.current) {
//       clearInterval(wifiMonitorIntervalRef.current);
//       wifiMonitorIntervalRef.current = null;
//     }
//   };

//   const checkCurrentWifiConnection = async () => {
//     try {
//       // Get currently connected WiFi SSID
//       let currentSSID;
//       try {
//         currentSSID = await WifiManager.getCurrentWifiSSID();
//       } catch (error) {
//         // On some Android devices, we need to load the wifi list first
//         await WifiManager.loadWifiList();
//         currentSSID = await WifiManager.getCurrentWifiSSID();
//       }

//       if (currentSSID && currentSSID.startsWith('WizFi')) {
//         const wasAlreadyConnected = connectedSSID === currentSSID;
//         setConnectedSSID(currentSSID);

//         // If this is a new connection (not already connected), handle it as external
//         if (!wasAlreadyConnected) {
//           await handleExternalWifiConnection(currentSSID);
//         } else {
//           // Already connected, just update network info
//           NetworkInfo.getIPV4Address().then(ip => {
//             setPhoneIP(ip);
//           });

//           NetworkInfo.getGatewayIPAddress().then(ip => {
//             setGatewayIP(ip);
//           });
//         }

//         return true;
//       }
//     } catch (error) {
//       console.log('Could not get current WiFi status:', error);
//     }
//     return false;
//   };

//   // Database initialization useEffect
//   useEffect(() => {
//     (async () => {
//       try {
//         const connection = await getDBConnection();
//         await createTables(connection);
//         setDb(connection);
//       } catch (error) {
//         Alert.alert('Database Error', 'Could not initialize the database.');
//         await appendToDebugFile(`DB INIT ERROR: ${error.message}`);
//       }
//     })();
//   }, []);

//   // Main initialization useEffect
//   useEffect(() => {
//     const init = async () => {
//       // First check if we're already connected to a WizFi network
//       const isAlreadyConnected = await checkCurrentWifiConnection();

//       if (isAlreadyConnected) {
//         // If already connected to WizFi, start monitoring but don't scan
//         startWifiMonitoring();
//         return;
//       }

//       // Check location permission
//       const hasLocationPermission = await requestLocationPermission();
//       if (!hasLocationPermission) {
//         Alert.alert(
//           'Permission Required',
//           'Location permission is required to scan for Wi-Fi networks. Please enable it in settings.',
//           [
//             {
//               text: 'Cancel',
//               style: 'cancel',
//               onPress: () => navigation.goBack(),
//             },
//             { text: 'Open Settings', onPress: () => openSettings() },
//           ],
//         );
//         return;
//       }

//       // Then check and handle Wi-Fi
//       const wifiHandled = await handleWifiPermissionAndState();
//       if (!wifiHandled) {
//         return;
//       }

//       // If both permissions are good, start scanning
//       startRotation();
//       scanWifiNetworks();

//       scanIntervalRef.current = setInterval(() => {
//         scanWifiNetworks();
//       }, 5000);

//       // Start WiFi monitoring
//       startWifiMonitoring();
//     };

//     init();

//     return () => {
//       if (scanIntervalRef.current) {
//         clearInterval(scanIntervalRef.current);
//         scanIntervalRef.current = null;
//       }
//       stopWifiMonitoring();
//     };
//   }, []);

//   // UDP socket setup useEffect
//   useEffect(() => {
//     if (!db || !phoneIP) {
//       return;
//     }

//     const socket = dgram.createSocket('udp4');
//     udpSocketRef.current = socket;

//     socket.bind(LOCAL_PORT, phoneIP, () => {
//       // console.log('scwdnwdvjwndv');
//     });

//     socket.on('message', async (msg, rinfo) => {
//       const message = Buffer.from(msg).toString('utf8');
//       console.log('message', message);

//       await appendToDebugFile(`RX: ${message}`);

//       setUdpPacketReceived(true);

//       if (message === expectedHandshake) {
//         setUdpMessageContent(message);

//         const ackMessage = 'app_ok\r\n';
//         const ackBuffer = Buffer.from(ackMessage, 'utf8');

//         socket.send(
//           ackBuffer,
//           0,
//           ackBuffer.length,
//           rinfo.port,
//           rinfo.address,
//           err => {},
//         );

//         await appendToDebugFile(`TX: ${ackMessage}`);
//       } else {
//         const receivedHex = msg.toString('hex');
//         udpBuffer += receivedHex;
//         await appendToDebugFile(`RX: ${receivedHex}`);

//         let startIndex = udpBuffer.indexOf('24');
//         let endIndex = udpBuffer.indexOf('0a', startIndex);

//         while (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
//           const potentialPacketHex = udpBuffer.substring(
//             startIndex,
//             startIndex + 70,
//           );

//           if (potentialPacketHex.length === 70) {
//             try {
//               const decoded = parseCpapPacket(potentialPacketHex);

//               if (db) {
//                 try {
//                   const result = await saveHomeScreenDataWithDuplicateCheck(
//                     db,
//                     decoded,
//                   );
//                   if (result.success) {
//                     receivedPackets.current.push(decoded);
//                   } else if (result.reason === 'duplicate') {
//                     // console.log('Duplicate packet detected, not saving');
//                   } else {
//                     await appendToDebugFile(`SAVE ERROR: ${result.error}`);
//                   }
//                 } catch (e) {
//                   await appendToDebugFile(`DB SAVE ERROR: ${e.message}`);
//                 }
//               }

//               udpBuffer = udpBuffer.substring(startIndex + 70);
//               startIndex = udpBuffer.indexOf('24');
//               endIndex = udpBuffer.indexOf('0a', startIndex);
//             } catch (e) {
//               udpBuffer = udpBuffer.substring(startIndex + 2);
//               startIndex = udpBuffer.indexOf('24');
//               endIndex = udpBuffer.indexOf('0a', startIndex);
//             }
//           } else {
//             break;
//           }
//         }
//       }
//     });

//     socket.on('error', err => {
//       console.log('error');
//     });
//     socket.on('close', () => {
//       console.log('close');
//     });

//     return () => {
//       if (socket && !socket._destroyed) {
//         socket.close();
//       }
//     };
//   }, [phoneIP]);

//   // Success modal trigger useEffect
//   useEffect(() => {
//     if (udpMessageContent === expectedHandshake) {
//       setShowSuccess(true);
//     }
//   }, [udpMessageContent]);

//   const requestLocationPermission = async () => {
//     if (Platform.OS === 'android') {
//       const result = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
//       return result === RESULTS.GRANTED;
//     } else if (Platform.OS === 'ios') {
//       const result = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
//       return result === RESULTS.GRANTED;
//     }
//     return false;
//   };

//   const onRefresh = async () => {
//     setRefreshing(true);
//     const wifiEnabled = await WifiManager.isEnabled();
//     if (!wifiEnabled) {
//       clearConnectionStates();
//     } else {
//       await scanWifiNetworks();
//     }
//     setRefreshing(false);
//   };

//   const handleWifiPermissionAndState = async () => {
//     try {
//       // Check if Wi-Fi is enabled
//       const wifiEnabled = await WifiManager.isEnabled();

//       if (!wifiEnabled) {
//         // Show custom modal to ask user to enable Wi-Fi
//         return new Promise(resolve => {
//           wifiEnableResolveRef.current = resolve;
//           setWifiEnableModalVisible(true);
//         });
//       }

//       return true; // Wi-Fi is already enabled
//     } catch (error) {
//       Alert.alert(
//         'Wi-Fi Error',
//         'Could not check Wi-Fi status. Please ensure Wi-Fi is enabled.',
//         [
//           {
//             text: 'OK',
//             onPress: () => navigation.goBack(),
//           },
//         ],
//         { cancelable: false },
//       );
//       return false;
//     }
//   };

//   const handleWifiDisconnectedCancel = () => {
//     console.log('WiFi disconnected modal cancelled');
//     setWifiDisconnectedModalVisible(false);
//     if (wifiDisconnectedResolveRef.current) {
//       wifiDisconnectedResolveRef.current(false);
//       wifiDisconnectedResolveRef.current = null;
//     }
//   };

//   const handleWifiDisconnectedEnable = async () => {
//     console.log('WiFi disconnected modal - enable clicked');
//     setWifiDisconnectedModalVisible(false);

//     // Immediately show WiFi enable modal
//     const wifiHandled = await new Promise(resolve => {
//       wifiEnableResolveRef.current = resolve;
//       setWifiEnableModalVisible(true);
//     });

//     if (wifiHandled) {
//       // Restart the scanning process
//       startRotation();
//       scanWifiNetworks();

//       // Restart scanning interval
//       if (scanIntervalRef.current) {
//         clearInterval(scanIntervalRef.current);
//       }
//       scanIntervalRef.current = setInterval(() => {
//         scanWifiNetworks();
//       }, 5000);

//       // Resume WiFi monitoring
//       startWifiMonitoring();
//     } else {
//       navigation.goBack();
//     }

//     // Call the original resolve function
//     if (wifiDisconnectedResolveRef.current) {
//       wifiDisconnectedResolveRef.current(wifiHandled);
//       wifiDisconnectedResolveRef.current = null;
//     }
//   };

//   const handleWifiEnableCancel = () => {
//     console.log('WiFi enable modal cancelled');
//     setWifiEnableModalVisible(false);
//     navigation.goBack();
//     if (wifiEnableResolveRef.current) {
//       wifiEnableResolveRef.current(false);
//       wifiEnableResolveRef.current = null;
//     }
//   };

//   const handleWifiEnableConfirm = async () => {
//     console.log('WiFi enable modal confirmed');
//     setWifiEnableModalVisible(false);

//     try {
//       // For Android, we can try to enable Wi-Fi programmatically
//       if (Platform.OS === 'android') {
//         await WifiManager.setEnabled(true);

//         // Wait for Wi-Fi to actually be enabled
//         let attempts = 0;
//         const maxAttempts = 10; // Wait up to 5 seconds (10 * 500ms)

//         while (attempts < maxAttempts) {
//           await new Promise(resolveDelay => setTimeout(resolveDelay, 500)); // Wait 500ms
//           const isNowEnabled = await WifiManager.isEnabled();

//           if (isNowEnabled) {
//             // Add a delay before proceeding!
//             setTimeout(() => {
//               if (wifiEnableResolveRef.current) {
//                 wifiEnableResolveRef.current(true);
//                 wifiEnableResolveRef.current = null;
//               }
//             }, 2000);
//             return;
//           }

//           attempts++;
//         }

//         // If Wi-Fi didn't enable after waiting, show error
//         Alert.alert(
//           'Wi-Fi Enable Failed',
//           'Wi-Fi could not be enabled automatically. Please enable it manually in Settings.',
//           [
//             {
//               text: 'Open Settings',
//               onPress: () => {
//                 setTimeout(() => {
//                   openSettings();
//                   navigation.goBack();
//                   if (wifiEnableResolveRef.current) {
//                     wifiEnableResolveRef.current(false);
//                     wifiEnableResolveRef.current = null;
//                   }
//                 }, 100);
//               },
//             },
//             {
//               text: 'Cancel',
//               style: 'cancel',
//               onPress: () => {
//                 setTimeout(() => {
//                   navigation.goBack();
//                   if (wifiEnableResolveRef.current) {
//                     wifiEnableResolveRef.current(false);
//                     wifiEnableResolveRef.current = null;
//                   }
//                 }, 100);
//               },
//             },
//           ],
//           { cancelable: false },
//         );
//       } else {
//         // For iOS, redirect to settings
//         Alert.alert(
//           'Enable Wi-Fi',
//           'Please enable Wi-Fi in Settings and return to the app.',
//           [
//             {
//               text: 'Open Settings',
//               onPress: () => {
//                 setTimeout(() => {
//                   Linking.openURL('App-Prefs:WIFI');
//                   navigation.goBack();
//                   if (wifiEnableResolveRef.current) {
//                     wifiEnableResolveRef.current(false);
//                     wifiEnableResolveRef.current = null;
//                   }
//                 }, 100);
//               },
//             },
//             {
//               text: 'Cancel',
//               style: 'cancel',
//               onPress: () => {
//                 setTimeout(() => {
//                   navigation.goBack();
//                   if (wifiEnableResolveRef.current) {
//                     wifiEnableResolveRef.current(false);
//                     wifiEnableResolveRef.current = null;
//                   }
//                 }, 100);
//               },
//             },
//           ],
//           { cancelable: false },
//         );
//       }
//     } catch (error) {
//       Alert.alert(
//         'Error',
//         'Could not enable Wi-Fi automatically. Please enable it manually in Settings.',
//         [
//           {
//             text: 'Open Settings',
//             onPress: () => {
//               setTimeout(() => {
//                 openSettings();
//                 navigation.goBack();
//                 if (wifiEnableResolveRef.current) {
//                   wifiEnableResolveRef.current(false);
//                   wifiEnableResolveRef.current = null;
//                 }
//               }, 100);
//             },
//           },
//           {
//             text: 'Cancel',
//             style: 'cancel',
//             onPress: () => {
//               setTimeout(() => {
//                 navigation.goBack();
//                 if (wifiEnableResolveRef.current) {
//                   wifiEnableResolveRef.current(false);
//                   wifiEnableResolveRef.current = null;
//                 }
//               }, 100);
//             },
//           },
//         ],
//         { cancelable: false },
//       );
//     }
//   };

//   const startRotation = () => {
//     Animated.loop(
//       Animated.timing(rotation, {
//         toValue: 1,
//         duration: 2500,
//         easing: Easing.linear,
//         useNativeDriver: true,
//       }),
//     ).start();
//   };

//   const scanWifiNetworks = async () => {
//     try {
//       const wifiEnabled = await WifiManager.isEnabled();
//       if (!wifiEnabled) {
//         console.log('WiFi disabled, clearing states');
//         clearConnectionStates(); // Clear all states if WiFi is off
//         return;
//       }

//       // First check if we're already connected to a WizFi network
//       const isConnected = await checkCurrentWifiConnection();
//       if (isConnected) {
//         return; // Already connected, no need to scan
//       }

//       // Force refresh the WiFi list
//       await WifiManager.reScanAndLoadWifiList();
//       const wifiList = await WifiManager.loadWifiList();

//       const parsedList = Array.isArray(wifiList)
//         ? wifiList
//         : JSON.parse(wifiList);
//       const filteredList = parsedList.filter(
//         item => item.SSID && item.SSID.startsWith('WizFi'),
//       );

//       setWifiList(filteredList);
//     } catch (error) {
//       console.log('WiFi scan error:', error);
//       // If scan fails, try to get current connection
//       try {
//         const currentSSID = await WifiManager.getCurrentWifiSSID();
//         if (currentSSID && currentSSID.startsWith('WizFi')) {
//           setConnectedSSID(currentSSID);
//         } else {
//           setWifiList([]);
//         }
//       } catch (err) {
//         setWifiList([]);
//       }
//     }
//   };

//   const sendUdpMessage = (message = 'Hello WizFi360_66160F!') => {
//     if (!udpSocketRef.current) {
//       return;
//     }

//     const msgBuffer = Buffer.from(message, 'utf8');

//     udpSocketRef.current.send(
//       msgBuffer,
//       0,
//       msgBuffer.length,
//       TARGET_DEVICE_PORT,
//       TARGET_DEVICE_IP,
//       err => {
//         if (err) {
//           // Alert.alert('UDP Send Error', err.message);
//         }
//       },
//     );
//   };

//   const connectToOpenWifi = async ssid => {
//     try {
//       await WifiManager.connectToProtectedSSID(ssid, '', false, false);

//       setConnectedSSID(ssid);

//       NetworkInfo.getIPV4Address().then(ip => {
//         setPhoneIP(ip);
//       });

//       NetworkInfo.getGatewayIPAddress().then(ip => {
//         setGatewayIP(ip);
//       });

//       sendUdpMessage('Hello WizFi360!');
//     } catch (error) {
//       Alert.alert(
//         'Connection Failed',
//         `Could not connect to ${ssid}. Error: ${
//           error.message || 'Unknown error'
//         }`,
//       );
//     }
//   };

//   const connectToWifi = async () => {
//     if (!selectedSSID || !password) {
//       Alert.alert('Error', 'Please enter a password.');
//       return;
//     }

//     try {
//       await WifiManager.connectToProtectedSSID(
//         selectedSSID,
//         password,
//         false,
//         false,
//       );

//       setConnectedSSID(selectedSSID);
//       setModalVisible(false);

//       NetworkInfo.getIPV4Address().then(ip => {
//         setPhoneIP(ip);
//       });

//       NetworkInfo.getGatewayIPAddress().then(ip => {
//         setGatewayIP(ip);
//       });

//       sendUdpMessage('Hello WizFi360!');
//     } catch (error) {
//       Alert.alert(
//         'Connection Failed',
//         `Could not connect to ${selectedSSID}. Error: ${
//           error.message || 'Unknown error'
//         }`,
//       );
//     }
//   };

//   const rotate = rotation.interpolate({
//     inputRange: [0, 1],
//     outputRange: ['0deg', '360deg'],
//   });

//   const handleDevicePress = (ssid, capabilities) => {
//     setSelectedSSID(ssid);

//     const isSecure =
//       capabilities &&
//       (capabilities.includes('WEP') ||
//         capabilities.includes('WPA') ||
//         capabilities.includes('WPA2') ||
//         capabilities.includes('WPA3'));

//     if (isSecure) {
//       setPassword('');
//       setModalVisible(true);
//     } else {
//       connectToOpenWifi(ssid);
//     }
//   };

//   // Component to show WiFi state in empty list
//   const EmptyListComponent = () => {
//     const [wifiEnabled, setWifiEnabled] = useState(true);

//     useEffect(() => {
//       const checkWifi = async () => {
//         try {
//           const enabled = await WifiManager.isEnabled();
//           setWifiEnabled(enabled);
//         } catch (error) {
//           setWifiEnabled(false);
//         }
//       };
//       checkWifi();

//       // Check WiFi state every 2 seconds when list is empty
//       const interval = setInterval(checkWifi, 2000);
//       return () => clearInterval(interval);
//     }, []);

//     return (
//       <Text style={styles.emptyListText}>
//         {!wifiEnabled
//           ? 'WiFi is turned off. Please enable WiFi to search for devices.'
//           : connectedSSID
//           ? `Connected to ${connectedSSID}`
//           : 'No "WizFi" devices found. Pull down to refresh or check if your device is on.'}
//       </Text>
//     );
//   };

//   return (
//     <View style={styles.container}>
//       <View style={styles.radarContainer}>
//         <Animated.Image
//           source={require('../../assets/radar_circle.png')}
//           style={[styles.radar, { transform: [{ rotate }] }]}
//         />
//       </View>
//       <Text style={styles.status}>Searching for nearby devices...</Text>
//       <Text style={styles.subStatus}>
//         Please ensure your CPAP device is turned on
//       </Text>
//       {udpPacketReceived && (
//         <Text style={styles.receivedMessage}>
//           Received: {udpMessageContent}
//         </Text>
//       )}
//       <FlatList
//         data={
//           connectedSSID
//             ? [{ SSID: connectedSSID, BSSID: 'Connected' }]
//             : wifiList
//         }
//         refreshControl={
//           <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
//         }
//         keyExtractor={(item, index) => item.BSSID || index.toString()}
//         contentContainerStyle={styles.list}
//         ListEmptyComponent={EmptyListComponent}
//         renderItem={({ item }) => (
//           <TouchableOpacity
//             style={styles.deviceCard}
//             onPress={() => handleDevicePress(item.SSID, item.capabilities)}
//             disabled={connectedSSID === item.SSID}
//           >
//             <Image
//               source={require('../../assets/CPAP_logo.png')}
//               style={styles.deviceIcon}
//             />

//             <View style={{ flex: 1 }}>
//               <Text style={styles.deviceName}>{item.SSID}</Text>
//               <Text style={styles.deviceMac}>{item.BSSID}</Text>

//               {connectedSSID === item.SSID &&
//                 (udpMessageContent === expectedHandshake ? (
//                   <View style={styles.connectedRow}>
//                     <Ionicons
//                       name="checkmark-circle"
//                       size={16}
//                       color="#00FF00"
//                       style={{ marginRight: 4 }}
//                     />
//                     <Text style={styles.connectedText}>Connected</Text>
//                   </View>
//                 ) : (
//                   <View style={styles.connectedRow}>
//                     <Ionicons
//                       name="checkmark-circle"
//                       size={16}
//                       color="#FFD700"
//                       style={{ marginRight: 4 }}
//                     />
//                     <Text style={styles.waitingText}>
//                       Connected, waiting for handshake...
//                     </Text>
//                   </View>
//                 ))}
//             </View>

//             <Ionicons
//               name="wifi"
//               size={20}
//               color="#fff"
//               style={{ marginLeft: 'auto' }}
//             />
//           </TouchableOpacity>
//         )}
//       />

//       {/* Password Modal */}
//       <Modal
//         animationType="slide"
//         transparent={true}
//         visible={modalVisible}
//         onRequestClose={() => {
//           setModalVisible(false);
//         }}
//       >
//         <View style={styles.modalContainer}>
//           <View style={styles.modalContent}>
//             <Text style={styles.modalTitle}>
//               Enter Password for {selectedSSID}
//             </Text>

//             <TextInput
//               style={styles.input}
//               value={password}
//               onChangeText={setPassword}
//               secureTextEntry
//               placeholder="Password"
//               placeholderTextColor="#888"
//               autoCapitalize="none"
//               autoCorrect={false}
//             />

//             <View style={styles.modalButtons}>
//               <TouchableOpacity
//                 onPress={connectToWifi}
//                 style={styles.connectButton}
//               >
//                 <Text style={styles.buttonText}>Connect</Text>
//               </TouchableOpacity>
//             </View>
//           </View>
//         </View>
//       </Modal>

//       {/* Success Modal */}
//       <Modal
//         visible={showSuccess}
//         transparent={true}
//         animationType="fade"
//         onRequestClose={() => {
//           setShowSuccess(false);
//         }}
//       >
//         <View style={styles.modalContainer}>
//           <View style={styles.modalContent}>
//             <Text style={styles.modalTitle}>Connection Successful</Text>

//             <Text style={styles.modalMessage}>
//               Connected to CPAP device successfully.
//             </Text>

//             <TouchableOpacity
//               style={[
//                 styles.connectButton,
//                 { alignSelf: 'center', marginTop: 20 },
//               ]}
//               onPress={async () => {
//                 await AsyncStorage.setItem('isLoggedIn', JSON.stringify(true));
//                 setShowSuccess(false);

//                 if (scanIntervalRef.current) {
//                   clearInterval(scanIntervalRef.current);
//                   scanIntervalRef.current = null;
//                 }

//                 if (udpSocketRef.current) {
//                   udpSocketRef.current.close();
//                   udpSocketRef.current = null;
//                 }

//                 navigation.navigate('BottomTab');
//               }}
//             >
//               <Text style={styles.buttonText}>OK</Text>
//             </TouchableOpacity>
//           </View>
//         </View>
//       </Modal>

//       {/* WiFi Disconnected Modal */}
//       <Modal
//         animationType="slide"
//         transparent={true}
//         visible={wifiDisconnectedModalVisible}
//         onRequestClose={handleWifiDisconnectedCancel}
//       >
//         <View style={styles.modalContainer}>
//           <View style={styles.modalContent}>
//             <Text style={styles.modalTitle}>WiFi Disconnected</Text>

//             <Text style={styles.modalMessage}>
//               WiFi has been disabled. Please enable WiFi to continue using the
//               CPAP device.
//             </Text>

//             <View style={styles.modalButtons}>
//               <TouchableOpacity
//                 onPress={handleWifiDisconnectedCancel}
//                 style={styles.cancelButton}
//               >
//                 <Text style={styles.buttonText}>Cancel</Text>
//               </TouchableOpacity>

//               <TouchableOpacity
//                 onPress={handleWifiDisconnectedEnable}
//                 style={styles.connectButton}
//               >
//                 <Text style={styles.buttonText}>OK</Text>
//               </TouchableOpacity>
//             </View>
//           </View>
//         </View>
//       </Modal>

//       {/* WiFi Enable Modal */}
//       <Modal
//         animationType="slide"
//         transparent={true}
//         visible={wifiEnableModalVisible}
//         onRequestClose={handleWifiEnableCancel}
//       >
//         <View style={styles.modalContainer}>
//           <View style={styles.modalContent}>
//             <Text style={styles.modalTitle}>Wi-Fi Required</Text>

//             <Text style={styles.modalMessage}>
//               Wi-Fi needs to be enabled to scan for CPAP devices. Would you like
//               to enable it?
//             </Text>

//             <View style={styles.modalButtons}>
//               <TouchableOpacity
//                 onPress={handleWifiEnableCancel}
//                 style={styles.cancelButton}
//               >
//                 <Text style={styles.buttonText}>Cancel</Text>
//               </TouchableOpacity>

//               <TouchableOpacity
//                 onPress={handleWifiEnableConfirm}
//                 style={styles.connectButton}
//               >
//                 <Text style={styles.buttonText}>Enable Wi-Fi</Text>
//               </TouchableOpacity>
//             </View>
//           </View>
//         </View>
//       </Modal>
//     </View>
//   );
// };

// export default WifiConnecting;

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: '#1B2430',
//     padding: 25,
//   },
//   radarContainer: {
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginBottom: 30,
//     paddingTop: 20,
//   },
//   radar: {
//     width: 212,
//     height: 212,
//   },
//   status: {
//     textAlign: 'center',
//     color: '#fff',
//     fontSize: 16,
//     marginBottom: 8,
//     fontWeight: '600',
//   },
//   subStatus: {
//     textAlign: 'center',
//     color: '#ccc',
//     fontSize: 15,
//     marginBottom: 20,
//     fontWeight: '600',
//   },
//   receivedMessage: {
//     color: '#fff',
//     fontSize: 14,
//     marginTop: 10,
//     textAlign: 'center',
//   },
//   list: {
//     paddingBottom: 40,
//   },
//   emptyListText: {
//     color: '#ccc',
//     textAlign: 'center',
//     marginTop: 50,
//     fontSize: 14,
//   },
//   deviceCard: {
//     backgroundColor: '#2B3643',
//     padding: 14,
//     borderRadius: 10,
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginBottom: 12,
//   },
//   deviceIcon: {
//     width: 36,
//     height: 36,
//     marginRight: 10,
//   },
//   deviceName: {
//     color: '#fff',
//     fontSize: 14,
//     fontWeight: 'bold',
//   },
//   deviceMac: {
//     color: '#aaa',
//     fontSize: 12,
//   },
//   connectedRow: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginTop: 4,
//   },
//   connectedText: {
//     color: '#00FF00',
//     fontSize: 13,
//   },
//   waitingText: {
//     color: '#FFD700',
//     fontSize: 13,
//   },
//   modalContainer: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//     backgroundColor: 'rgba(0,0,0,0.6)',
//   },
//   modalContent: {
//     backgroundColor: '#2B3643',
//     padding: 20,
//     borderRadius: 10,
//     width: '80%',
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.25,
//     shadowRadius: 3.84,
//     elevation: 5,
//   },
//   modalTitle: {
//     color: '#fff',
//     fontSize: 16,
//     marginBottom: 10,
//     fontWeight: 'bold',
//     textAlign: 'center',
//   },
//   modalMessage: {
//     color: '#fff',
//     fontSize: 15,
//     marginTop: 10,
//     textAlign: 'center',
//   },
//   input: {
//     backgroundColor: '#444',
//     borderRadius: 6,
//     padding: 10,
//     color: '#fff',
//     marginBottom: 15,
//     fontSize: 16,
//   },
//   modalButtons: {
//     flexDirection: 'row',
//     justifyContent: 'flex-end',
//     marginTop: 10,
//   },
//   cancelButton: {
//     marginRight: 10,
//     paddingVertical: 8,
//     paddingHorizontal: 15,
//     borderRadius: 5,
//   },
//   connectButton: {
//     paddingVertical: 8,
//     paddingHorizontal: 15,
//     borderRadius: 5,
//   },
//   buttonText: {
//     color: '#00BFFF',
//     fontSize: 16,
//     fontWeight: 'bold',
//   },
// });
