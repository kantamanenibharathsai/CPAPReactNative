// import dgram from 'react-native-udp';
// import { Buffer } from 'buffer';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import { appendToDebugFile } from '../Screens/Login';
// import { parseCpapPacket } from './utils/Data';
// import {
//   getDBConnection,
//   saveHomeScreenDataWithDuplicateCheck,
// } from './database/Database';

// global.Buffer = Buffer;

// const LOCAL_PORT = 5000;
// const TARGET_DEVICE_IP = '192.168.36.7';
// const TARGET_DEVICE_PORT = 5000;
// const expectedHandshake = 'wifi_handshake\r\n';

// class NetworkService {
//   constructor() {
//     this.udpSocket = null;
//     this.db = null;
//     this.udpBuffer = '';
//     this.isConnectedToWizFi = false;
//     this.keepAliveInterval = null;
//     this.receivedPackets = [];
//     this.onConnectionSuccess = null;
//   }

//   async initialize(dbConnection) {
//     this.db = dbConnection;
//     await this.logToDebugFile('NetworkService initialized');
//   }

//   async logToDebugFile(message) {
//     try {
//       const timestamp = new Date().toISOString();
//       await appendToDebugFile(`[${timestamp}] ${message}`);
//     } catch (error) {
//       console.error('Failed to write to debug file:', error);
//     }
//   }

//   async startUdpService(ipAddress) {
//     if (this.udpSocket || !this.isConnectedToWizFi) return;

//     try {
//       await this.logToDebugFile(
//         `Starting UDP service on ${ipAddress}:${LOCAL_PORT}`,
//       );

//       this.udpSocket = dgram.createSocket('udp4');

//       this.udpSocket.bind(LOCAL_PORT, ipAddress, async () => {
//         await this.logToDebugFile(
//           `UDP socket bound to ${ipAddress}:${LOCAL_PORT}`,
//         );
//       });

//       this.udpSocket.on('message', this.handleIncomingMessage.bind(this));
//       this.udpSocket.on('error', this.handleSocketError.bind(this));
//       this.udpSocket.on('close', this.handleSocketClose.bind(this));

//       //   this.startKeepAlive();
//     } catch (error) {
//       await this.logToDebugFile(`UDP START ERROR: ${error.message}`);
//       console.error('UDP service start failed:', error);
//     }
//   }

//   async handleIncomingMessage(msg, rinfo) {
//     try {
//       const message = Buffer.from(msg).toString('utf8');
//       await this.logToDebugFile(
//         `RX from ${rinfo.address}:${rinfo.port}: ${message}`,
//       );

//       if (message === expectedHandshake) {
//         await this.logToDebugFile('Received handshake, sending ACK');
//         // this.sendUdpMessage('done\r\n');
//         // Notify parent component of successful handshake
//         this.startKeepAlive();
//         if (this.onConnectionSuccess) {
//           this.onConnectionSuccess();
//         }
//         return;
//       }

//       const receivedHex = msg.toString('hex');
//       await this.logToDebugFile(`RX HEX: ${receivedHex}`);
//       this.udpBuffer += receivedHex;

//       let startIndex = this.udpBuffer.indexOf('24');
//       let endIndex = this.udpBuffer.indexOf('0a', startIndex);

//       while (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
//         const potentialPacketHex = this.udpBuffer.substring(
//           startIndex,
//           startIndex + 70,
//         );

//         if (potentialPacketHex.length === 70) {
//           try {
//             const decoded = parseCpapPacket(potentialPacketHex);
//             await this.logToDebugFile(
//               `Decoded packet: ${JSON.stringify(decoded)}`,
//             );

//             if (this.db) {
//               try {
//                 const result = await saveHomeScreenDataWithDuplicateCheck(
//                   this.db,
//                   decoded,
//                 );
//                 if (result.success) {
//                   this.receivedPackets.push(decoded);
//                   await this.logToDebugFile('Packet saved to DB');
//                 } else if (result.reason === 'duplicate') {
//                   await this.logToDebugFile(
//                     'Duplicate packet detected, not saving',
//                   );
//                 } else {
//                   await this.logToDebugFile(`DB SAVE ERROR: ${result.error}`);
//                 }
//               } catch (e) {
//                 await this.logToDebugFile(`DB SAVE EXCEPTION: ${e.message}`);
//               }
//             }

//             this.udpBuffer = this.udpBuffer.substring(startIndex + 70);
//             startIndex = this.udpBuffer.indexOf('24');
//             endIndex = this.udpBuffer.indexOf('0a', startIndex);
//           } catch (e) {
//             await this.logToDebugFile(`Packet parse error: ${e.message}`);
//             this.udpBuffer = this.udpBuffer.substring(startIndex + 2);
//             startIndex = this.udpBuffer.indexOf('24');
//             endIndex = this.udpBuffer.indexOf('0a', startIndex);
//           }
//         } else {
//           break;
//         }
//       }
//     } catch (error) {
//       await this.logToDebugFile(`Message handling error: ${error.message}`);
//     }
//   }

//   async handleSocketError(err) {
//     await this.logToDebugFile(`UDP socket error: ${err.message}`);
//     console.log('UDP socket error:', err);
//   }

//   async handleSocketClose() {
//     await this.logToDebugFile('UDP socket closed');
//     console.log('UDP socket closed');
//     this.stopKeepAlive();
//     this.udpSocket = null;
//   }

//   startKeepAlive() {
//     if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);

//     this.sendUdpMessage('done\r\n');
//     this.keepAliveInterval = setInterval(() => {
//       this.sendUdpMessage('done\r\n');
//     }, 10000);

//     this.logToDebugFile('Keep-alive messages started');
//   }

//   stopKeepAlive() {
//     if (this.keepAliveInterval) {
//       clearInterval(this.keepAliveInterval);
//       this.keepAliveInterval = null;
//       this.logToDebugFile('Keep-alive messages stopped');
//     }
//   }

//   async sendUdpMessage(message = 'done\r\n') {
//     if (!this.udpSocket || !this.isConnectedToWizFi) return;

//     try {
//       const msgBuffer = Buffer.from(message, 'utf8');
//       await this.logToDebugFile(
//         `TX to ${TARGET_DEVICE_IP}:${TARGET_DEVICE_PORT}: ${message.trim()}`,
//       );

//       this.udpSocket.send(
//         msgBuffer,
//         0,
//         msgBuffer.length,
//         TARGET_DEVICE_PORT,
//         TARGET_DEVICE_IP,
//         async err => {
//           if (err) {
//             await this.logToDebugFile(`TX ERROR: ${err.message}`);
//           }
//         },
//       );
//     } catch (error) {
//       await this.logToDebugFile(`SEND ERROR: ${error.message}`);
//     }
//   }

//   async onWizFiConnected(ssid, ipAddress) {
//     this.isConnectedToWizFi = true;
//     await this.logToDebugFile(
//       `Connected to WizFi network: ${ssid} (${ipAddress})`,
//     );
//     await this.startUdpService(ipAddress);
//   }

//   async onWizFiDisconnected() {
//     this.isConnectedToWizFi = false;
//     await this.logToDebugFile('Disconnected from WizFi network');
//     this.stopUdpService();
//   }

//   stopUdpService() {
//     if (this.udpSocket) {
//       this.udpSocket.close();
//     }
//     this.stopKeepAlive();
//     this.udpBuffer = '';
//   }
// }

// export const networkService = new NetworkService();
