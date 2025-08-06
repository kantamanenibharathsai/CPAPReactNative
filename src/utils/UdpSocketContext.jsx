// import React, {
//   createContext,
//   useContext,
//   useState,
//   useEffect,
//   useRef,
// } from 'react';
// import dgram from 'react-native-udp';
// import { Buffer } from 'buffer';
// import { appendToDebugFile } from '../Screens/Login.jsx';
// import {
//   getDBConnection,
//   createTable,
//   saveHomeScreenData,
// } from '../database/Database.js';
// import { parseCpapPacket } from './Data.js';

// global.Buffer = Buffer;

// const UdpSocketContext = createContext(null);

// const LOCAL_PORT = 5000;
// const TARGET_DEVICE_IP = '192.168.36.7';
// const TARGET_DEVICE_PORT = 5000;
// const expectedHandshake = 'wifi_handshake\r\n';

// export const UdpSocketProvider = ({ children }) => {
//   const [db, setDb] = useState(null);
//   const [phoneIP, setPhoneIP] = useState(null);
//   const [isConnectedToDevice, setIsConnectedToDevice] = useState(false);
//   const udpSocketRef = useRef(null);
//   const udpBuffer = useRef('');
//   console.log("phoneIp", phoneIP);
//   console.log("isConnectedToDevice", isConnectedToDevice);
//   console.log("udpSocketRef", udpSocketRef);
//   console.log("udpBuffer", udpBuffer);


//   useEffect(() => {
//     const initDb = async () => {
//       try {
//         const connection = await getDBConnection();
//         await createTable(connection);
//         setDb(connection);
//         console.log('UdpSocketContext: Database initialized.');
//       } catch (error) {
//         console.error('UdpSocketContext: DB init error:', error);
//         await appendToDebugFile(
//           `UdpSocketContext DB INIT ERROR: ${error.message}`,
//         );
//       }
//     };
//     initDb();
//   }, []);

//   useEffect(() => {
//     if (!db || !phoneIP) {
//       console.log(
//         'UdpSocketContext: DB or phoneIP not ready, skipping socket setup.',
//       );
//       return;
//     }

//     console.log('UdpSocketContext: Setting up UDP socket...');
//     const socket = dgram.createSocket('udp4');
//     udpSocketRef.current = socket;

//     socket.bind(LOCAL_PORT, phoneIP, () => {
//       console.log(`UdpSocketContext: Socket bound to ${phoneIP}:${LOCAL_PORT}`);
//     });

//     socket.on('message', async (msg, rinfo) => {
//       const message = Buffer.from(msg).toString('utf8');
//       await appendToDebugFile(`UdpSocketContext RX: ${message}`);
//       console.log(
//         `UdpSocketContext: Received UDP from ${rinfo.address}:${rinfo.port}: "${message}"`,
//       );

//       if (message === expectedHandshake) {
//         setIsConnectedToDevice(true);
//         const ackMessage = 'app_ok';
//         const ackBuffer = Buffer.from(ackMessage, 'utf8');
//         socket.send(
//           ackBuffer,
//           0,
//           ackBuffer.length,
//           rinfo.port,
//           rinfo.address,
//           err => {
//             if (err) {
//               console.error('UdpSocketContext: Error sending ACK:', err);
//             } else {
//               console.log('UdpSocketContext: ACK sent:', ackMessage);
//             }
//           },
//         );
//         await appendToDebugFile(`UdpSocketContext TX: ${ackMessage}`);
//       } else {
//         console.log('UdpSocketContext: Received potential CPAP data packet.');
//         const receivedHex = msg.toString('hex');
//         udpBuffer.current += receivedHex;
//         console.log(
//           `UdpSocketContext: Current UDP Buffer: ${udpBuffer.current}`,
//         );

//         let startIndex = udpBuffer.current.indexOf('24');
//         let endIndex = udpBuffer.current.indexOf('0a', startIndex);

//         while (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
//           const potentialPacketHex = udpBuffer.current.substring(
//             startIndex,
//             startIndex + 70,
//           );

//           if (potentialPacketHex.length === 70) {
//             try {
//               const decoded = parseCpapPacket(potentialPacketHex);
//               if (db) {
//                 try {
//                   // CORRECTED: Pass decoded.date_key as the second argument
//                   await saveHomeScreenData(db, decoded.date_key, decoded);
//                   console.log(
//                     'UdpSocketContext: [UDP] Packet saved',
//                     decoded.date_key,
//                   );
//                 } catch (e) {
//                   console.error('UdpSocketContext: DB save error:', e);
//                 }
//               }
//               udpBuffer.current = udpBuffer.current.substring(startIndex + 70);
//               startIndex = udpBuffer.current.indexOf('24');
//               endIndex = udpBuffer.current.indexOf('0a', startIndex);
//             } catch (e) {
//               console.error(
//                 'UdpSocketContext: [UDP] Packet parse error:',
//                 e.message,
//               );
//               udpBuffer.current = udpBuffer.current.substring(startIndex + 2);
//               startIndex = udpBuffer.current.indexOf('24');
//               endIndex = udpBuffer.current.indexOf('0a', startIndex);
//             }
//           } else {
//             break;
//           }
//         }
//       }
//     });

//     socket.on('error', err => {
//       console.error('UdpSocketContext: UDP Socket Error:', err);
//       setIsConnectedToDevice(false);
//     });

//     socket.on('close', () => {
//       console.log('UdpSocketContext: UDP socket closed.');
//       setIsConnectedToDevice(false);
//     });

//     return () => {
//       if (socket && !socket._destroyed) {
//         socket.close();
//         console.log(
//           'UdpSocketContext: UDP socket closed by useEffect cleanup.',
//         );
//       }
//     };
//   }, [db, phoneIP]);

//   const sendUdpMessage = message => {
//     if (!udpSocketRef.current || udpSocketRef.current._destroyed) {
//       console.warn(
//         'UdpSocketContext: UDP Socket not ready or destroyed, cannot send message.',
//       );
//       return;
//     }
//     const msgBuffer = Buffer.from(message, 'utf8');
//     udpSocketRef.current.send(
//       msgBuffer,
//       0,
//       msgBuffer.length,
//       TARGET_DEVICE_PORT,
//       TARGET_DEVICE_IP,
//       err => {
//         if (err) {
//           console.error('UdpSocketContext: UDP Send Error:', err);
//         } else {
//           console.log(`UdpSocketContext: UDP message sent: "${message}"`);
//         }
//       },
//     );
//   };

//   const closeUdpSocket = () => {
//     if (udpSocketRef.current && !udpSocketRef.current._destroyed) {
//       udpSocketRef.current.close();
//       udpSocketRef.current = null;
//       setIsConnectedToDevice(false);
//       console.log('UdpSocketContext: UDP socket explicitly closed.');
//     }
//   };

//   const contextValue = {
//     db,
//     phoneIP,
//     setPhoneIP,
//     sendUdpMessage,
//     isConnectedToDevice,
//     closeUdpSocket,
//   };

//   return (
//     <UdpSocketContext.Provider value={contextValue}>
//       {children}
//     </UdpSocketContext.Provider>
//   );
// };

// export const useUdpSocket = () => {
//   const context = useContext(UdpSocketContext);
//   if (context === undefined) {
//     throw new Error('useUdpSocket must be used within a UdpSocketProvider');
//   }
//   return context;
// };
