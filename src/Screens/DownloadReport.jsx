import React from 'react';
import {
  Platform,
  Alert,
  Linking,
  View,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import { getLatestPatientProfile, getDBConnection } from '../database/Database';
import RNFS from 'react-native-fs';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { Buffer } from 'buffer';

const { width } = Dimensions.get('window');

class DownloadReport {
  constructor() {
    this.requestStoragePermission = this.requestStoragePermission.bind(this);
    this.getDownloadsDirectory = this.getDownloadsDirectory.bind(this);
    this.moveToDownloadsFolder = this.moveToDownloadsFolder.bind(this);
    this.makeFileAccessible = this.makeFileAccessible.bind(this);
    this.openPDFFile = this.openPDFFile.bind(this);
    this.createNoDataImage = this.createNoDataImage.bind(this);
    this.generateUsageHoursPDF = this.generateUsageHoursPDF.bind(this);
    this.renderUsageHoursChart = this.renderUsageHoursChart.bind(this);
    this.captureChartImage = this.captureChartImage.bind(this);
    this.calculateAge = this.calculateAge.bind(this);
    this.getPDFDateDisplay = this.getPDFDateDisplay.bind(this);
  }

  async requestStoragePermission() {
    if (Platform.OS !== 'android') return true;

    try {
      const permission =
        Platform.Version >= 33
          ? PERMISSIONS.ANDROID.READ_MEDIA_IMAGES
          : PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE;
      const requestResult = await request(permission);
      if (requestResult === RESULTS.DENIED) {
        return false;
      }
      if (requestResult === RESULTS.BLOCKED) {
        return false;
      }
      return requestResult === RESULTS.GRANTED;
    } catch (error) {
      return false;
    }
  }

  async getDownloadsDirectory() {
    if (Platform.OS === 'ios') {
      return RNFS.DocumentDirectoryPath;
    }
    return RNFS.ExternalDirectoryPath || RNFS.DocumentDirectoryPath;
  }

  async moveToDownloadsFolder(sourcePath, fileName) {
    if (Platform.OS !== 'android') return sourcePath;

    try {
      const downloadsPaths = [
        '/storage/emulated/0/Download',
        '/storage/emulated/0/Downloads',
        `${RNFS.ExternalStorageDirectoryPath}/Download`,
        `${RNFS.ExternalStorageDirectoryPath}/Downloads`,
      ];

      let targetDir = null;

      for (const path of downloadsPaths) {
        try {
          const exists = await RNFS.exists(path);
          if (exists) {
            targetDir = path;
            break;
          }
        } catch (error) {}
      }

      if (!targetDir) {
        targetDir = '/storage/emulated/0/Download';
        try {
          await RNFS.mkdir(targetDir);
        } catch (error) {
          return sourcePath;
        }
      }

      const targetPath = `${targetDir}/${fileName}`;
      await RNFS.moveFile(sourcePath, targetPath);
      return targetPath;
    } catch (error) {
      return sourcePath;
    }
  }

  async makeFileAccessible(filePath) {
    if (Platform.OS !== 'android') return filePath;

    try {
      const RNFetchBlob = require('rn-fetch-blob').default;

      await RNFetchBlob.fs.scanFile([
        {
          path: filePath,
          mime: 'application/pdf',
        },
      ]);
      return filePath;
    } catch (error) {
      return filePath;
    }
  }

  async openPDFFile(filePath, fileName) {
    try {
      try {
        const FileViewer = require('react-native-file-viewer').default;
        await FileViewer.open(filePath, {
          showOpenWithDialog: true,
          showAppsSuggestions: true,
        });
        return true;
      } catch (fileViewerError) {
        if (Platform.OS === 'android') {
          try {
            const RNFetchBlob = require('rn-fetch-blob').default;
            await RNFetchBlob.android.actionViewIntent(
              filePath,
              'application/pdf',
            );
            return true;
          } catch (systemError) {
            try {
              await Linking.openURL(
                'content://com.android.externalstorage.documents/document/primary:Download',
              );
              Alert.alert(
                'Download Complete ✅',
                `Report saved successfully!\n\nFile: ${fileName}\nLocation: Downloads folder\n\nThe Downloads folder is now open. Please tap on the PDF file to open it.`,
                [
                  { text: 'OK', style: 'default' },
                  {
                    text: 'Open in Browser',
                    onPress: () => {
                      const Share = require('react-native-share').default;
                      Share.open({
                        url: `file://${filePath}`,
                        type: 'application/pdf',
                        title: 'Open PDF with...',
                        showAppsToView: true,
                      }).catch(err => {
                        Linking.openURL(`file://${filePath}`).catch(
                          linkErr => {},
                        );
                      });
                    },
                  },
                ],
              );
              return true;
            } catch (downloadsError) {
              return false;
            }
          }
        } else {
          try {
            await Linking.openURL(`file://${filePath}`);
            return true;
          } catch (iosError) {
            return false;
          }
        }
      }
    } catch (error) {
      return false;
    }
  }

  async createNoDataImage() {
    try {
      const noDataSvg = `
      <svg width="400" height="250" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="250" rx="16" fill="#434b55" stroke="#6f757d" stroke-width="2" stroke-dasharray="10,5"/>
        <text x="200" y="130" font-family="Arial, sans-serif" font-size="18" font-weight="600" fill="#fff" text-anchor="middle">No Usage Data Available</text>
      </svg>
    `;

      const base64Svg = Buffer.from(noDataSvg, 'utf8').toString('base64');
      return `data:image/svg+xml;base64,${base64Svg}`;
    } catch (error) {
      const fallbackSvg =
        '<svg width="400" height="250" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="250" fill="#f0f0f0"/><text x="200" y="130" font-family="Arial" font-size="16" fill="#666" text-anchor="middle">No Data Available</text></svg>';
      return (
        'data:image/svg+xml;base64,' +
        Buffer.from(fallbackSvg, 'utf8').toString('base64')
      );
    }
  }

  getPDFDateDisplay(selectedPeriod, currentChartDate) {
    if (!currentChartDate) return '';

    try {
      if (selectedPeriod === 'Week') {
        const startOfWeek = currentChartDate
          .clone()
          .startOf('isoWeek')
          .format('MMM DD, YYYY');
        const endOfWeek = currentChartDate
          .clone()
          .endOf('isoWeek')
          .format('MMM DD, YYYY');
        return `(${startOfWeek} - ${endOfWeek})`;
      } else if (selectedPeriod === 'Month') {
        return `(${currentChartDate.clone().format('MMMM YYYY')})`;
      }
      return `(${currentChartDate.format('MMM DD, YYYY')})`;
    } catch (error) {
      return '';
    }
  }

  calculateAge(dob) {
    if (!dob) return null;

    try {
      let birthDate;

      if (typeof dob === 'string') {
        if (dob.includes('/')) {
          const [day, month, year] = dob.split('/');
          birthDate = new Date(year, month - 1, day);
        } else if (dob.includes('-')) {
          birthDate = new Date(dob);
        } else {
          return null;
        }
      } else if (dob instanceof Date) {
        birthDate = dob;
      } else {
        return null;
      }

      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDate.getDate())
      ) {
        age--;
      }

      return age >= 0 ? age : null;
    } catch (error) {
      return null;
    }
  }

  renderUsageHoursChart({ chartData, selectedPeriod }) {
    if (!chartData || !Array.isArray(chartData)) {
      return null;
    }
    const yAxisMax = 24;
    const yAxisLabels = [0, 4, 8, 12, 16, 20, 24];

    return React.createElement(
      View,
      { style: pdfStyles.chartContainer },
      React.createElement(
        View,
        { style: pdfStyles.chartContent },
        React.createElement(
          View,
          { style: pdfStyles.barsContainer },
          chartData.map((data, index) => {
            const barValue = data?.value || 0;
            if (selectedPeriod === 'Day') {
              const totalMinutesInDay = 24 * 60;
              const leftPosition =
                ((data?.positionInMinutes || 0) / totalMinutesInDay) * 100;

              return React.createElement(
                View,
                {
                  key: index,
                  style: [
                    pdfStyles.chartBarContainer,
                    { left: `${leftPosition}%` },
                  ],
                },
                barValue > 0
                  ? React.createElement(View, {
                      style: pdfStyles.horizontalBar,
                    })
                  : null,
              );
            } else {
              const height = Math.max(0, (barValue / yAxisMax) * 100);
              const containerStyle =
                selectedPeriod === 'Week'
                  ? pdfStyles.weeklyChartBarContainer
                  : pdfStyles.monthlyChartBarContainer;

              return React.createElement(
                View,
                {
                  key: index,
                  style: containerStyle,
                },
                React.createElement(View, {
                  style: [
                    pdfStyles.bar,
                    { height: `${height}%`, backgroundColor: '#53a3ff' },
                  ],
                }),
              );
            }
          }),
        ),
        selectedPeriod !== 'Day'
          ? React.createElement(
              View,
              { style: pdfStyles.yAxisLabelsRight },
              yAxisLabels
                .slice()
                .reverse()
                .map((label, index) =>
                  React.createElement(
                    Text,
                    {
                      key: index,
                      style: pdfStyles.yAxisLabel,
                    },
                    String(label),
                  ),
                ),
            )
          : null,
        this.renderXAxisLabels(selectedPeriod, chartData),
      ),
    );
  }

  renderXAxisLabels(selectedPeriod, chartData, activeTab, screenData) {
    if (selectedPeriod === 'Day') {
      return activeTab !== 'Usage Hours'
        ? React.createElement(
            View,
            {
              style: [
                pdfStyles.xAxisLabelsDayContainer,
                selectedPeriod === 'Day' &&
                  activeTab === 'Usage Hours' &&
                  pdfStyles.xAxisLabelUsageHrs,
              ],
            },
            screenData.width > screenData.height
              ? Array.from({ length: 24 }, (_, i) => i)
                  .filter(hour => hour % 2 !== 0)
                  .map((hour, i) =>
                    React.createElement(
                      Text,
                      {
                        key: i,
                        style: [
                          pdfStyles.xAxisLabelDay,
                          {
                            left: `${(hour / 23) * 99 + -1}%`,
                            transform: [
                              {
                                translateX:
                                  hour === 0 ? 0 : hour === 23 ? -25 : -15,
                              },
                            ],
                            paddingLeft: 4,
                          },
                        ],
                      },
                      String(hour).padStart(2, '0') + ':00',
                    ),
                  )
              : [0, 6, 12, 18, 23].map((hour, i) =>
                  React.createElement(
                    Text,
                    {
                      key: i,
                      style: [
                        pdfStyles.xAxisLabelDay,
                        {
                          left: `${(hour / 23) * 98}%`,
                          transform: [
                            {
                              translateX:
                                hour === 0 ? 0 : hour === 23 ? -30 : -15,
                            },
                          ],
                          paddingLeft: 4,
                        },
                      ],
                    },
                    String(hour).padStart(2, '0') + ':00',
                  ),
                ),
          )
        : React.createElement(
            View,
            {
              style: [
                pdfStyles.xAxisLabelsDayContainer,
                selectedPeriod === 'Day' &&
                  activeTab === 'Usage Hours' &&
                  pdfStyles.xAxisLabelUsageHrs,
              ],
            },
            screenData.width > screenData.height
              ? Array.from({ length: 24 }, (_, i) => i).map((hour, i) =>
                  React.createElement(
                    Text,
                    {
                      key: i,
                      style: [
                        pdfStyles.xAxisLabelDay,
                        {
                          left: `${(hour / 24) * 99 + -1}%`,
                          transform: [
                            {
                              translateX: 10,
                            },
                          ],
                          paddingLeft: 1,
                        },
                      ],
                    },
                    String(hour).padStart(2, '0'),
                  ),
                )
              : Array.from({ length: 24 }, (_, i) => i).map((hour, i) =>
                  React.createElement(
                    Text,
                    {
                      key: i,
                      style: [
                        pdfStyles.xAxisLabelDay,
                        {
                          left: `${(hour / 24) * 97}%`,
                          bottom: 8,
                          paddingLeft: 3,
                        },
                      ],
                    },
                    String(hour).padStart(2, '0'),
                  ),
                ),
          );
    } else if (selectedPeriod === 'Week') {
      return React.createElement(
        View,
        { style: pdfStyles.xAxisLabelsWeekly },
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) =>
          React.createElement(
            Text,
            {
              key: index,
              style: pdfStyles.xAxisLabelWeekly,
            },
            day,
          ),
        ),
      );
    } else {
      return React.createElement(
        View,
        { style: pdfStyles.xAxisLabelsMonthly },
        chartData.map((data, index) => {
          const dayNum = index + 1;
          if (dayNum % 2 !== 0) {
            return React.createElement(
              Text,
              {
                key: index,
                style: [
                  pdfStyles.xAxisLabelMonthly,
                  {
                    left: `${
                      (index / Math.max(1, chartData.length - 1)) * 100
                    }%`,
                    transform: [{ translateX: -15 }],
                    width: 30,
                    textAlign: 'center',
                  },
                ],
              },
              dayNum.toString(),
            );
          }
          return null;
        }),
      );
    }
  }
  renderEventsChart({ chartData, selectedPeriod }) {
    if (!chartData || !Array.isArray(chartData)) {
      return null;
    }
    const yAxisMax = 40;
    const yAxisLabels = [1, 2, 4, 10, 20, 40];
    return React.createElement(
      View,
      { style: pdfStyles.chartContainer },
      React.createElement(
        View,
        { style: pdfStyles.chartContent },
        React.createElement(
          View,
          { style: pdfStyles.barsContainer },
          chartData.map((data, index) => {
            const barValue = data?.value || 0;
            if (selectedPeriod === 'Day') {
              const totalMinutesInDay = 24 * 60;
              const leftPosition =
                ((data?.positionInMinutes || 0) / totalMinutesInDay) * 100;

              return React.createElement(
                View,
                {
                  key: index,
                  style: [
                    pdfStyles.chartBarContainer,
                    { left: `${leftPosition}%` },
                  ],
                },
                barValue > 0
                  ? React.createElement(View, {
                      style: pdfStyles.horizontalBar,
                    })
                  : null,
              );
            } else {
              const height = Math.max(0, (barValue / yAxisMax) * 100);
              const containerStyle =
                selectedPeriod === 'Week'
                  ? pdfStyles.weeklyChartBarContainer
                  : pdfStyles.monthlyChartBarContainer;

              return React.createElement(
                View,
                {
                  key: index,
                  style: containerStyle,
                },
                React.createElement(View, {
                  style: [
                    pdfStyles.bar,
                    { height: `${height}%`, backgroundColor: '#53a3ff' },
                  ],
                }),
              );
            }
          }),
        ),
        selectedPeriod !== 'Day'
          ? React.createElement(
              View,
              { style: pdfStyles.yAxisLabelsRight },
              yAxisLabels
                .slice()
                .reverse()
                .map((label, index) =>
                  React.createElement(
                    Text,
                    {
                      key: index,
                      style: pdfStyles.yAxisLabel,
                    },
                    String(label),
                  ),
                ),
            )
          : null,
        this.renderXAxisLabels(selectedPeriod, chartData),
      ),
    );
  }
  async captureChartImage({ chartData }) {
    try {
      const hasUsageData = chartData && chartData.some(item => item?.hasData);
      if (!hasUsageData) {
        return await this.createNoDataImage();
      }
      return await this.createNoDataImage();
    } catch (error) {
      return await this.createNoDataImage();
    }
  }
  async captureEventsChartImage({ chartData }) {
    try {
      const hasEventsData = chartData && chartData.some(item => item?.hasData);
      if (!hasEventsData) {
        return await this.createNoDataImage();
      }
      return await this.createNoDataImage();
    } catch (error) {
      return await this.createNoDataImage();
    }
  }
  async generateUsageHoursPDF({
    usageHoursData,
    eventsData,
    selectedPeriod,
    currentChartDate,
    usageHoursChartImage = null,
    eventsChartImage = null,
    patientProfile = null,
    activeTab = 'Usage Hours',
  }) {
    let tempFiles = [];

    try {
      const hasUsageData =
        usageHoursData && usageHoursData.some(item => item?.hasData);
      const hasEventsData =
        eventsData && eventsData.some(item => item?.hasData);
      let usageHoursChartUri;
      if (usageHoursChartImage && hasUsageData) {
        usageHoursChartUri = usageHoursChartImage;
      } else {
        usageHoursChartUri = await this.createNoDataImage();
      }

      let eventsChartUri;
      if (eventsChartImage && hasEventsData) {
        eventsChartUri = eventsChartImage;
      } else {
        eventsChartUri = await this.createNoDataImage();
      }
      let profile = patientProfile;
      if (!profile) {
        try {
          const db = await getDBConnection();
          profile = await getLatestPatientProfile(db);
        } catch (dbError) {}
      }
      if (!profile) {
        profile = {
          name: 'Patient Name Not Set',
          dob: 'DOB Not Set',
        };
      }
      let logoBase64;
      try {
        logoBase64 = await this.generateLogo();
      } catch (logoError) {
        logoBase64 = '';
      }

      const patientAge = this.calculateAge(profile.dob);
      const ageText = patientAge ? ` (Age ${patientAge} years)` : '';

      const htmlContent = this.generateHTMLContent({
        logoBase64,
        profile,
        ageText,
        selectedPeriod,
        currentChartDate,
        usageHoursChartUri,
        eventsChartUri,
        hasUsageData,
        hasEventsData,
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `Sleep_Therapy_Report_${timestamp}.pdf`;
      const tempDirectory = await this.getDownloadsDirectory();
      try {
        const dirExists = await RNFS.exists(tempDirectory);
        if (!dirExists) {
          await RNFS.mkdir(tempDirectory);
        }
      } catch (error) {}
      const options = {
        html: htmlContent,
        fileName: fileName.replace('.pdf', ''),
        directory: tempDirectory,
        base64: false,
        height: 842,
        width: 595,
        padding: 24,
      };
      let file;
      try {
        const pdfPromise = RNHTMLtoPDF.convert(options);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('PDF generation timeout')), 30000),
        );

        file = await Promise.race([pdfPromise, timeoutPromise]);
        tempFiles.push(file.filePath);
      } catch (pdfError) {
        throw new Error(`PDF generation failed: ${pdfError.message}`);
      }
      let finalFilePath;
      try {
        finalFilePath = await this.moveToDownloadsFolder(
          file.filePath,
          fileName,
        );
      } catch (moveError) {
        finalFilePath = file.filePath;
      }
      let accessibleFilePath;
      try {
        accessibleFilePath = await this.makeFileAccessible(finalFilePath);
      } catch (accessError) {
        accessibleFilePath = finalFilePath;
      }
      const openSuccess = await this.openPDFFile(accessibleFilePath, fileName);

      if (!openSuccess) {
        this.showFallbackAlert(fileName);
      }
      usageHoursChartUri = null;
      eventsChartUri = null;
      logoBase64 = null;
    } catch (error) {
      Alert.alert(
        'Error',
        `Failed to generate Sleep Therapy report: ${
          error.message || 'Unknown error'
        }\n\nPlease ensure storage permissions are granted and try again.`,
        [{ text: 'OK', style: 'default' }],
      );
    } finally {
      for (const tempFile of tempFiles) {
        try {
          const exists = await RNFS.exists(tempFile);
          if (exists) {
            await RNFS.unlink(tempFile);
          }
        } catch (cleanupError) {}
      }
      if (global.gc) {
        try {
          global.gc();
        } catch (gcError) {}
      }
    }
  }

  async generateLogo() {
    let logoBase64 = '';

    try {
      if (Platform.OS === 'android') {
        try {
          const assetPath = 'imeds_logo.png';
          logoBase64 = await RNFS.readFileAssets(assetPath, 'base64');
        } catch (assetError) {}
      } else {
        const iosPath = `${RNFS.MainBundlePath}/Imeds_Logo.png`;
        logoBase64 = await RNFS.readFile(iosPath, 'base64');
      }
    } catch (error) {}
    if (!logoBase64) {
      const svgLogo = `<svg width="80" height="80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="8" fill="#2563eb"/><text x="40" y="35" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle">iMeds</text><text x="40" y="55" font-family="Arial, sans-serif" font-size="10" fill="#93c5fd" text-anchor="middle">Health</text></svg>`;
      logoBase64 = Buffer.from(svgLogo, 'utf8').toString('base64');
    }

    return logoBase64;
  }

  generateHTMLContent({
    logoBase64,
    profile,
    ageText,
    selectedPeriod,
    currentChartDate,
    usageHoursChartUri,
    eventsChartUri,
    hasUsageData,
    hasEventsData,
  }) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { 
      Arial, sans-serif; 
      0; 
      padding: 20px; 
      font-size: 12px;
    }
    .header { 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      30px; 
    }
    .logo { 
      width: 60px; 
      height: 60px; 
      object-fit: contain; 
    }
    .header-center { 
      display: flex; 
      justify-content: center; 
      align-items: center; 
      width: 100%; 
    }
    .report-title { 
      font-size: 20px; 
      font-weight: bold; 
      color: #333; 
      0; 
      text-align: center; 
      transform: translateX(10px);
    }
    .patient-info { 
      text-align: right; 
      min-width: 180px; 
    }
    .patient-name { 
      font-size: 14px; 
      font-weight: bold; 
      5px; 
    }
    .patient-dob { 
      font-size: 12px; 
      color: #666; 
    }
    .patient-licence { 
      font-size: 10px; 
      color: #888; 
      3px; 
    }
    .chart-section { 
      25px; 
      page-break-inside: avoid;
    }
    .chart-title { 
      font-size: 16px; 
      font-weight: bold; 
      color: #333; 
      15px; 
    }
    .period-info { 
      font-size: 12px; 
      color: #666; 
      font-weight: normal; 
    }
    .chart-container { 
      width: 100%; 
      0; 
      padding: 0; 
      display: block; 
      text-align: center;
    }
    .chart-image {
      width: 100%; 
      height: auto; 
      display: block; 
      max-height: 300px; 
      object-fit: contain;
      0 auto;
    }
    .no-data-message {
      font-size: 14px;
      color: #666;
      text-align: center;
      padding: 40px;
      border: 2px dashed #ccc;
      border-radius: 8px;
      background-color: #f9f9f9;
      10px 0;
    }
    .divider {
      border: 1px solid #ddd; 
      20px 0 15px 0;
    }
  </style>
</head>
<body>
  <div class="header">
    ${
      logoBase64
        ? `<img src="data:image/${
            logoBase64.includes('<svg') ? 'svg+xml' : 'png'
          };base64,${logoBase64}" class="logo" alt="Company Logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />`
        : ''
    }
    <div class="logo-fallback" style="width: 60px; height: 60px; border: 2px solid #2563eb; border-radius: 8px; display: ${
      logoBase64 ? 'none' : 'flex'
    }; align-items: center; justify-content: center; background: #f8fafc; color: #2563eb; font-weight: bold; font-size: 12px;">iMeds</div>

    <div class="header-center">
      <h1 class="report-title">Sleep Therapy Report</h1>
    </div>

    <div class="patient-info">
      <div class="patient-name">${profile.name || 'N/A'}</div>
      <div class="patient-dob">DOB: ${profile.dob || 'N/A'}${ageText}</div>
      <div class="patient-licence">AS10, SN 23181028979</div>
    </div>
  </div>

  <div class="chart-section">
    <hr class="divider" />
    <h1 class="chart-title">
      Usage Hours <span class="period-info">${this.getPDFDateDisplay(
        selectedPeriod,
        currentChartDate,
      )}</span>
    </h1><br><br>
    <div class="chart-container">
      ${
        !hasUsageData
          ? '<div class="no-data-message">No Usage Hours Data Available for Selected Period</div>'
          : `<img src="${usageHoursChartUri}" class="chart-image" alt="Usage Hours Chart" />`
      }<br><br><br>
    </div>
  </div>

  <div class="chart-section">
    <hr class="divider" />
    <h1 class="chart-title">
      Events <span class="period-info">${this.getPDFDateDisplay(
        selectedPeriod,
        currentChartDate,
      )}</span>
    </h1><br><br>
    <div class="chart-container">
      ${
        !hasEventsData
          ? '<div class="no-data-message">No Events Data Available for Selected Period</div>'
          : `<img src="${eventsChartUri}" class="chart-image" alt="Events Chart" />`
      }
    </div>
  </div>
</body>
</html>
`;
  }

  showFallbackAlert(fileName) {
    const locationMessage =
      Platform.OS === 'android' ? 'Downloads folder' : 'Files app';
    Alert.alert(
      'Download Complete ✅',
      `Usage Hours report saved successfully!\n\nFile: ${fileName}\nLocation: ${locationMessage}\n\nPlease open your file manager to view the PDF.`,
      [
        { text: 'OK', style: 'default' },
        ...(Platform.OS === 'android'
          ? [
              {
                text: 'Open Downloads',
                onPress: () => {
                  Linking.openURL(
                    'content://com.android.externalstorage.documents/document/primary:Download',
                  ).catch(() => {
                    Linking.openURL(
                      'content://com.android.documentsui.picker/',
                    ).catch(() => {});
                  });
                },
              },
              {
                text: 'Get PDF Reader',
                onPress: () => {
                  Linking.openURL(
                    'https://play.google.com/store/apps/details?id=com.adobe.reader',
                  ).catch(() =>
                    Linking.openURL('market://search?q=pdf%20reader&c=apps'),
                  );
                },
              },
            ]
          : []),
      ],
    );
  }
}

const pdfStyles = StyleSheet.create({
  chartContainer: {
    backgroundColor: '#434b55',
    borderRadius: 16,
    overflow: 'hidden',
    padding: 20,
    width: width * 0.93,
    height: 260,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderStyle: 'solid',
    borderWidth: 3,
    borderColor: 'transparent',
    position: 'relative',
  },
  chartContent: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    position: 'relative',
    bottom: 30,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 150,
    width: '100%',
    position: 'relative',
    paddingHorizontal: 5,
  },
  chartBarContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 8,
  },
  weeklyChartBarContainer: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 8,
    marginHorizontal: 2,
    position: 'relative',
  },
  monthlyChartBarContainer: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 5,
    marginHorizontal: 1,
    position: 'relative',
  },
  bar: {
    width: '100%',
    backgroundColor: '#53a3ff',
    borderRadius: 0,
  },
  horizontalBar: {
    width: '100%',
    height: 2,
    backgroundColor: '#53a3ff',
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -1 }],
  },
  yAxisLabelsRight: {
    justifyContent: 'space-between',
    height: '100%',
    position: 'absolute',
    right: -17,
    paddingRight: 0,
    transform: [{ translateY: 10 }],
  },
  yAxisLabel: {
    color: '#a1a9b3',
    fontSize: 8,
    fontWeight: '400',
    fontFamily: 'Inter',
    textAlign: 'left',
  },
  xAxisLabelWeekly: {
    color: '#a1a9b3',
    fontSize: 10,
    fontWeight: '400',
    fontFamily: 'Inter',
    textAlign: 'center',
    flex: 1,
  },
  xAxisLabelsMonthly: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 0,
    width: '100%',
    position: 'absolute',
    bottom: -35,
    height: 20,
  },
  xAxisLabelMonthly: {
    color: '#a1a9b3',
    fontSize: 8,
    fontWeight: '400',
    fontFamily: 'Inter',
    textAlign: 'center',
    position: 'absolute',
  },
  xAxisLabelsDayContainer: {
    position: 'absolute',
    bottom: -40,
    left: 0,
    width: '100%',
    height: 20,
    justifyContent: 'flex-start',
  },
  xAxisLabelDay: {
    position: 'absolute',
    fontSize: 8,
    color: '#a1a9b3',
    fontWeight: '400',
    fontFamily: 'Inter',
    textAlign: 'center',
  },
  xAxisLabelsWeekly: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
    paddingHorizontal: 0,
    width: '100%',
    position: 'absolute',
    bottom: -35,
    height: 20,
  },
});

export default new DownloadReport();
