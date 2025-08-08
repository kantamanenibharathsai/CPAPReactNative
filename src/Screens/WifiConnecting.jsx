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
  AppState,
} from 'react-native';
import WifiManager from 'react-native-wifi-reborn';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  request,
  PERMISSIONS,
  check,
  RESULTS,
  openSettings,
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
  const [refreshing, setRefreshing] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [isReturningFromSettings, setIsReturningFromSettings] = useState(false);
  const [isMonitoringWifi, setIsMonitoringWifi] = useState(false);
  const wifiMonitorIntervalRef = useRef(null);
  const [wifiEnableModalVisible, setWifiEnableModalVisible] = useState(false);
  const [wifiDisconnectedModalVisible, setWifiDisconnectedModalVisible] =
    useState(false);
  const wifiEnableResolveRef = useRef(null);
  const wifiDisconnectedResolveRef = useRef(null);

  const clearConnectionStates = () => {
    setConnectedSSID(null);
    setUdpMessageContent('');
    setUdpPacketReceived(false);
    setPhoneIP(null);
    setGatewayIP(null);
    setWifiList([]);
    setShowSuccess(false);

    if (udpSocketRef.current && !udpSocketRef.current._destroyed) {
      udpSocketRef.current.close();
      udpSocketRef.current = null;
    }
  };

  const handleExternalWifiConnection = async ssid => {
    NetworkInfo.getIPV4Address().then(ip => {
      setPhoneIP(ip);
    });
    NetworkInfo.getGatewayIPAddress().then(ip => {
      setGatewayIP(ip);
    });
  };

  const startWifiMonitoring = () => {
    if (isMonitoringWifi) {
      return;
    }
    setIsMonitoringWifi(true);
    let lastWifiState = true;
    let lastConnectedSSID = connectedSSID;
    wifiMonitorIntervalRef.current = setInterval(async () => {
      try {
        const wifiEnabled = await WifiManager.isEnabled();
        if (lastWifiState && !wifiEnabled) {
          clearConnectionStates();
          setIsMonitoringWifi(false);
          if (wifiMonitorIntervalRef.current) {
            clearInterval(wifiMonitorIntervalRef.current);
            wifiMonitorIntervalRef.current = null;
          }
          wifiDisconnectedResolveRef.current = shouldReconnect => {
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
              navigation.navigate('Login');
            }
          };
          setWifiDisconnectedModalVisible(true);

          lastWifiState = wifiEnabled;
          lastConnectedSSID = null;
          return;
        }
        lastWifiState = wifiEnabled;
        if (!wifiEnabled) return;
        const currentSSID = await WifiManager.getCurrentWifiSSID().catch(
          () => null,
        );

        if (currentSSID && currentSSID.startsWith('WizFi')) {
          if (currentSSID !== lastConnectedSSID) {
            setConnectedSSID(currentSSID);
            await handleExternalWifiConnection(currentSSID);
            lastConnectedSSID = currentSSID;
          } else if (!connectedSSID) {
            setConnectedSSID(currentSSID);
            NetworkInfo.getIPV4Address().then(ip => {
              setPhoneIP(ip);
            });
            NetworkInfo.getGatewayIPAddress().then(ip => {
              setGatewayIP(ip);
            });
            lastConnectedSSID = currentSSID;
          }
        } else if (connectedSSID || lastConnectedSSID) {
          clearConnectionStates();
          lastConnectedSSID = null;
        }
      } catch (error) {}
    }, 1000);
  };

  const stopWifiMonitoring = () => {
    setIsMonitoringWifi(false);
    if (wifiMonitorIntervalRef.current) {
      clearInterval(wifiMonitorIntervalRef.current);
      wifiMonitorIntervalRef.current = null;
    }
  };

  const checkCurrentWifiConnection = async () => {
    try {
      let currentSSID;
      try {
        currentSSID = await WifiManager.getCurrentWifiSSID();
      } catch (error) {
        await WifiManager.loadWifiList();
        currentSSID = await WifiManager.getCurrentWifiSSID();
      }

      if (currentSSID && currentSSID.startsWith('WizFi')) {
        const wasAlreadyConnected = connectedSSID === currentSSID;
        setConnectedSSID(currentSSID);
        if (!wasAlreadyConnected) {
          await handleExternalWifiConnection(currentSSID);
        } else {
          NetworkInfo.getIPV4Address().then(ip => {
            setPhoneIP(ip);
          });

          NetworkInfo.getGatewayIPAddress().then(ip => {
            setGatewayIP(ip);
          });
        }

        return true;
      }
    } catch (error) {}
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

  useEffect(() => {
    const init = async () => {
      const isAlreadyConnected = await checkCurrentWifiConnection();
      if (isAlreadyConnected) {
        startWifiMonitoring();
        return;
      }
      const hasLocationPermission = await requestLocationPermission();
      if (!hasLocationPermission) {
        Alert.alert(
          'Permission Required',
          'Location permission is required to scan for Wi-Fi networks. Please enable it in settings.',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => navigation.navigate('Login'),
            },
            {
              text: 'Open Settings',
              onPress: () => {
                setIsReturningFromSettings(true);
                openSettings();
              },
            },
          ],
        );
        return;
      }
      const wifiHandled = await handleWifiPermissionAndState();
      if (!wifiHandled) {
        return;
      }
      startRotation();
      scanWifiNetworks();
      scanIntervalRef.current = setInterval(() => {
        scanWifiNetworks();
      }, 5000);
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
    if (!db || !phoneIP) {
      return;
    }
    const socket = dgram.createSocket('udp4');
    udpSocketRef.current = socket;
    socket.bind(LOCAL_PORT, phoneIP, () => {});
    socket.on('message', async (msg, rinfo) => {
      const message = Buffer.from(msg).toString('utf8');
      // console.log('message', message);
      await appendToDebugFile(`RX: ${message}`);
      setUdpPacketReceived(true);
      if (message === expectedHandshake) {
        setUdpMessageContent(message);
        const ackMessage = 'done\r\n';
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

    socket.on('error', err => {});
    socket.on('close', () => {});

    return () => {
      if (socket && !socket._destroyed) {
        socket.close();
      }
    };
  }, [phoneIP]);

  useEffect(() => {
    if (udpMessageContent === expectedHandshake) {
      setShowSuccess(true);
      const timer = setTimeout(async () => {
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
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [udpMessageContent]);

  useEffect(() => {
    const handleAppStateChange = async nextAppState => {
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        if (isReturningFromSettings) {
          setIsReturningFromSettings(false);
          const hasLocationPermission = await requestLocationPermission();
          if (hasLocationPermission) {
            const wifiHandled = await handleWifiPermissionAndState();
            if (wifiHandled) {
              startRotation();
              scanWifiNetworks();
              scanIntervalRef.current = setInterval(scanWifiNetworks, 5000);
              startWifiMonitoring();
            }
          }
        }
      }
      setAppState(nextAppState);
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => subscription?.remove();
  }, [appState, isReturningFromSettings]);

  const requestLocationPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const currentStatus = await check(
          PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
        );
        if (currentStatus === RESULTS.GRANTED) {
          return true;
        }
        const result = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
        return result === RESULTS.GRANTED;
      } else if (Platform.OS === 'ios') {
        const currentStatus = await check(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
        if (currentStatus === RESULTS.GRANTED) {
          return true;
        }
        const result = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
        return result === RESULTS.GRANTED;
      }
      return false;
    } catch (error) {
      console.error('Error checking/requesting location permission:', error);
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
      const wifiEnabled = await WifiManager.isEnabled();
      if (!wifiEnabled) {
        return new Promise(resolve => {
          wifiEnableResolveRef.current = resolve;
          setWifiEnableModalVisible(true);
        });
      }
      return true;
    } catch (error) {
      Alert.alert(
        'Wi-Fi Error',
        'Could not check Wi-Fi status. Please ensure Wi-Fi is enabled.',
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Login'),
          },
        ],
        { cancelable: false },
      );
      return false;
    }
  };

  const handleWifiDisconnectedCancel = () => {
    setWifiDisconnectedModalVisible(false);
    if (wifiDisconnectedResolveRef.current) {
      wifiDisconnectedResolveRef.current(false);
      wifiDisconnectedResolveRef.current = null;
    }
  };

  const handleWifiDisconnectedEnable = async () => {
    setWifiDisconnectedModalVisible(false);

    const wifiHandled = await new Promise(resolve => {
      wifiEnableResolveRef.current = resolve;
      setWifiEnableModalVisible(true);
    });

    if (wifiHandled) {
      startRotation();
      scanWifiNetworks();
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
      scanIntervalRef.current = setInterval(() => {
        scanWifiNetworks();
      }, 5000);
      startWifiMonitoring();
    } else {
      navigation.navigate('Login');
    }
    if (wifiDisconnectedResolveRef.current) {
      wifiDisconnectedResolveRef.current(wifiHandled);
      wifiDisconnectedResolveRef.current = null;
    }
  };

  const handleWifiEnableCancel = () => {
    setWifiEnableModalVisible(false);
    navigation.navigate('Login');
    if (wifiEnableResolveRef.current) {
      wifiEnableResolveRef.current(false);
      wifiEnableResolveRef.current = null;
    }
  };

  const handleWifiEnableConfirm = async () => {
    setWifiEnableModalVisible(false);

    try {
      if (Platform.OS === 'android') {
        await WifiManager.setEnabled(true);
        let attempts = 0;
        const maxAttempts = 10;
        while (attempts < maxAttempts) {
          await new Promise(resolveDelay => setTimeout(resolveDelay, 500));
          const isNowEnabled = await WifiManager.isEnabled();
          if (isNowEnabled) {
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
                  navigation.navigate('Login');
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
                  navigation.navigate('Login');
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
                navigation.navigate('Login');
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

  const scanWifiNetworks = async () => {
    try {
      const wifiEnabled = await WifiManager.isEnabled();
      if (!wifiEnabled) {
        clearConnectionStates();
        return;
      }
      const isConnected = await checkCurrentWifiConnection();
      if (isConnected) {
        return;
      }
      await WifiManager.reScanAndLoadWifiList();
      const wifiList = await WifiManager.loadWifiList();

      const parsedList = Array.isArray(wifiList)
        ? wifiList
        : JSON.parse(wifiList);
      const filteredList = parsedList.filter(
        item => item.SSID && item.SSID.startsWith('WizFi'),
      );

      setWifiList(filteredList);
    } catch (error) {
      try {
        const currentSSID = await WifiManager.getCurrentWifiSSID();
        if (currentSSID && currentSSID.startsWith('WizFi')) {
          setConnectedSSID(currentSSID);
        } else {
          setWifiList([]);
        }
      } catch (err) {
        setWifiList([]);
      }
    }
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
      {/* <Modal
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
      </Modal> */}
      <Modal
        visible={showSuccess}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowSuccess(false);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { padding: 15 }]}>
            <Ionicons
              name="checkmark-circle"
              size={50}
              color="#00FF00"
              style={{ alignSelf: 'center', marginBottom: 10 }}
            />
            <Text style={styles.modalTitle}>Connection Successful</Text>
            <Text style={styles.modalMessage}>Connected to CPAP device</Text>
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
    padding: 15, // Reduced padding
    borderRadius: 10,
    width: '70%', // Slightly narrower
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    alignItems: 'center', // Center content
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 5, // Reduced margin
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalMessage: {
    color: '#fff',
    fontSize: 14, // Slightly smaller
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
