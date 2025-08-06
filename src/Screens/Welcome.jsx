import { useEffect, useState, useCallback } from 'react';
import {
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDBConnection, getPinFromDb } from '../database/Database';

const COLORS = {
  background: '#242E39',
  cardBackground: 'rgba(255, 255, 255, 0.1)',
  primary: '#7A86E0',
  text: '#fff',
};

const FONT_FAMILY = {
  regular: 'OpenSans-Regular',
};

const FONT_SIZE = {
  title: 32,
  welcomeTitle: 24,
  description: 16,
  button: 16,
};

const FONT_WEIGHT = {
  bold: '600',
};

const SPACING = {
  marginTop: 30,
  textMarginTop: 12,
  cardMarginTop: 50,
  cardPadding: 20,
  cardPaddingVertical: 36,
  titleMarginBottom: 10,
  descriptionMarginBottom: 60,
  buttonPaddingVertical: 14,
  buttonMarginBottom: 12,
};

const BORDER_RADIUS = {
  card: 40,
  button: 30,
};

const Welcome = () => {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const [isLoading, setIsLoading] = useState(true);

  const checkExistingPinAndNavigate = useCallback(async () => {
    if (!isFocused || !isLoading) {
      return;
    }

    let db = null;
    try {
      db = await getDBConnection();
      const storedPin = await getPinFromDb(db);
      const isLoggedIn = await AsyncStorage.getItem('isLoggedIn');
      if (storedPin === '123456' && isLoggedIn === null) {
        setIsLoading(false);
        return;
      } else if (storedPin === '123456' && isLoggedIn === 'true') {
        navigation.replace('BottomTab');
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      Alert.alert(
        'Database Error',
        `Could not access database to check PIN. Please restart the app. Error: ${error.message}`,
      );
      setIsLoading(false);
    }
  }, [isFocused, isLoading, navigation]);

  useEffect(() => {
    checkExistingPinAndNavigate();
  }, [checkExistingPinAndNavigate]);

  const handlePreSignUp = () => {
    navigation.navigate('PreSignUp');
  };

  const handleLogin = () => {
    navigation.navigate('Login');
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={COLORS.background}
        />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.imageContainer}>
        <Image
          source={require('../../assets/CPAP_logo.png')}
          style={styles.image}
          resizeMode="contain"
        />
        <Text style={styles.titleText}>AUTO CPAP</Text>
      </View>
      <View style={styles.bottomCard}>
        <Text style={styles.welcomeTitle}>Welcome</Text>
        <Text style={styles.description}>
          We're here to support you on your journey to better breathing while
          you sleep, every step of the way
        </Text>

        <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
          <Text style={styles.loginButtonText}>Login</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signupButton} onPress={handlePreSignUp}>
          <Text style={styles.signupButtonText}>Sign Up</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default Welcome;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  imageContainer: {
    alignItems: 'center',
    marginTop: SPACING.marginTop,
  },
  image: {
    width: 268,
    height: 198,
  },
  titleText: {
    marginTop: SPACING.textMarginTop,
    fontSize: FONT_SIZE.title,
    color: COLORS.text,
  },
  bottomCard: {
    width: '100%',
    height: 381,
    backgroundColor: COLORS.cardBackground,
    borderTopLeftRadius: BORDER_RADIUS.card,
    borderTopRightRadius: BORDER_RADIUS.card,
    paddingHorizontal: SPACING.cardPadding,
    paddingVertical: SPACING.cardPaddingVertical,
    alignItems: 'center',
    marginTop: SPACING.cardMarginTop,
  },
  welcomeTitle: {
    fontSize: FONT_SIZE.welcomeTitle,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.text,
    marginBottom: SPACING.titleMarginBottom,
    fontFamily: FONT_FAMILY.regular,
  },
  description: {
    color: COLORS.text,
    fontSize: FONT_SIZE.description,
    textAlign: 'center',
    marginBottom: SPACING.descriptionMarginBottom,
    fontFamily: FONT_FAMILY.regular,
  },
  loginButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.button,
    paddingVertical: SPACING.buttonPaddingVertical,
    width: '100%',
    alignItems: 'center',
    marginBottom: SPACING.buttonMarginBottom,
  },
  loginButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZE.button,
    fontFamily: FONT_FAMILY.regular,
  },
  signupButton: {
    borderWidth: 1.5,
    borderColor: COLORS.text,
    borderRadius: BORDER_RADIUS.button,
    paddingVertical: SPACING.buttonPaddingVertical,
    width: '100%',
    alignItems: 'center',
  },
  signupButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZE.button,
    fontFamily: FONT_FAMILY.regular,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
