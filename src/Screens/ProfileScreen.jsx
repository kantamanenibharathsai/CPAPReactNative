import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getDBConnection,
  getProfile,
  createTables,
  saveProfile,
} from '../database/Database';
import ProfilePhoto from '../../assets/images/ProfilePic.jpeg';
const DEFAULT_EMAIL = 'imedsglobal21@avantel.in';

const ProfileScreen = () => {
  const navigation = useNavigation();
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    dob: '',
    gender: '',
    email: '',
    profileImage: null,
    brand1: 'imedS CPAP',
    model1: 'imedS AUTO CPAP',
    serial: '12345678912',
    brand2: 'BMC',
    model2: 'F5',
  });

  const getImageSource = imageUri => {
    if (!imageUri) {
      return ProfilePhoto;
    }

    if (typeof imageUri === 'string') {
      if (
        imageUri.startsWith('file://') ||
        imageUri.startsWith('http://') ||
        imageUri.startsWith('https://') ||
        imageUri.startsWith('content://')
      ) {
        return { uri: imageUri };
      }
      return ProfilePhoto;
    }
    return imageUri;
  };

  useEffect(() => {
    const loadProfileData = async () => {
      try {
        const db = await getDBConnection();
        await createTables(db);

        let currentUserEmail = await AsyncStorage.getItem('userEmail');
        if (!currentUserEmail) {
          currentUserEmail = DEFAULT_EMAIL;
          await AsyncStorage.setItem('userEmail', currentUserEmail);
        }
        let profile = await getProfile(db, currentUserEmail);
        if (!profile) {
          const dummyProfile = {
            name: 'Imeds Global',
            email: DEFAULT_EMAIL,
            dob: '1998-01-01',
            image_uri: null,
            first_name: 'Imeds',
            last_name: 'Global',
            gender: 'Male',
          };

          try {
            await saveProfile(db, dummyProfile, null);
            profile = await getProfile(db, DEFAULT_EMAIL);
          } catch (err) {
            if (
              err.message &&
              (err.message.includes('already exists') ||
                err.message.includes('UNIQUE constraint failed'))
            ) {
              profile = await getProfile(db, DEFAULT_EMAIL);
              setProfileData(prevData => ({
                ...prevData,
                profileImage: dummyProfile.image_uri,
                firstName: dummyProfile.first_name,
                lastName: dummyProfile.last_name,
                dob: dummyProfile.dob,
                gender: dummyProfile.gender,
                email: dummyProfile.email,
              }));
            } else {
              throw err;
            }
          }
        }

        if (profile) {
          setProfileData(prevData => ({
            ...prevData,
            profileImage: profile.image_uri,
            firstName: profile.first_name,
            lastName: profile.last_name,
            dob: profile.dob,
            gender: profile.gender,
            email: profile.email,
          }));
        }
      } catch (err) {
        Alert.alert(
          'Error',
          err.message || 'Could not load profile data. Please try again.',
        );
      }
    };

    const unsubscribe = navigation.addListener('focus', loadProfileData);

    loadProfileData();

    return unsubscribe;
  }, [navigation]);

  const handleEditProfile = () => {
    navigation.navigate('EditProfile', { initialProfileData: profileData });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.profileCard}>
        <View style={styles.profileImageWrapper}>
          <Image
            resizeMode="cover"
            source={getImageSource(profileData.profileImage)}
            style={styles.profileImage}
          />
        </View>
        <TouchableOpacity
          style={styles.profileEditIcon}
          onPress={handleEditProfile}
        >
          <Ionicons name="pencil" size={18} color="#7A86E0" />
        </TouchableOpacity>
        <Text style={styles.profileName}>
          {profileData.firstName} {profileData.lastName}
        </Text>
        <Text style={styles.profileInfo}>
          {profileData.dob} | {profileData.gender}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Email Address</Text>
        </View>
        <Text style={styles.cardContent}>{profileData.email}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>My Equipment</Text>
        </View>

        {[
          ['Model by', profileData.brand1],
          ['Model', profileData.model1],
          ['Serial Number', profileData.serial],
        ].map(([label, value], index) => (
          <View style={styles.equipmentRow} key={index}>
            <Text style={styles.equipmentLabel}>{label}</Text>
            <Text style={styles.equipmentColon}>:</Text>
            <Text style={styles.equipmentValue}>{value}</Text>
          </View>
        ))}

        <View style={styles.separator} />

        {[
          ['Model by', profileData.brand2],
          ['Model', profileData.model2],
        ].map(([label, value], index) => (
          <View style={styles.equipmentRow} key={`bmc-${index}`}>
            <Text style={styles.equipmentLabel}>{label}</Text>
            <Text style={styles.equipmentColon}>:</Text>
            <Text style={styles.equipmentValue}>{value}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingTop: 80,
    backgroundColor: '#242E39',
    flexGrow: 1,
  },
  profileCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingTop: 60,
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  profileImageWrapper: { position: 'absolute', top: -50, zIndex: 2 },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#1B2430',
  },
  profileEditIcon: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 6,
    borderRadius: 20,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 10,
  },
  profileInfo: { fontSize: 12, color: '#fff', marginTop: 4, marginBottom: 10 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cardContent: { color: '#fff', fontSize: 14 },
  equipmentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    columnGap: 30,
  },
  equipmentLabel: { color: '#fff', fontSize: 12, width: 110 },
  equipmentColon: { color: '#fff', fontSize: 12, width: 10 },
  equipmentValue: { color: '#fff', fontSize: 12, flex: 1 },
  separator: { height: 1, backgroundColor: '#fff', marginVertical: 10 },
});
