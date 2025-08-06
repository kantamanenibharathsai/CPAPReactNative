import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  Platform,
  Pressable,
  PermissionsAndroid,
  Animated,
  ScrollView,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getDBConnection,
  saveProfile,
  getProfile,
  emailExists,
} from '../database/Database';
import CustomDropdown from '../components/CustomDropdown';

const DEFAULT_USER_EMAIL = 'bharathsaik21@avantel.in';

const EditProfile = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { initialProfileData } = route.params || {};
  const [profileImage, setProfileImage] = useState(
    initialProfileData?.profileImage || null,
  );
  const [firstName, setFirstName] = useState(
    initialProfileData?.firstName || '',
  );
  const [lastName, setLastName] = useState(initialProfileData?.lastName || '');
  const [email, setEmail] = useState(
    initialProfileData?.email || DEFAULT_USER_EMAIL,
  );
  const [originalEmail, setOriginalEmail] = useState(
    initialProfileData?.email || DEFAULT_USER_EMAIL,
  );
  const [dob, setDob] = useState(initialProfileData?.dob || '');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [gender, setGender] = useState(initialProfileData?.gender || null);
  const [genderItems] = useState([
    { label: 'Male', value: 'Male' },
    { label: 'Female', value: 'Female' },
    { label: 'Other', value: 'Other' },
  ]);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];

  const getEditImageSource = imageUri => {
    if (!imageUri) {
      return require('../../assets/images/ProfilePic.jpeg');
    }

    if (
      typeof imageUri === 'string' &&
      (imageUri.startsWith('file://') ||
        imageUri.startsWith('http://') ||
        imageUri.startsWith('https://') ||
        imageUri.startsWith('content://'))
    ) {
      return { uri: imageUri };
    }

    // Fallback to default
    return require('../../assets/Profile_Photo.png');
  };
  useEffect(() => {
    const loadProfileData = async () => {
      try {
        const db = await getDBConnection();
        let currentUserEmail = await AsyncStorage.getItem('userEmail');
        if (!currentUserEmail) {
          currentUserEmail = DEFAULT_USER_EMAIL;
          await AsyncStorage.setItem('userEmail', currentUserEmail);
        }
        setEmail(currentUserEmail);
        setOriginalEmail(currentUserEmail);
        const loadedProfile = await getProfile(db, currentUserEmail);

        if (loadedProfile) {
          setProfileImage(loadedProfile.image_uri || null);
          setFirstName(loadedProfile.first_name || '');
          setLastName(loadedProfile.last_name || '');
          setDob(loadedProfile.dob || '');
          setGender(loadedProfile.gender || null);
        } else {
          setProfileImage(initialProfileData?.profileImage || null);
          setFirstName(initialProfileData?.firstName || '');
          setLastName(initialProfileData?.lastName || '');
          setDob(initialProfileData?.dob || '');
          setGender(initialProfileData?.gender || null);
        }
      } catch (err) {
        Alert.alert('Error', 'Could not load profile data.');
      }
    };

    const unsubscribe = navigation.addListener('focus', loadProfileData);
    loadProfileData();
    return unsubscribe;
  }, [navigation, initialProfileData]);

  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const formatted = selectedDate.toISOString().split('T')[0];
      setDob(formatted);
    }
  };

  const requestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'This app needs access to your camera',
            buttonPositive: 'OK',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        return false;
      }
    }
    return true;
  };

  const handleImagePick = async type => {
    const options = {
      mediaType: 'photo',
      quality: 0.7,
      saveToPhotos: true,
    };
    const callback = response => {
      if (response.didCancel) return;
      if (response.errorCode) {
        Alert.alert('Error', response.errorMessage);
        return;
      }
      if (response.assets && response.assets.length > 0) {
        setProfileImage(response.assets[0].uri);
      }
    };
    if (type === 'camera') {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        Alert.alert('Permission Denied', 'Camera access was not granted');
        return;
      }
      launchCamera(options, callback);
    } else {
      launchImageLibrary(options, callback);
    }
  };

  const handleSubmit = async () => {
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedFirstName) {
      Alert.alert('Validation Error', 'First Name is required.');
      return;
    }
    if (!trimmedLastName) {
      Alert.alert('Validation Error', 'Last Name is required.');
      return;
    }
    if (!trimmedEmail) {
      Alert.alert('Validation Error', 'Email is required.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      Alert.alert('Validation Error', 'Please enter a valid email address.');
      return;
    }
    if (!gender) {
      Alert.alert('Validation Error', 'Please select a gender.');
      return;
    }
    if (!dob) {
      Alert.alert('Validation Error', 'Date of Birth is required.');
      return;
    }

    try {
      const db = await getDBConnection();
      if (trimmedEmail !== originalEmail) {
        const isEmailTaken = await emailExists(db, trimmedEmail);
        if (isEmailTaken) {
          Alert.alert(
            'Validation Error',
            'This email address is already registered. Please use a different one.',
          );
          return;
        }
      }

      const profileDataToSave = {
        email: trimmedEmail,
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        dob: dob,
        gender: gender,
        image_uri: profileImage,
        name: `${trimmedFirstName} ${trimmedLastName}`,
      };

      await saveProfile(db, profileDataToSave, originalEmail);
      await AsyncStorage.setItem(
        'userName',
        `${trimmedFirstName} ${trimmedLastName}`,
      );

      if (trimmedEmail !== originalEmail) {
        await AsyncStorage.setItem('userEmail', trimmedEmail);
      }

      setShowSuccessMessage(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            setShowSuccessMessage(false);
            navigation.goBack();
          });
        }, 1500);
      });
    } catch (error) {
      Alert.alert(
        'Error',
        error.message || 'Failed to save profile data. Please try again.',
      );
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {showSuccessMessage && (
        <Animated.View
          style={[styles.successMessageContainer, { opacity: fadeAnim }]}
        >
          <Ionicons name="checkmark-circle" size={30} color="#4CAF50" />
          <Text style={styles.successMessageText}>Profile Updated!</Text>
        </Animated.View>
      )}
      <View style={styles.profileCard}>
        <View style={styles.imageWrapper}>
          <Image
            source={getEditImageSource(profileImage)}
            style={styles.profileImage}
          />
          <TouchableOpacity
            style={styles.editIcon}
            onPress={() => handleImagePick('gallery')}
          >
            <Ionicons name="pencil" size={12} color="#000" />
          </TouchableOpacity>
        </View>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            onPress={() => handleImagePick('gallery')}
            style={styles.actionButton}
          >
            <Text style={styles.buttonText}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleImagePick('camera')}
            style={styles.actionButton}
          >
            <Text style={styles.buttonText}>Camera</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.inputSection}>
        <Text style={styles.label}>First Name*</Text>
        <TextInput
          placeholder="Enter"
          placeholderTextColor="#aaa"
          value={firstName}
          onChangeText={setFirstName}
          style={styles.inputBoxLight}
        />
        <Text style={styles.label}>Last Name*</Text>
        <TextInput
          placeholder="Enter"
          placeholderTextColor="#aaa"
          value={lastName}
          onChangeText={setLastName}
          style={styles.inputBoxLight}
        />
        <Text style={styles.label}>Email*</Text>
        <TextInput
          placeholder="Enter"
          placeholderTextColor="#aaa"
          value={email}
          onChangeText={setEmail}
          style={styles.inputBoxLight}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <CustomDropdown
          label="Gender*"
          placeholder="Select"
          items={genderItems}
          value={gender}
          onValueChange={setGender}
        />
        <Text style={styles.label}>DOB</Text>
        <Pressable onPress={() => setShowDatePicker(true)}>
          <View style={styles.inputBoxDark}>
            <Text style={{ color: dob ? '#fff' : '#aaa' }}>
              {dob || 'Enter'}
            </Text>
            <Ionicons name="calendar-outline" size={20} color="#fff" />
          </View>
        </Pressable>
        {showDatePicker && (
          <DateTimePicker
            value={dob ? new Date(dob) : new Date()}
            mode="date"
            display="default"
            onChange={onDateChange}
            maximumDate={new Date()}
          />
        )}
        <TouchableOpacity style={styles.nextButton} onPress={handleSubmit}>
          <Text style={styles.nextButtonText}>Save</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default EditProfile;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1B2430' },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 80,
    paddingBottom: 50,
  },
  profileCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    alignItems: 'center',
    paddingBottom: 20,
    position: 'relative',
    marginBottom: 30,
  },
  imageWrapper: {
    position: 'absolute',
    top: -50,
    alignItems: 'center',
    zIndex: 2,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#1B2430',
  },
  editIcon: {
    position: 'absolute',
    right: 5,
    top: 5,
    backgroundColor: '#fff',
    borderRadius: 200,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  buttonRow: { flexDirection: 'row', marginTop: 70, gap: 12 },
  actionButton: {
    backgroundColor: '#fff',
    width: 139,
    height: 33,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#1B2430', fontWeight: '600' },
  inputSection: { marginTop: 10 },
  label: { color: '#fff', marginBottom: 4, fontSize: 14, position: 'relative' },
  inputBoxLight: {
    borderWidth: 1,
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 12,
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
  },
  inputBoxDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    height: 48,
    paddingLeft: 12,
    paddingRight: 15,
    color: '#fff',
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nextButton: {
    backgroundColor: '#7A86E0',
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: 20,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'OpenSans-Regular',
  },
  successMessageContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -100 }, { translateY: -50 }],
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 15,
    paddingHorizontal: 25,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    minWidth: 200,
  },
  successMessageText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 10,
    fontWeight: 'bold',
  },
});
