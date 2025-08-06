import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Ionicons from 'react-native-vector-icons/Ionicons';
import SignUp from '../Screens/SignUp';
import Welcome from '../Screens/Welcome';
import Splash from '../Screens/Splash';
import PreSignUp from '../Screens/PreSignUp';
import Login from '../Screens/Login';
import WifiConnecting from '../Screens/WifiConnecting';
import EditProfile from '../Screens/EditProfile';
import BottomTabNavigator from './BottomTabNavigator';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Splash">
        <Stack.Screen
          name="Splash"
          component={Splash}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Welcome"
          component={Welcome}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="PreSignUp"
          component={PreSignUp}
          options={{
            title: '',
            headerStyle: {
              backgroundColor: '#242E39',
            },
            headerTintColor: '#fff',
            headerBackImage: () => (
              <Ionicons
                name="chevron-back"
                size={26}
                color="#fff"
                style={{ marginLeft: 12 }}
              />
            ),
          }}
        />
        <Stack.Screen
          name="Login"
          component={Login}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="SignUp"
          component={SignUp}
          options={{
            title: 'Create account',
            headerStyle: {
              backgroundColor: '#242E39',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontFamily: 'OpenSans-Regular',
              fontSize: 22,
            },
            headerBackImage: () => (
              <Ionicons
                name="chevron-back"
                size={26}
                color="#fff"
                style={{ marginLeft: 12 }}
              />
            ),
          }}
        />
        <Stack.Screen
          name="WifiConnecting"
          component={WifiConnecting}
          options={{
            title: 'Connect Device',
            headerStyle: {
              backgroundColor: '#242E39',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontFamily: 'OpenSans-Regular',
              fontSize: 22,
            },
          }}
        />
        <Stack.Screen
          name="EditProfile"
          component={EditProfile}
          options={{
            title: '',
            headerStyle: {
              backgroundColor: '#242E39',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontFamily: 'OpenSans-Regular',
              fontSize: 22,
            },
          }}
        />
        <Stack.Screen
          name="BottomTab"
          component={BottomTabNavigator}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
