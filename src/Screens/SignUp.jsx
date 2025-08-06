import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DropDownPicker from 'react-native-dropdown-picker';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getDBConnection,
  createTable,
  saveProfile,
  getProfile,
} from '../database/Database';

const FORM_FIELDS = ['firstName', 'lastName', 'email', 'confirmEmail'];
const GENDER_OPTIONS = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
];
const THERAPY_START_OPTIONS = [
  { label: 'Less than a month ago', value: 'lt_month' },
  { label: '1 - 3 months ago', value: '1_3_months' },
  { label: 'More than 3 months ago', value: 'gt_3_months' },
];

const TEXT = {
  sectionTitle: {
    therapy: 'Therapy information',
    enhanceExperience: 'Enhance your imeds AUTO CPAP experience',
    conditions: 'Conditions of service',
  },
  infoText: {
    enhanceExperience:
      'Optional: You can change these later in your account. The imeds AUTO CPAP Privacy Notice provides information about how we process your personal data.',
    conditions:
      'imeds AUTO CPAP processes your health data to deliver my imeds AUTO CPAP score, feedback on your therapy and tailored coaching tips',
  },
  consent: {
    consent1:
      'I consent to the sharing of my personal data with my healthcare provider to receive better follow up for my therapy.',
    consent2:
      'I consent to receiving email message about other imeds products and services',
    terms: (
      <Text>
        I Acknowledge that I have read and accepted the imeds AUTO CAPAP{' '}
        <Text style={{ color: '#5866CE' }}>Terms of Use</Text> an{' '}
        <Text style={{ color: '#5866CE' }}>Privacy Notice</Text>
      </Text>
    ),
  },
  errors: {
    firstName: 'First name should contain only alphabets',
    lastName: 'Last name should contain only alphabets',
    invalidEmail: 'Invalid email format',
    emailMismatch: 'Email and Confirm Email must be the same',
    termsAccepted: 'You must accept the Terms and Conditions to proceed',
    registrationFailed:
      'This email is already registered. Please use a different email or log in.',
    dataSaveError: 'Failed to save data. Please try again.',
    formErrors: 'Form has errors',
  },
  buttons: {
    next: 'Next',
  },
};

const COLORS = {
  background: '#242E39',
  inputBackground: 'rgba(255, 255, 255, 0.1)',
  text: '#fff',
  placeholder: '#999',
  primary: '#7A86E0',
  error: 'red',
  dropdownBackground: '#2B3643',
  dropdownBorder: '#444',
  link: '#5866CE',
};

const FONT_FAMILY = 'OpenSans-Regular';

const SIZES = {
  fontSize: 14,
  titleFontSize: 20,
  buttonFontSize: 16,
  inputHeight: 55,
  borderRadius: 8,
};

const SPACING = {
  padding: 20,
  inputMarginBottom: 16,
  labelMarginBottom: 6,
  sectionTitleMarginTop: 24,
  sectionTitleMarginBottom: 8,
  infoTextMarginBottom: 12,
  checkboxGap: 10,
  checkboxMarginBottom: 14,
  buttonMarginTop: 20,
};

const SignUp = () => {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    confirmEmail: '',
    dob: '',
    gender: '',
    sleepStart: '',
    eventsPerHour: '',
    sleepTestPlace: '',
    consent1: false,
    consent2: false,
    termsAccepted: false,
  });
  const [errors, setErrors] = useState({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isGenderDropdownOpen, setIsGenderDropdownOpen] = useState(false);
  const [genderValue, setGenderValue] = useState(null);
  const [isTherapyDropdownOpen, setIsTherapyDropdownOpen] = useState(false);
  const [therapyValue, setTherapyValue] = useState(null);
  const navigation = useNavigation();

  const handleChange = (key, value) => {
    setForm(prevForm => ({ ...prevForm, [key]: value }));
    setErrors(prevErrors => ({ ...prevErrors, [key]: '' }));
  };

  const handleTextInputChange = (key, text) => handleChange(key, text);

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const formattedDate = selectedDate.toLocaleDateString('en-GB');
      handleChange('dob', formattedDate);
    }
  };

  const handleCheckboxToggle = key => handleChange(key, !form[key]);

  useEffect(() => {
    handleChange('gender', genderValue);
  }, [genderValue]);

  useEffect(() => {
    handleChange('sleepStart', therapyValue);
  }, [therapyValue]);

  const validateForm = () => {
    const newErrors = {};
    const nameRegex = /^[A-Za-z]+$/;
    const emailRegex = /^[a-z0-9]+@[a-z]+\.[a-z]{2,}$/;

    if (!form.firstName.trim().match(nameRegex)) {
      newErrors.firstName = TEXT.errors.firstName;
    }
    if (!form.lastName.trim().match(nameRegex)) {
      newErrors.lastName = TEXT.errors.lastName;
    }
    if (!emailRegex.test(form.email)) {
      newErrors.email = TEXT.errors.invalidEmail;
    }
    if (!emailRegex.test(form.confirmEmail)) {
      newErrors.confirmEmail = TEXT.errors.invalidEmail;
    }
    if (form.email && form.confirmEmail && form.email !== form.confirmEmail) {
      newErrors.confirmEmail = TEXT.errors.emailMismatch;
    }
    if (!form.termsAccepted) {
      newErrors.termsAccepted = TEXT.errors.termsAccepted;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (validateForm()) {
      try {
        const email = form.email.trim();
        const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;

        await AsyncStorage.setItem('userEmail', email);
        await AsyncStorage.setItem('userName', fullName);

        const db = await getDBConnection();
        await createTable(db);
        const existingProfile = await getProfile(db, email);

        if (existingProfile) {
          Alert.alert('Registration Failed', TEXT.errors.registrationFailed);
          return;
        }

        const profileDataToSave = {
          name: fullName,
          email,
          dob: form.dob,
          image_uri: null,
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim(),
          gender: form.gender,
        };
        await saveProfile(db, profileDataToSave);

        Alert.alert('Success', 'Account created and data saved successfully!', [
          { text: 'OK', onPress: () => navigation.navigate('Login') },
        ]);
      } catch (error) {
        Alert.alert('Error', TEXT.errors.dataSaveError);
      }
    } else {
      Alert.alert(
        TEXT.errors.formErrors,
        'Please correct the highlighted fields.',
      );
    }
  };

  const renderTextInput = (
    key,
    label,
    keyboardType = 'default',
    autoCapitalize = 'words',
  ) => (
    <View key={key} style={styles.inputGroup}>
      <Text style={styles.label}>
        {label}
        {FORM_FIELDS.includes(key) && '*'}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Enter"
        placeholderTextColor={COLORS.placeholder}
        value={form[key]}
        onChangeText={text => handleTextInputChange(key, text)}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
      {errors[key] && <Text style={styles.errorText}>{errors[key]}</Text>}
    </View>
  );

  const renderDropdown = (
    label,
    isOpen,
    value,
    setOpen,
    setValue,
    items,
    zIndex,
  ) => (
    <View style={{ zIndex }}>
      <Text style={styles.label}>{label}</Text>
      <DropDownPicker
        open={isOpen}
        value={value}
        items={items}
        setOpen={setOpen}
        setValue={setValue}
        placeholder={`${label}`}
        style={styles.dropdown}
        dropDownContainerStyle={styles.dropdownContainer}
        textStyle={styles.dropdownText}
        placeholderStyle={styles.dropdownPlaceholder}
        theme="DARK"
      />
    </View>
  );

  const renderCheckbox = (key, text) => (
    <TouchableOpacity
      key={key}
      onPress={() => handleCheckboxToggle(key)}
      style={styles.checkboxRow}
    >
      <Text style={styles.checkboxSymbol}>{form[key] ? '☑' : '☐'}</Text>
      <Text style={styles.checkboxLabel}>{text}</Text>
    </TouchableOpacity>
  );

  const renderForm = () => (
    <View style={styles.container}>
      {renderTextInput('firstName', 'First Name')}
      {renderTextInput('lastName', 'Last Name')}
      {renderTextInput('email', 'Email', 'email-address', 'none')}
      {renderTextInput(
        'confirmEmail',
        'Confirm Email',
        'email-address',
        'none',
      )}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Date of Birth</Text>
        <TouchableOpacity
          style={styles.dateInputTouchable}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={styles.dateText}>{form.dob || 'DD-MM-YYYY'}</Text>
          <Ionicons
            name="calendar-outline"
            size={24}
            color={COLORS.placeholder}
            style={styles.dateIcon}
          />
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
            maximumDate={new Date()}
          />
        )}
      </View>
      {renderDropdown(
        'Gender',
        isGenderDropdownOpen,
        genderValue,
        setIsGenderDropdownOpen,
        setGenderValue,
        GENDER_OPTIONS,
        5000,
      )}
      <Text style={styles.sectionTitle}>{TEXT.sectionTitle.therapy}</Text>
      {renderDropdown(
        'When did you start sleep therapy ?',
        isTherapyDropdownOpen,
        therapyValue,
        setIsTherapyDropdownOpen,
        setTherapyValue,
        THERAPY_START_OPTIONS,
        4000,
      )}
      <View style={{ marginTop: 14 }}>
        {renderTextInput('eventsPerHour', 'Events per hour', 'numeric')}
      </View>
      {renderTextInput('sleepTestPlace', 'Sleep test place')}
      <Text style={styles.sectionTitle}>
        {TEXT.sectionTitle.enhanceExperience}
      </Text>
      <Text style={styles.infoText}>{TEXT.infoText.enhanceExperience}</Text>
      {renderCheckbox('consent1', TEXT.consent.consent1)}
      {renderCheckbox('consent2', TEXT.consent.consent2)}
      <Text style={styles.sectionTitle}>{TEXT.sectionTitle.conditions}</Text>
      <Text style={styles.infoText}>{TEXT.infoText.conditions}</Text>
      {renderCheckbox('termsAccepted', TEXT.consent.terms)}
      {errors.termsAccepted && (
        <Text style={styles.errorText}>{errors.termsAccepted}</Text>
      )}
      <TouchableOpacity style={styles.nextButton} onPress={handleSubmit}>
        <Text style={styles.nextButtonText}>{TEXT.buttons.next}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView
      contentContainerStyle={styles.flatListContainer}
      keyboardShouldPersistTaps="handled"
    >
      {renderForm()}
    </ScrollView>
  );
};

export default SignUp;

const styles = StyleSheet.create({
  flatListContainer: {
    paddingBottom: 0,
  },
  container: {
    padding: SPACING.padding,
    backgroundColor: COLORS.background,
  },
  sectionTitle: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: SIZES.titleFontSize,
    marginTop: SPACING.sectionTitleMarginTop,
    marginBottom: SPACING.sectionTitleMarginBottom,
    fontFamily: FONT_FAMILY,
  },
  infoText: {
    color: COLORS.text,
    fontSize: SIZES.fontSize,
    marginBottom: SPACING.infoTextMarginBottom,
    fontFamily: FONT_FAMILY,
  },
  inputGroup: {
    marginBottom: SPACING.inputMarginBottom,
  },
  label: {
    color: COLORS.text,
    marginBottom: SPACING.labelMarginBottom,
    fontSize: SIZES.fontSize,
    fontFamily: FONT_FAMILY,
  },
  input: {
    backgroundColor: COLORS.inputBackground,
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderRadius: SIZES.borderRadius,
    fontSize: SIZES.fontSize,
    height: SIZES.inputHeight,
    fontFamily: FONT_FAMILY,
  },
  dropdown: {
    backgroundColor: COLORS.dropdownBackground,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: SIZES.borderRadius,
    borderColor: COLORS.dropdownBorder,
    height: SIZES.inputHeight,
  },
  dropdownContainer: {
    backgroundColor: COLORS.dropdownBackground,
    borderColor: COLORS.dropdownBorder,
  },
  dropdownText: {
    color: COLORS.text,
    fontSize: SIZES.fontSize,
    fontFamily: FONT_FAMILY,
  },
  dropdownPlaceholder: {
    color: COLORS.placeholder,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.checkboxGap,
    marginBottom: SPACING.checkboxMarginBottom,
  },
  checkboxSymbol: {
    fontSize: 18,
    color: COLORS.text,
    marginTop: 1,
    fontFamily: FONT_FAMILY,
  },
  checkboxLabel: {
    color: COLORS.text,
    fontSize: SIZES.fontSize,
    flex: 1,
    fontFamily: FONT_FAMILY,
  },
  nextButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: SPACING.buttonMarginTop,
  },
  nextButtonText: {
    color: COLORS.text,
    fontSize: SIZES.buttonFontSize,
    fontFamily: FONT_FAMILY,
  },
  dateInputTouchable: {
    backgroundColor: COLORS.inputBackground,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: SIZES.borderRadius,
    paddingHorizontal: 12,
    height: SIZES.inputHeight,
  },
  dateText: {
    color: COLORS.text,
    fontSize: SIZES.fontSize,
    fontFamily: FONT_FAMILY,
  },
  dateIcon: {
    marginLeft: 10,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 4,
    fontFamily: FONT_FAMILY,
  },
});
