import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

const COLORS = {
  background: '#242E39',
  cardBackground: 'rgba(255, 255, 255, 0.1)',
  text: '#fff',
  primary: '#7A86E0',
  radioSelected: '#4B99F2',
  radioBorder: '#fff',
};

const FONT_SIZE = {
  title: 24,
  radioText: 14,
  button: 16,
};

const FONT_WEIGHT = {
  bold: '600',
};

const SPACING = {
  containerPadding: 18,
  titleTopMargin: 0,
  titleMarginBottom: 16,
  radioBoxPadding: 13,
  radioBoxGap: 20,
  radioOptionGap: 12,
  radioCircleMarginTop: 4,
  buttonMarginBottom: 24,
  buttonPaddingVertical: 14,
};

const BORDER_RADIUS = {
  radioBox: 12,
  radioCircle: 10,
  radioSelected: 5,
  button: 30,
};

const FONT_FAMILY = 'OpenSans-Regular';

const PreSignUp = () => {
  const [selectedOption, setSelectedOption] = useState(1);
  const navigation = useNavigation();

  const handleNext = () => {
    if (selectedOption === 1) {
      navigation.navigate('Login');
    } else if (selectedOption === 2) {
      navigation.navigate('SignUp');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View>
        <Text style={styles.title}>Do you have a therapy machine?</Text>
        <View style={styles.radioBox}>
          <TouchableOpacity
            style={styles.radioOption}
            onPress={() => setSelectedOption(1)}
          >
            <View style={styles.radioCircle}>
              {selectedOption === 1 && <View style={styles.selectedRb} />}
            </View>
            <Text style={styles.radioText}>
              I have a therapy machine and am ready to register it with a imeds
              AUTO CPAP account
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.radioOption}
            onPress={() => setSelectedOption(2)}
          >
            <View style={styles.radioCircle}>
              {selectedOption === 2 && <View style={styles.selectedRb} />}
            </View>
            <Text style={styles.radioText}>
              My healthcare/equipment provider suggested I create a imeds AUTO
              CPAP account while waiting for my therapy machine
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
        <Text style={styles.nextButtonText}>Next</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default PreSignUp;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.containerPadding,
    justifyContent: 'space-between',
    paddingTop: SPACING.titleTopMargin,
  },
  title: {
    fontSize: FONT_SIZE.title,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.text,
    marginTop: SPACING.titleTopMargin,
    marginBottom: SPACING.titleMarginBottom,
    fontFamily: FONT_FAMILY,
  },
  radioBox: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.radioBox,
    padding: SPACING.radioBoxPadding,
    gap: SPACING.radioBoxGap,
    marginTop: 6,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.radioOptionGap,
  },
  radioCircle: {
    height: 20,
    width: 20,
    borderRadius: BORDER_RADIUS.radioCircle,
    borderWidth: 2,
    borderColor: COLORS.radioBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.radioCircleMarginTop,
  },
  selectedRb: {
    width: 10,
    height: 10,
    borderRadius: BORDER_RADIUS.radioSelected,
    backgroundColor: COLORS.radioSelected,
  },
  radioText: {
    color: COLORS.text,
    fontSize: FONT_SIZE.radioText,
    flex: 1,
    fontFamily: FONT_FAMILY,
  },
  nextButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.buttonPaddingVertical,
    borderRadius: BORDER_RADIUS.button,
    alignItems: 'center',
    marginBottom: SPACING.buttonMarginBottom,
  },
  nextButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZE.button,
    fontFamily: FONT_FAMILY,
  },
});
