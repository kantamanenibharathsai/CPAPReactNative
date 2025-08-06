import { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import AppNavigator from './src/Navigation/AppNavigator';
import { Provider as PaperProvider } from 'react-native-paper';
import SplashScreen from 'react-native-splash-screen';
import { Host } from 'react-native-portalize';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
// import { SocketProvider } from './src/context/SocketContext';

LogBox.ignoreLogs(['VirtualizedLists should never be nested']);

function App() {
  useEffect(() => {
    setTimeout(() => {
      SplashScreen.hide();
    }, 2000);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Host>
        <PaperProvider>
          {/* <SocketProvider> */}
            <StatusBar backgroundColor="#3a434d" barStyle="light-content" />
            <AppNavigator />
          {/* </SocketProvider> */}
        </PaperProvider>
      </Host>
      <Toast />
    </GestureHandlerRootView>
  );
}

export default App;