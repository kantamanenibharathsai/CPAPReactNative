// // Create: src/context/SocketContext.js
// import React, {
//   createContext,
//   useContext,
//   useEffect,
//   useRef,
//   useState,
// } from 'react';
// import { AppState } from 'react-native';
// import dgram from 'react-native-udp';
// import { Buffer } from 'buffer';
// import { NetworkInfo } from 'react-native-network-info';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import { appendToDebugFile } from '../Screens/Login';
// import {
//   getDBConnection,
//   createTables,
//   saveHomeScreenDataWithDuplicateCheck,
// } from '../database/Database';
// import { parseCpapPacket } from '../utils/Data';

// global.Buffer = Buffer;

// const LOCAL_PORT = 5000;
// const TARGET_DEVICE_IP = '192.168.36.7';
// const TARGET_DEVICE_PORT = 5000;
// const expectedHandshake = 'wifi_handshake\r\n';

// const SocketContext = createContext();

// export const useSocket = () => {
//   const context = useContext(SocketContext);
//   if (!context) {
//     throw new Error('useSocket must be used within a SocketProvider');
//   }
//   return context;
// };

// export const SocketProvider = ({ children }) => {
//   const [isConnected, setIsConnected] = useState(false);
//   const [udpMessageContent, setUdpMessageContent] = useState('');
//   const [udpPacketReceived, setUdpPacketReceived] = useState(false);
//   const [phoneIP, setPhoneIP] = useState(null);
//   const [db, setDb] = useState(null);
//   const [connectionStatus, setConnectionStatus] = useState('disconnected'); // disconnected, connecting, connected

//   const udpSocketRef = useRef(null);
//   const receivedPackets = useRef([]);
//   const udpBuffer = useRef('');
//   const reconnectTimeoutRef = useRef(null);
//   const keepAliveIntervalRef = useRef(null);
//   const isActiveRef = useRef(true);

//   // Initialize database
//   useEffect(() => {
//     (async () => {
//       try {
//         const connection = await getDBConnection();
//         await createTables(connection);
//         setDb(connection);
//         await appendToDebugFile('DATABASE: Initialized successfully');
//       } catch (error) {
//         console.error('Database Error:', error);
//         await appendToDebugFile(`DB INIT ERROR: ${error.message}`);
//       }
//     })();
//   }, []);

//   // Get phone IP and start socket connection
//   useEffect(() => {
//     const initializeConnection = async () => {
//       try {
//         const ip = await NetworkInfo.getIPV4Address();
//         if (ip) {
//           setPhoneIP(ip);
//           await appendToDebugFile(`NETWORK: Phone IP obtained: ${ip}`);
//         }
//       } catch (error) {
//         console.error('Error getting phone IP:', error);
//         await appendToDebugFile(`NETWORK ERROR: ${error.message}`);
//       }
//     };

//     initializeConnection();
//   }, []);

//   // Handle app state changes
//   useEffect(() => {
//     const handleAppStateChange = nextAppState => {
//       if (nextAppState === 'active') {
//         isActiveRef.current = true;
//         console.log('App became active, maintaining socket connection');
//       } else if (nextAppState === 'background' || nextAppState === 'inactive') {
//         isActiveRef.current = false;
//         console.log('App went to background, socket will continue running');
//       }
//     };

//     const subscription = AppState.addEventListener(
//       'change',
//       handleAppStateChange,
//     );
//     return () => subscription?.remove();
//   }, []);

//   // Main socket connection effect - runs continuously
//   useEffect(() => {
//     if (!db || !phoneIP) {
//       return;
//     }

//     let isMounted = true;

//     const createSocketConnection = () => {
//       if (!isMounted) return;

//       try {
//         // Close existing socket if any
//         if (udpSocketRef.current && !udpSocketRef.current._destroyed) {
//           udpSocketRef.current.close();
//         }

//         setConnectionStatus('connecting');
//         const socket = dgram.createSocket('udp4');
//         udpSocketRef.current = socket;

//         socket.bind(LOCAL_PORT, phoneIP, () => {
//           if (!isMounted) return;
//           console.log(`UDP socket bound to ${phoneIP}:${LOCAL_PORT}`);
//           setIsConnected(true);
//           setConnectionStatus('connected');
//           appendToDebugFile(`SOCKET: Connected to ${phoneIP}:${LOCAL_PORT}`);

//           // Start keep-alive mechanism
//           startKeepAlive();
//         });

//         socket.on('message', async (msg, rinfo) => {
//           if (!isMounted) return;

//           const message = Buffer.from(msg).toString('utf8');
//           const receivedHex = msg.toString('hex');

//           await appendToDebugFile(`RX: ${receivedHex}`);
//           setUdpPacketReceived(true);

//           if (message === expectedHandshake) {
//             setUdpMessageContent(message);
//             await appendToDebugFile('HANDSHAKE: Received expected handshake');

//             const ackMessage = 'app_ok';
//             const ackBuffer = Buffer.from(ackMessage, 'utf8');

//             socket.send(
//               ackBuffer,
//               0,
//               ackBuffer.length,
//               rinfo.port,
//               rinfo.address,
//               async err => {
//                 if (err) {
//                   console.error('ACK send error:', err);
//                   await appendToDebugFile(`ACK ERROR: ${err.message}`);
//                 } else {
//                   await appendToDebugFile(`TX: ${ackMessage}`);
//                 }
//               },
//             );
//           } else {
//             // Process data packets
//             udpBuffer.current += receivedHex;
//             await processDataPackets();
//           }
//         });

//         socket.on('error', async err => {
//           if (!isMounted) return;
//           console.error('UDP Socket Error:', err);
//           await appendToDebugFile(`SOCKET ERROR: ${err.message}`);
//           setIsConnected(false);
//           setConnectionStatus('disconnected');

//           // Attempt reconnection after 5 seconds
//           scheduleReconnect();
//         });

//         socket.on('close', async () => {
//           if (!isMounted) return;
//           console.log('UDP Socket closed');
//           await appendToDebugFile('SOCKET: Connection closed');
//           setIsConnected(false);
//           setConnectionStatus('disconnected');

//           // Attempt reconnection if app is still active
//           if (isActiveRef.current) {
//             scheduleReconnect();
//           }
//         });
//       } catch (error) {
//         console.error('Socket creation error:', error);
//         appendToDebugFile(`SOCKET CREATE ERROR: ${error.message}`);
//         setConnectionStatus('disconnected');
//         scheduleReconnect();
//       }
//     };

//     const scheduleReconnect = () => {
//       if (reconnectTimeoutRef.current) {
//         clearTimeout(reconnectTimeoutRef.current);
//       }

//       reconnectTimeoutRef.current = setTimeout(() => {
//         if (isMounted && isActiveRef.current) {
//           console.log('Attempting to reconnect socket...');
//           appendToDebugFile('SOCKET: Attempting reconnection');
//           createSocketConnection();
//         }
//       }, 5000);
//     };

//     const startKeepAlive = () => {
//       if (keepAliveIntervalRef.current) {
//         clearInterval(keepAliveIntervalRef.current);
//       }

//       keepAliveIntervalRef.current = setInterval(() => {
//         if (
//           udpSocketRef.current &&
//           !udpSocketRef.current._destroyed &&
//           isActiveRef.current
//         ) {
//           // Send a keep-alive ping
//           sendUdpMessage('ping');
//         }
//       }, 30000); // Send keep-alive every 30 seconds
//     };

//     const processDataPackets = async () => {
//       let startIndex = udpBuffer.current.indexOf('24');
//       let endIndex = udpBuffer.current.indexOf('0a', startIndex);

//       while (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
//         const potentialPacketHex = udpBuffer.current.substring(
//           startIndex,
//           startIndex + 70,
//         );

//         if (potentialPacketHex.length === 70) {
//           try {
//             const decoded = parseCpapPacket(potentialPacketHex);

//             if (db) {
//               try {
//                 const result = await saveHomeScreenDataWithDuplicateCheck(
//                   db,
//                   decoded,
//                 );

//                 if (result.success) {
//                   console.log('Packet saved successfully');
//                   receivedPackets.current.push(decoded);
//                   await appendToDebugFile('DATA: Packet saved to database');
//                 } else if (result.reason === 'duplicate') {
//                   await appendToDebugFile(
//                     'DATA: Duplicate packet detected, skipped',
//                   );
//                 } else {
//                   console.error('Failed to save packet:', result.error);
//                   await appendToDebugFile(`SAVE ERROR: ${result.error}`);
//                 }
//               } catch (e) {
//                 console.error('Database save error:', e);
//                 await appendToDebugFile(`DB SAVE ERROR: ${e.message}`);
//               }
//             }

//             udpBuffer.current = udpBuffer.current.substring(startIndex + 70);
//             startIndex = udpBuffer.current.indexOf('24');
//             endIndex = udpBuffer.current.indexOf('0a', startIndex);
//           } catch (e) {
//             await appendToDebugFile(`PACKET PARSE ERROR: ${e.message}`);
//             udpBuffer.current = udpBuffer.current.substring(startIndex + 2);
//             startIndex = udpBuffer.current.indexOf('24');
//             endIndex = udpBuffer.current.indexOf('0a', startIndex);
//           }
//         } else {
//           break;
//         }
//       }
//     };

//     // Initialize connection
//     createSocketConnection();

//     return () => {
//       isMounted = false;

//       // Clear timeouts and intervals
//       if (reconnectTimeoutRef.current) {
//         clearTimeout(reconnectTimeoutRef.current);
//       }
//       if (keepAliveIntervalRef.current) {
//         clearInterval(keepAliveIntervalRef.current);
//       }

//       // Close socket
//       if (udpSocketRef.current && !udpSocketRef.current._destroyed) {
//         udpSocketRef.current.close();
//       }
//     };
//   }, [phoneIP, db]);

//   // Function to send UDP message
//   const sendUdpMessage = async (message = 'Hello WizFi360!') => {
//     if (!udpSocketRef.current || !isConnected) {
//       console.warn('UDP socket not available');
//       await appendToDebugFile('TX FAILED: Socket not available');
//       return false;
//     }

//     try {
//       const msgBuffer = Buffer.from(message, 'utf8');

//       udpSocketRef.current.send(
//         msgBuffer,
//         0,
//         msgBuffer.length,
//         TARGET_DEVICE_PORT,
//         TARGET_DEVICE_IP,
//         async err => {
//           if (err) {
//             console.error('UDP Send Error:', err);
//             await appendToDebugFile(`TX ERROR: ${err.message}`);
//           } else {
//             console.log('UDP message sent successfully:', message);
//             await appendToDebugFile(`TX: ${message}`);
//           }
//         },
//       );

//       return true;
//     } catch (error) {
//       console.error('Send message error:', error);
//       await appendToDebugFile(`TX EXCEPTION: ${error.message}`);
//       return false;
//     }
//   };

//   // Function to get latest received packets
//   const getReceivedPackets = () => {
//     return receivedPackets.current;
//   };

//   // Function to clear received packets
//   const clearReceivedPackets = () => {
//     receivedPackets.current = [];
//   };

//   // Function to force reconnect
//   const forceReconnect = async () => {
//     await appendToDebugFile('SOCKET: Force reconnect requested');
//     if (udpSocketRef.current && !udpSocketRef.current._destroyed) {
//       udpSocketRef.current.close();
//     }
//   };

//   const value = {
//     isConnected,
//     connectionStatus,
//     udpMessageContent,
//     udpPacketReceived,
//     phoneIP,
//     db,
//     sendUdpMessage,
//     getReceivedPackets,
//     clearReceivedPackets,
//     forceReconnect,
//   };

//   return (
//     <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
//   );
// };
