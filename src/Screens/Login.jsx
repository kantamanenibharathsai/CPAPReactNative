import { useNavigation } from '@react-navigation/native';
import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Image,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import RNFS from 'react-native-fs';
import {
  getDBConnection,
  createTables,
  savePinToDb,
} from '../database/Database';

// --- Log file will be saved in /storage/emulated/0/Android/data/com.cpap_react_native/files/MyAppLogs/<day>-<month>-<year>/CPAP.txt ---
const getDebugFilePath = date => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const directoryPath = `${RNFS.ExternalDirectoryPath}/MyAppLogs/${day}-${month}-${year}`;
  const filePath = `${directoryPath}/CPAP.txt`;
  return { directoryPath, filePath };
};

const initializeDebugFile = async () => {
  const today = new Date();
  const { directoryPath, filePath } = getDebugFilePath(today);

  try {
    const dirExists = await RNFS.exists(directoryPath);
    if (!dirExists) {
      await RNFS.mkdir(directoryPath);
    }
    const fileExists = await RNFS.exists(filePath);
    if (!fileExists) {
      await RNFS.writeFile(filePath, '--- Debug Log Start ---\n', 'utf8');
    }
    return true;
  } catch (error) {
    return false;
  }
};

export const appendToDebugFile = async logMessage => {
  const today = new Date();
  const { filePath } = getDebugFilePath(today);
  const timestamp = new Date().toISOString();
  try {
    const fileExists = await RNFS.exists(filePath);
    if (!fileExists) {
      const initialized = await initializeDebugFile();
      if (!initialized) return;
    }
    await RNFS.appendFile(filePath, `[${timestamp}] ${logMessage}\n`, 'utf8');
  } catch (error) {}
};

const Login = () => {
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const inputRefs = useRef([]);
  const timeoutRef = useRef(null);
  const navigation = useNavigation();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleChange = (text, index) => {
    if (/^\d?$/.test(text)) {
      const newPin = [...pin];
      newPin[index] = text;
      setPin(newPin);

      if (text && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyPress = ({ nativeEvent }, index) => {
    if (nativeEvent.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleModalClose = () => {
    setShowSuccessModal(false);
    navigation.navigate('WifiConnecting');
  };

  const handleErrorModalClose = () => {
    setShowErrorModal(false);
  };

  // const handleSubmit = async () => {
  //   const enteredPin = pin.join('');
  //   // Clear any previous timeout to prevent overlapping actions
  //   if (timeoutRef.current) {
  //     clearTimeout(timeoutRef.current);
  //   }
  //   setIsLoading(true);

  //   if (enteredPin === '123456') {
  //     try {
  //       const db = await getDBConnection();
  //       await createTables(db);
  //       await savePinToDb(db, '123456');
  //       const fileInitialized = await initializeDebugFile();
  //       if (fileInitialized) {
  //         appendToDebugFile(`User successfully logged in. ${enteredPin}`);
  //         setModalMessage('PIN verified successfully!');
  //       } else {
  //         setModalMessage(
  //           'PIN verified and saved, but debug file could not be created or accessed. Please try restarting the app or checking app settings.',
  //         );
  //       }

  //       timeoutRef.current = setTimeout(() => {
  //         setIsLoading(false);
  //         setShowSuccessModal(true);
  //       }, 2000);
  //     } catch (error) {
  //       appendToDebugFile(`Error during login or PIN save: ${error.message}`);
  //       setModalMessage(
  //         'Failed to connect to database or save PIN. Please try again.',
  //       );

  //       timeoutRef.current = setTimeout(() => {
  //         setIsLoading(false);
  //         setShowErrorModal(true);
  //       }, 2000);
  //     }
  //   } else {
  //     appendToDebugFile(`Invalid PIN entered. ${enteredPin}`);
  //     setModalMessage('Invalid PIN. Please try again.');

  //     timeoutRef.current = setTimeout(() => {
  //       setIsLoading(false);
  //       setShowErrorModal(true);
  //       setPin(['', '', '', '', '', '']);
  //       inputRefs.current[0]?.focus();
  //     }, 2000);
  //   }
  // };

  const handleSubmit = async () => {
    const enteredPin = pin.join('');
    // Clear any previous timeout to prevent overlapping actions
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsLoading(true);

    if (enteredPin === '123456') {
      try {
        const db = await getDBConnection();
        await createTables(db);
        await savePinToDb(db, '123456');
        const fileInitialized = await initializeDebugFile();
        if (fileInitialized) {
          appendToDebugFile(`User successfully logged in. ${enteredPin}`);
        } else {
          appendToDebugFile(
            `User successfully logged in, but debug file could not be created or accessed.`,
          );
        }

        // Display the loading indicator for 2 seconds, then navigate
        timeoutRef.current = setTimeout(() => {
          setIsLoading(false);
          navigation.navigate('WifiConnecting');
        }, 1000);
      } catch (error) {
        appendToDebugFile(`Error during login or PIN save: ${error.message}`);
        setModalMessage(
          'Failed to connect to database or save PIN. Please try again.',
        );

        timeoutRef.current = setTimeout(() => {
          setIsLoading(false);
          setShowErrorModal(true);
        }, 1000);
      }
    } else {
      appendToDebugFile(`Invalid PIN entered. ${enteredPin}`);
      setModalMessage('Invalid PIN. Please try again.');

      timeoutRef.current = setTimeout(() => {
        setIsLoading(false);
        setShowErrorModal(true);
        setPin(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }, 2000);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <Image
          source={require('../../assets/CPAP_logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Enter PIN</Text>

        <View style={styles.pinContainer}>
          {pin.map((digit, index) => (
            <TextInput
              key={index}
              ref={ref => (inputRefs.current[index] = ref)}
              style={styles.pinInput}
              keyboardType="numeric"
              maxLength={1}
              value={digit}
              onChangeText={text => handleChange(text, index)}
              onKeyPress={e => handleKeyPress(e, index)}
              secureTextEntry
              autoFocus={index === 0}
            />
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.button,
          pin.join('').length === 6
            ? styles.buttonActive
            : styles.buttonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={pin.join('').length !== 6}
      >
        <Text style={styles.buttonText}>Submit</Text>
      </TouchableOpacity>
      <Modal animationType="fade" transparent={true} visible={isLoading}>
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#7A86E0" />
        </View>
      </Modal>
      <Modal
        animationType="fade"
        transparent={true}
        visible={showSuccessModal}
        onRequestClose={handleModalClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <View style={styles.successIconContainer}>
                <Text style={styles.successIcon}>✓</Text>
              </View>
              <Text style={styles.modalTitle}>Success</Text>
              <Text style={styles.modalMessage}>{modalMessage}</Text>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={handleModalClose}
              >
                <Text style={styles.modalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        transparent={true}
        visible={showErrorModal}
        onRequestClose={handleErrorModalClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <View style={styles.errorIconContainer}>
                <Text style={styles.errorIcon}>!</Text>
              </View>
              <Text style={styles.modalTitle}>Error</Text>
              <Text style={styles.modalMessage}>{modalMessage}</Text>
              <TouchableOpacity
                style={styles.errorModalButton}
                onPress={handleErrorModalClose}
              >
                <Text style={styles.modalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

export default Login;

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#1B2430',
    justifyContent: 'space-between',
    padding: 20,
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  logo: {
    width: 258,
    height: 190,
    marginBottom: 40,
  },
  title: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 20,
  },
  pinContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
    marginBottom: 30,
  },
  pinInput: {
    width: 45,
    height: 48,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    color: '#fff',
    fontSize: 20,
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  buttonActive: {
    backgroundColor: '#7A86E0',
  },
  buttonDisabled: {
    backgroundColor: '#999',
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    maxWidth: 350,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  successIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successIcon: {
    fontSize: 30,
    color: '#fff',
    fontWeight: 'bold',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 25,
  },
  modalButton: {
    backgroundColor: '#7A86E0',
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 25,
    minWidth: 100,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  errorIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#D9534F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 30,
    color: '#fff',
    fontWeight: 'bold',
  },
  errorModalButton: {
    backgroundColor: '#D9534F',
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 25,
    minWidth: 100,
  },
});
