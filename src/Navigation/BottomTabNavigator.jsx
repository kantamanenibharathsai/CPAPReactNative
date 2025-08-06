import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, Image, Dimensions } from 'react-native';
import HomeScreen from '../Screens/HomeScreen';
import HistoryScreen from '../Screens/HistoryScreen';
import ProfileScreen from '../Screens/ProfileScreen';
import LibraryDeviceSetUp from '../Screens/LibraryDeviceSetUp';

const Tab = createBottomTabNavigator();

const TabButton = ({ iconSource, label, focused }) => {
  const iconTint = focused ? '#D2D7FF' : '#fff';
  const textColor = focused ? '#D2D7FF' : '#fff';
  const screenData = Dimensions.get('window');

  return (
    <View
      style={[
        styles.tabButtonContainer(screenData),
        focused && styles.activeTabBtnCont,
      ]}
    >
      <Image
        source={iconSource}
        style={[styles.tabIcon(screenData), { tintColor: iconTint }]}
        resizeMode="contain"
      />
      <Text style={[styles.tabLabel, { color: textColor }]}>{label}</Text>
    </View>
  );
};

const BottomTabNavigator = () => {
  return (
    <Tab.Navigator
      initialRouteName="HomeScreen"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: '#3a434d',
          borderTopWidth: 0,
          height: 80,
        },
        tabBarIcon: ({ focused }) => {
          let iconSource;
          let label;

          switch (route.name) {
            case 'HomeScreen':
              iconSource = require('../../assets/images/HomeIcon.png');
              label = 'Home';
              break;
            case 'HistoryScreen':
              iconSource = require('../../assets/images/History.png');
              label = 'History';
              break;
            case 'LibraryDeviceSetUp':
              iconSource = require('../../assets/images/LibraryIcon.png');
              label = 'Library';
              break;
            case 'ProfileScreen':
              iconSource = require('../../assets/images/User.png');
              label = 'Profile';
              break;
            default:
              iconSource = require('../../assets/images/User.png');
              label = 'Unknown';
          }

          return (
            <TabButton
              iconSource={iconSource}
              label={label}
              focused={focused}
            />
          );
        },
      })}
    >
      <Tab.Screen name="HomeScreen" component={HomeScreen} />
      <Tab.Screen name="HistoryScreen" component={HistoryScreen} />
      <Tab.Screen name="LibraryDeviceSetUp" component={LibraryDeviceSetUp} />
      <Tab.Screen name="ProfileScreen" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabButtonContainer: screenData => ({
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    borderTopWidth: 2,
    borderTopColor: 'transparent',
    marginTop: screenData.width > screenData.height ? -26 : -6,
    paddingTop: screenData.width > screenData.height ? 0 : 10,
  }),
  activeTabBtnCont: {
    borderTopColor: '#D2D7FF',
  },
  tabIcon: screenData => ({
    width: 25,
    height: 25,
    marginTop: screenData.width > screenData.height ? 27 : 35,
  }),
  tabLabel: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
    marginTop: 4,
    fontFamily: 'Inter-Regular',
  },
});

export default BottomTabNavigator;
