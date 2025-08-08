// import { useEffect } from 'react';
// import { StatusBar, LogBox } from 'react-native';
// import AppNavigator from './src/Navigation/AppNavigator';
// import { Provider as PaperProvider } from 'react-native-paper';
// import SplashScreen from 'react-native-splash-screen';
// import { Host } from 'react-native-portalize';
// import { GestureHandlerRootView } from 'react-native-gesture-handler';
// import Toast from 'react-native-toast-message';
// import { networkService } from './src/services/NetworkService';
// import { getDBConnection, createTables } from './src/database/Database';
// // import { SocketProvider } from './src/context/SocketContext';

// LogBox.ignoreLogs(['VirtualizedLists should never be nested']);

// function App() {
//     useEffect(() => {
//     const initializeApp = async () => {
//       try {
//         // Initialize database
//         const dbConnection = await getDBConnection();
//         await createTables(dbConnection);

//         // Initialize network service with database connection
//         await networkService.initialize(dbConnection);

//         // Hide splash screen
//         setTimeout(() => {
//           SplashScreen.hide();
//         }, 2000);
//       } catch (error) {
//         console.error('App initialization failed:', error);
//         SplashScreen.hide();
//       }
//     };

//     initializeApp();

//     return () => {
//       // Clean up network service when app closes
//       networkService.stopUdpService();
//     };
//   }, []);

//   return (
//     <GestureHandlerRootView style={{ flex: 1 }}>
//       <Host>
//         <PaperProvider>
//           {/* <SocketProvider> */}
//             <StatusBar backgroundColor="#3a434d" barStyle="light-content" />
//             <AppNavigator />
//           {/* </SocketProvider> */}
//         </PaperProvider>
//       </Host>
//       <Toast />
//     </GestureHandlerRootView>
//   );
// }

// export default App;

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
