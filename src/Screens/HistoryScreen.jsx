import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  Platform,
  TouchableOpacity,
  Linking,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import FeatherIcon from 'react-native-vector-icons/Feather';
import DownloadReport from './DownloadReport';
import moment from 'moment';
import { captureRef } from 'react-native-view-shot';
import {
  getDBConnection,
  getAllSessionsForDate,
  getHomeScreenDataForDateRange,
  getLatestPatientProfile,
} from '../database/Database';
import {
  getUsageScore,
  getMaskSealScore,
  getAHIScore,
  getMaskOnOffScore,
} from '../utils/Data';

const getChartAxisTitles = (tabName, period) => {
  let xAxisTitle = '';
  let yAxisTitle = '';

  switch (period) {
    case 'Day':
      xAxisTitle = 'Times of Day (hrs)';
      break;
    case 'Week':
      xAxisTitle = 'Days of Week';
      break;
    case 'Month':
      xAxisTitle = 'Dates of Month';
      break;
    default:
      xAxisTitle = 'X-Axis';
  }

  switch (tabName) {
    case 'Usage Hours':
      yAxisTitle =
        period === 'Day' ? 'Usage Duration (hrs)' : 'Usage Duration (hrs)';
      break;
    case 'Mask Seal':
      yAxisTitle = period === 'Day' ? 'Seal Score' : 'Average Seal Score';
      break;
    case 'Events':
      yAxisTitle = period === 'Day' ? 'Events/Hr' : 'Average Events/Hr';
      break;
    case 'Mask On/Off':
      yAxisTitle = period === 'Day' ? 'On/Off Count' : 'Average On/Off Count';
      break;
    default:
      yAxisTitle = period === 'Day' ? 'CPAP Score' : 'Average CPAP Score';
      break;
  }

  return {
    xAxis: xAxisTitle,
    yAxis: yAxisTitle,
  };
};
const VERTICAL_BAR_PLOT_HEIGHT = 170;

const HistoryScreen = ({ route }) => {
  const [selectedPeriod, setSelectedPeriod] = useState('Week');
  const [currentChartDate, setCurrentChartDate] = useState(moment());
  const [activeTab, setActiveTab] = useState('Usage Hours');
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [db, setDb] = useState(null);
  const [activeBarTooltip, setActiveBarTooltip] = useState(null);
  const [screenData, setScreenData] = useState(Dimensions.get('window'));
  const chartContainerRef = useRef(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadCount, setDownloadCount] = useState(0);
  const lastSelectedDateRef = useRef(moment());
  const legendData = getChartAxisTitles(activeTab, selectedPeriod);
  const tabDenominators = {
    'Usage Hours': 12,
    'Mask Seal': 20,
    Events: 40,
    'Mask On/Off': 5,
    'Total CPAP Score': 100,
  };
  const getUnitForTab = tabName => {
    switch (tabName) {
      case 'Usage Hours':
        return 'hrs';
      case 'Mask Seal':
        return 'score';
      case 'Events':
        return 'events/hr';
      case 'Mask On/Off':
        return 'count';
      case 'Total CPAP Score':
        return 'score';
      default:
        return '';
    }
  };
  useEffect(() => {
    const initDB = async () => {
      try {
        const database = await getDBConnection();
        setDb(database);
      } catch (error) {}
    };
    initDB();
  }, []);

  useEffect(() => {
    const onChange = result => {
      setScreenData(result.window);
    };

    const subscription = Dimensions.addEventListener('change', onChange);
    return () => subscription?.remove();
  }, []);
  useEffect(() => {
    setActiveBarTooltip(null);
    if (route.params?.activeTab) {
      setActiveTab(route.params.activeTab);
    }

    if (route.params?.selectedDate) {
      const navigatedDate = moment(route.params.selectedDate);
      setCurrentChartDate(navigatedDate);
      lastSelectedDateRef.current = navigatedDate;

      if (route.params?.selectedPeriod) {
        setSelectedPeriod(route.params.selectedPeriod);
      } else {
        setSelectedPeriod('Day');
      }
    }
  }, [route.params?.activeTab, route.params?.selectedDate]);
  useEffect(() => {
    if (db) {
      fetchChartData(lastSelectedDateRef.current);
    }
  }, [db, currentChartDate, selectedPeriod, activeTab]);

  const handleDownloadPress = async () => {
    if (isDownloading) {
      Alert.alert(
        'Download in Progress',
        'Please wait for the current download to complete before starting another.',
        [{ text: 'OK', style: 'default' }],
      );
      return;
    }
    if (downloadCount >= 3) {
      Alert.alert(
        'Too Many Downloads',
        'Please wait a moment before downloading another report to prevent app instability.',
        [
          { text: 'OK', style: 'default' },
          {
            text: 'Reset Count',
            onPress: () => setDownloadCount(0),
          },
        ],
      );
      return;
    }

    try {
      setIsDownloading(true);
      setDownloadCount(prev => prev + 1);
      const hasPermission = await DownloadReport.requestStoragePermission();
      if (!hasPermission) {
        Alert.alert(
          'Permission Required',
          'Storage permission is required to save PDF reports. Please grant permission to download reports.',
          [
            {
              text: 'Cancel',
              style: 'cancel',
            },
            {
              text: 'Try Again',
              onPress: () => {},
            },
            {
              text: 'Open Settings',
              onPress: () => {
                if (Platform.OS === 'android') {
                  Linking.openSettings();
                } else {
                  Linking.openURL('app-settings:');
                }
              },
            },
          ],
        );
        return;
      }
      let profile = null;
      try {
        if (db) {
          profile = await getLatestPatientProfile(db);
        }
      } catch (dbError) {}

      if (!profile) {
        profile = {
          name: 'Patient Name Not Set',
          dob: 'DOB Not Set',
        };
      }
      let usageHoursData = [];
      let eventsData = [];

      try {
        if (db) {
          usageHoursData = await fetchChartDataForTab('Usage Hours');
          if (!Array.isArray(usageHoursData)) usageHoursData = [];
        }
      } catch (error) {
        usageHoursData = [];
      }

      try {
        if (db) {
          eventsData = await fetchChartDataForTab('Events');
          if (!Array.isArray(eventsData)) eventsData = [];
        }
      } catch (error) {
        eventsData = [];
      }
      let usageHoursChartImage = null;
      let eventsChartImage = null;
      const originalTab = activeTab;
      setActiveBarTooltip(null);
      await new Promise(resolve => setTimeout(resolve, 500));
      if (usageHoursData && usageHoursData.some(item => item?.hasData)) {
        if (activeTab !== 'Usage Hours') {
          setActiveTab('Usage Hours');
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

        try {
          if (chartContainerRef.current) {
            const capturePromise = captureRef(chartContainerRef, {
              format: 'png',
              quality: 0.6,
              result: 'data-uri',
              width: 800,
              height: 400,
            });

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('Chart capture timeout')),
                10000,
              ),
            );

            usageHoursChartImage = await Promise.race([
              capturePromise,
              timeoutPromise,
            ]);
            await new Promise(resolve => setTimeout(resolve, 300));
          } else {
          }
        } catch (error) {
          usageHoursChartImage = null;
        }
      }
      if (eventsData && eventsData.some(item => item?.hasData)) {
        if (activeTab !== 'Events') {
          setActiveTab('Events');
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

        try {
          if (chartContainerRef.current) {
            const capturePromise = captureRef(chartContainerRef, {
              format: 'png',
              quality: 0.6,
              result: 'data-uri',
              width: 800,
              height: 400,
            });
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('Chart capture timeout')),
                10000,
              ),
            );
            eventsChartImage = await Promise.race([
              capturePromise,
              timeoutPromise,
            ]);
            await new Promise(resolve => setTimeout(resolve, 300));
          } else {
          }
        } catch (error) {
          eventsChartImage = null;
        }
      }
      if (activeTab !== originalTab) {
        setActiveTab(originalTab);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      try {
        await DownloadReport.generateUsageHoursPDF({
          usageHoursData: usageHoursData || [],
          eventsData: eventsData || [],
          selectedPeriod: selectedPeriod || 'Week',
          currentChartDate: currentChartDate || moment(),
          usageHoursChartImage: usageHoursChartImage,
          eventsChartImage: eventsChartImage,
          patientProfile: profile,
          activeTab: originalTab || 'Usage Hours',
        });
        usageHoursChartImage = null;
        eventsChartImage = null;
        if (global.gc) {
          global.gc();
        }
      } catch (pdfError) {
        throw pdfError;
      }
    } catch (error) {
      let errorMessage = 'Failed to generate report. ';
      if (error.message.includes('timeout')) {
        errorMessage += 'The operation timed out. Please try again.';
      } else if (error.message.includes('permission')) {
        errorMessage += 'Storage permission is required.';
      } else if (error.message.includes('memory')) {
        errorMessage +=
          'Insufficient memory. Please close other apps and try again.';
      } else {
        errorMessage += error.message || 'Unknown error occurred.';
      }

      Alert.alert('Error', errorMessage, [{ text: 'OK', style: 'default' }]);
    } finally {
      setIsDownloading(false);
      setActiveBarTooltip(null);
      setTimeout(() => {
        setDownloadCount(prev => Math.max(0, prev - 1));
      }, 30000);
    }
  };

  const fetchChartData = async (dateForFetch = currentChartDate) => {
    if (!db) return;
    setLoading(true);
    try {
      let data = [];
      if (selectedPeriod === 'Day') {
        const dateStr = dateForFetch.format('YYYY-MM-DD');
        const sessions = await getAllSessionsForDate(db, dateStr);

        if (sessions && sessions.length > 0) {
          const allSessionParts = [];

          // Process current day sessions
          sessions.forEach(session => {
            const usageHrs = session.session_Usage_hrs || 0;
            const usageMins = session.session_Usage_mins || 0;
            const leak = session.session_LEAK || 0;
            const ahi = session.events_per_hour || 0;
            const maskOnOff = session.mask_on_off_count || 0;
            const totalSessionMinutes = usageHrs * 60 + usageMins;
            const sessionStartMinutes =
              (session.hour || 0) * 60 + (session.min || 0);
            const sessionEndMinutes = sessionStartMinutes + totalSessionMinutes;
            if (activeTab === 'Usage Hours' && sessionEndMinutes > 24 * 60) {
              const minutesToMidnight = 24 * 60 - sessionStartMinutes;
              const hoursToMidnight = minutesToMidnight / 60;
              allSessionParts.push({
                label: `${String(session.hour || 0).padStart(2, '0')}:${String(
                  session.min || 0,
                ).padStart(2, '0')}`,
                value: hoursToMidnight,
                hasData: true,
                positionInMinutes: sessionStartMinutes,
                sortKey:
                  (session.hour || 0) * 3600 +
                  (session.min || 0) * 60 +
                  (session.sec || 0),
                isPartOne: true,
              });
            } else {
              let calculatedValue = 0;
              switch (activeTab) {
                case 'Usage Hours':
                  calculatedValue = usageHrs + usageMins / 60;
                  break;
                case 'Mask Seal':
                  calculatedValue = getMaskSealScore(leak);
                  break;
                case 'Events':
                  calculatedValue = ahi;
                  break;
                case 'Mask On/Off':
                  calculatedValue = getMaskOnOffScore(maskOnOff);
                  break;
                case 'Total CPAP Score':
                  calculatedValue =
                    getUsageScore(usageHrs, usageMins) +
                    getMaskSealScore(leak) +
                    getAHIScore(ahi) +
                    getMaskOnOffScore(maskOnOff);
                  break;
                default:
                  calculatedValue = 0;
              }

              allSessionParts.push({
                label: `${String(session.hour || 0).padStart(2, '0')}:${String(
                  session.min || 0,
                ).padStart(2, '0')}`,
                value: calculatedValue,
                hasData: true,
                positionInMinutes: sessionStartMinutes,
                sortKey:
                  (session.hour || 0) * 3600 +
                  (session.min || 0) * 60 +
                  (session.sec || 0),
              });
            }
          });

          data = allSessionParts.sort((a, b) => a.sortKey - b.sortKey);
        } else {
          data = [];
        }
        if (activeTab === 'Usage Hours') {
          const previousDay = dateForFetch.clone().subtract(1, 'day');
          const previousDayStr = previousDay.format('YYYY-MM-DD');

          try {
            const previousDaySessions = await getAllSessionsForDate(
              db,
              previousDayStr,
            );

            if (previousDaySessions && previousDaySessions.length > 0) {
              previousDaySessions.forEach(session => {
                const usageHrs = session.session_Usage_hrs || 0;
                const usageMins = session.session_Usage_mins || 0;
                const totalSessionMinutes = usageHrs * 60 + usageMins;
                const sessionStartMinutes =
                  (session.hour || 0) * 60 + (session.min || 0);
                const sessionEndMinutes =
                  sessionStartMinutes + totalSessionMinutes;
                if (sessionEndMinutes > 24 * 60) {
                  const minutesAfterMidnight = sessionEndMinutes - 24 * 60;
                  const hoursAfterMidnight = minutesAfterMidnight / 60;
                  data.push({
                    label: `00:00`,
                    value: hoursAfterMidnight,
                    hasData: true,
                    positionInMinutes: 0,
                    sortKey: 0,
                    isPartTwo: true,
                    isPreviousDaySession: true,
                  });
                }
              });
              data = data.sort((a, b) => a.sortKey - b.sortKey);
            }
          } catch (error) {}
        }
      } else if (selectedPeriod === 'Week' || selectedPeriod === 'Month') {
        const startDate =
          selectedPeriod === 'Week'
            ? dateForFetch.clone().startOf('isoWeek').format('YYYY-MM-DD')
            : dateForFetch.clone().startOf('month').format('YYYY-MM-DD');
        const endDate =
          selectedPeriod === 'Week'
            ? dateForFetch.clone().endOf('isoWeek').format('YYYY-MM-DD')
            : dateForFetch.clone().endOf('month').format('YYYY-MM-DD');

        const allSessionsInPeriod = await getHomeScreenDataForDateRange(
          db,
          startDate,
          endDate,
        );
        const periodDataMap = new Map();

        if (selectedPeriod === 'Week') {
          for (let i = 0; i < 7; i++) {
            const date = dateForFetch.clone().startOf('isoWeek').add(i, 'days');
            periodDataMap.set(date.format('YYYY-MM-DD'), {
              label: date.format('ddd'),
              totalValue: 0,
              sessionCount: 0,
              hasData: false,
              date: date,
            });
          }
        } else {
          const daysInMonth = dateForFetch.daysInMonth();
          for (let i = 1; i <= daysInMonth; i++) {
            const date = dateForFetch.clone().startOf('month').date(i);
            periodDataMap.set(date.format('YYYY-MM-DD'), {
              label: i.toString(),
              totalValue: 0,
              sessionCount: 0,
              hasData: false,
              date: date,
            });
          }
        }

        if (allSessionsInPeriod && allSessionsInPeriod.length > 0) {
          allSessionsInPeriod.forEach(session => {
            const sessionDateKey = session.date_key;
            if (periodDataMap.has(sessionDateKey)) {
              const dayData = periodDataMap.get(sessionDateKey);

              const usageHrs = session.session_Usage_hrs || 0;
              const usageMins = session.session_Usage_mins || 0;
              const leak = session.session_LEAK || 0;
              const ahi = session.events_per_hour || 0;
              const maskOnOff = session.mask_on_off_count || 0;

              if (activeTab === 'Usage Hours') {
                dayData.totalValue += usageHrs + usageMins / 60;
              } else {
                let sessionScore = 0;
                switch (activeTab) {
                  case 'Mask Seal':
                    sessionScore = getMaskSealScore(leak);
                    break;
                  case 'Events':
                    sessionScore = ahi;
                    break;
                  case 'Mask On/Off':
                    sessionScore = getMaskOnOffScore(maskOnOff);
                    break;
                  case 'Total CPAP Score':
                    sessionScore =
                      getUsageScore(usageHrs, usageMins) +
                      getMaskSealScore(leak) +
                      getAHIScore(ahi) +
                      getMaskOnOffScore(maskOnOff);
                    break;
                  default:
                    sessionScore = 0;
                }
                dayData.totalValue += sessionScore;
              }
              dayData.sessionCount++;
              dayData.hasData = true;
              periodDataMap.set(sessionDateKey, dayData);
            }
          });
        }

        data = Array.from(periodDataMap.values()).map(item => ({
          ...item,
          value:
            item.sessionCount > 0 ? item.totalValue / item.sessionCount : 0,
        }));
      }

      setChartData(data);
    } catch (error) {
      setChartData([]);
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };
  const fetchChartDataForTab = async (
    tabName,
    dateForFetch = currentChartDate,
  ) => {
    if (!db) {
      return [];
    }
    if (!dateForFetch || !moment.isMoment(dateForFetch)) {
      return [];
    }
    if (!tabName) {
      return [];
    }

    try {
      let data = [];
      if (selectedPeriod === 'Day') {
        const dateStr = dateForFetch.format('YYYY-MM-DD');
        const sessions = await getAllSessionsForDate(db, dateStr);

        if (sessions && Array.isArray(sessions) && sessions.length > 0) {
          data = sessions
            .map(session => {
              if (!session) return null;
              const usageHrs = session.session_Usage_hrs || 0;
              const usageMins = session.session_Usage_mins || 0;
              const leak = session.session_LEAK || 0;
              const ahi = session.events_per_hour || 0;
              const maskOnOff = session.mask_on_off_count || 0;
              let calculatedValue = 0;

              switch (tabName) {
                case 'Usage Hours':
                  calculatedValue = usageHrs + usageMins / 60;
                  break;
                case 'Events':
                  calculatedValue = ahi;
                  break;
                case 'Mask Seal':
                  calculatedValue = getMaskSealScore(leak);
                  break;
                case 'Mask On/Off':
                  calculatedValue = getMaskOnOffScore(maskOnOff);
                  break;
                case 'Total CPAP Score':
                  calculatedValue =
                    getUsageScore(usageHrs, usageMins) +
                    getMaskSealScore(leak) +
                    getAHIScore(ahi) +
                    getMaskOnOffScore(maskOnOff);
                  break;
                default:
                  calculatedValue = 0;
              }
              return {
                label: `${String(session.hour || 0).padStart(2, '0')}:${String(
                  session.min || 0,
                ).padStart(2, '0')}`,
                value: calculatedValue,
                hasData: true,
                positionInMinutes:
                  (session.hour || 0) * 60 + (session.min || 0),
                sortKey:
                  (session.hour || 0) * 3600 +
                  (session.min || 0) * 60 +
                  (session.sec || 0),
              };
            })
            .filter(item => item !== null)
            .sort((a, b) => a.sortKey - b.sortKey);
        } else {
          data = [];
        }
      } else if (selectedPeriod === 'Week' || selectedPeriod === 'Month') {
        const startDate =
          selectedPeriod === 'Week'
            ? dateForFetch.clone().startOf('isoWeek').format('YYYY-MM-DD')
            : dateForFetch.clone().startOf('month').format('YYYY-MM-DD');
        const endDate =
          selectedPeriod === 'Week'
            ? dateForFetch.clone().endOf('isoWeek').format('YYYY-MM-DD')
            : dateForFetch.clone().endOf('month').format('YYYY-MM-DD');

        const allSessionsInPeriod = await getHomeScreenDataForDateRange(
          db,
          startDate,
          endDate,
        );
        const periodDataMap = new Map();
        if (selectedPeriod === 'Week') {
          for (let i = 0; i < 7; i++) {
            const date = dateForFetch.clone().startOf('isoWeek').add(i, 'days');
            periodDataMap.set(date.format('YYYY-MM-DD'), {
              label: date.format('ddd'),
              totalValue: 0,
              sessionCount: 0,
              hasData: false,
              date: date,
            });
          }
        } else {
          const daysInMonth = dateForFetch.daysInMonth();
          for (let i = 1; i <= daysInMonth; i++) {
            const date = dateForFetch.clone().startOf('month').date(i);
            periodDataMap.set(date.format('YYYY-MM-DD'), {
              label: i.toString(),
              totalValue: 0,
              sessionCount: 0,
              hasData: false,
              date: date,
            });
          }
        }

        if (
          allSessionsInPeriod &&
          Array.isArray(allSessionsInPeriod) &&
          allSessionsInPeriod.length > 0
        ) {
          allSessionsInPeriod.forEach(session => {
            if (!session) return;
            const sessionDateKey = session.date_key;
            if (sessionDateKey && periodDataMap.has(sessionDateKey)) {
              const dayData = periodDataMap.get(sessionDateKey);
              const usageHrs = session.session_Usage_hrs || 0;
              const usageMins = session.session_Usage_mins || 0;
              const leak = session.session_LEAK || 0;
              const ahi = session.events_per_hour || 0;
              const maskOnOff = session.mask_on_off_count || 0;

              if (tabName === 'Usage Hours') {
                dayData.totalValue += usageHrs + usageMins / 60;
              } else {
                let sessionScore = 0;
                switch (tabName) {
                  case 'Events':
                    sessionScore = ahi;
                    break;
                  case 'Mask Seal':
                    sessionScore = getMaskSealScore(leak);
                    break;
                  case 'Mask On/Off':
                    sessionScore = getMaskOnOffScore(maskOnOff);
                    break;
                  case 'Total CPAP Score':
                    sessionScore =
                      getUsageScore(usageHrs, usageMins) +
                      getMaskSealScore(leak) +
                      getAHIScore(ahi) +
                      getMaskOnOffScore(maskOnOff);
                    break;
                  default:
                    sessionScore = 0;
                }
                dayData.totalValue += sessionScore;
              }
              dayData.sessionCount++;
              dayData.hasData = true;
              periodDataMap.set(sessionDateKey, dayData);
            }
          });
        }

        data = Array.from(periodDataMap.values()).map(item => ({
          ...item,
          value:
            item.sessionCount > 0 ? item.totalValue / item.sessionCount : 0,
        }));
      }

      return Array.isArray(data) ? data : [];
    } catch (error) {
      return [];
    }
  };
  const handleTabChange = tabName => {
    setActiveTab(tabName);
    setActiveBarTooltip(null);
  };
  const getYAxisMax = () => {
    return tabDenominators[activeTab];
  };

  const yAxisMax = getYAxisMax();
  const handleDateChange = direction => {
    let unit = 'day';
    if (selectedPeriod === 'Week') {
      unit = 'isoWeek';
    } else if (selectedPeriod === 'Month') {
      unit = 'month';
    }

    if (direction === 'prev') {
      const newDate = currentChartDate.clone().subtract(1, unit);
      setCurrentChartDate(newDate);
      lastSelectedDateRef.current = newDate;
    } else {
      const nextDate = currentChartDate.clone().add(1, unit);
      if (!isFuturePeriod(nextDate)) {
        setCurrentChartDate(nextDate);
        lastSelectedDateRef.current = nextDate;
      }
    }
    setActiveBarTooltip(null);
  };
  const isFuturePeriod = dateToCheck => {
    const today = moment();
    if (selectedPeriod === 'Day') {
      return dateToCheck.isAfter(today, 'day');
    } else if (selectedPeriod === 'Week') {
      return dateToCheck
        .clone()
        .endOf('isoWeek')
        .isAfter(today.clone().endOf('isoWeek'), 'day');
    } else if (selectedPeriod === 'Month') {
      return dateToCheck
        .clone()
        .endOf('month')
        .isAfter(today.clone().endOf('month'), 'day');
    }
    return false;
  };

  const isCurrentViewTodayOrFuture = () => {
    const today = moment();
    if (selectedPeriod === 'Day') {
      return currentChartDate.isSameOrAfter(today, 'day');
    } else if (selectedPeriod === 'Week') {
      return currentChartDate
        .clone()
        .endOf('isoWeek')
        .isSameOrAfter(today.clone().startOf('isoWeek'), 'day');
    } else if (selectedPeriod === 'Month') {
      return currentChartDate
        .clone()
        .endOf('month')
        .isSameOrAfter(today.clone().startOf('month'), 'day');
    }
    return false;
  };

  const getChartDateDisplay = () => {
    if (selectedPeriod === 'Week') {
      const startOfWeek = currentChartDate
        .clone()
        .startOf('isoWeek')
        .format('MMM DD, YYYY');
      const endOfWeek = currentChartDate
        .clone()
        .endOf('isoWeek')
        .format('MMM DD, YYYY');
      return `${startOfWeek} - ${endOfWeek}`;
    } else if (selectedPeriod === 'Month') {
      return currentChartDate.clone().format('MMMM YYYY');
    }
    return currentChartDate.format('MMM DD, YYYY');
  };

  const today = moment();
  const generateYAxisLabels = (max, tab) => {
    const labels = [];
    if (selectedPeriod === 'Day' && activeTab === 'Usage Hours') {
      return [];
    }

    if (activeTab === 'Events') {
      return [1, 2, 4, 10, 20, 40];
    }

    if (
      tab === 'Usage Hours' &&
      (selectedPeriod === 'Week' || selectedPeriod === 'Month')
    ) {
      return [0, 2, 4, 6, 10, 12];
    }

    const numSteps = 5;
    const step = max / numSteps;
    for (let i = 0; i <= numSteps; i++) {
      const labelValue = i * step;
      if (tab === 'Usage Hours') {
        labels.push(Math.round(labelValue));
      } else {
        labels.push(
          Number.isInteger(labelValue)
            ? labelValue
            : parseFloat(labelValue.toFixed(1)),
        );
      }
    }
    return labels;
  };
  const yAxisLabels = generateYAxisLabels(yAxisMax, activeTab);
  const hasChartDataToShow = chartData.some(item => item.hasData);

  const [chartCardPosition, setChartCardPosition] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  useEffect(() => {
    if (chartContainerRef.current) {
      chartContainerRef.current.measure((fx, fy, width, height, px, py) => {
        setChartCardPosition({ x: px, y: py, width: width, height: height });
      });
    }
  }, [chartData, selectedPeriod, activeTab, screenData]);

  const handleBarPress = (dataPoint, event, index) => {
    if (!dataPoint.hasData) {
      setActiveBarTooltip(null);
      return;
    }
    if (!chartContainerRef.current) {
      return;
    }

    chartContainerRef.current.measure((fx, fy, width, height, px, py) => {
      const chartCardPadding = 20;
      const yAxisLabelAreaWidth =
        selectedPeriod === 'Day' && activeTab === 'Usage Hours'
          ? 0
          : styles.yAxisLabels(screenData).paddingLeft;
      const chartContentLeftEdge = px + chartCardPadding + yAxisLabelAreaWidth;

      let tooltipX = 0;
      let tooltipY = 0;
      let targetYAbsolute;
      let barHeightAtValue;

      if (selectedPeriod === 'Day' && activeTab === 'Usage Hours') {
        const totalMinutesInDay = 24 * 60;
        const chartContentWidth =
          width - chartCardPadding * 2 - yAxisLabelAreaWidth;
        const barLeftRelative =
          (dataPoint.positionInMinutes / totalMinutesInDay) * chartContentWidth;

        tooltipX =
          chartContentLeftEdge +
          barLeftRelative +
          styles.chartBarContainer.width / 2;

        const chartContentNoYAxisHeight =
          screenData.width > screenData.height ? screenData.height * 0.3 : 150;
        const barCenterYRelativeToChartContentTop =
          chartContentNoYAxisHeight / 2;
        targetYAbsolute =
          py + chartCardPadding + barCenterYRelativeToChartContentTop;
        barHeightAtValue = styles.horizontalBar.height;
      } else {
        const barActualWidth =
          selectedPeriod === 'Week'
            ? styles.weeklyChartBarContainer.width
            : styles.monthlyChartBarContainer.width;
        const barCount = chartData.length;
        const chartContentWidth =
          width - chartCardPadding * 2 - yAxisLabelAreaWidth;

        const totalBarsWidth = barCount * barActualWidth;
        const remainingSpace = chartContentWidth - totalBarsWidth;
        const spaceBetweenBars =
          barCount > 1 ? remainingSpace / (barCount - 1) : 0;

        const effectiveBarOffset = barActualWidth + spaceBetweenBars;
        tooltipX =
          chartContentLeftEdge +
          index * effectiveBarOffset +
          barActualWidth / 2;

        const barValue = dataPoint.value;
        const barPlotHeight = selectedPeriod === 'Week' ? 115 : 110;
        barHeightAtValue = (barValue / yAxisMax) * barPlotHeight;

        const chartContentBottomOffset = 30;
        targetYAbsolute =
          py + height - chartContentBottomOffset - barHeightAtValue / 2;
      }

      const arrowHeight = 10;
      const paddingToTarget = 5;
      const estimatedTooltipHeight = 45;

      tooltipY =
        targetYAbsolute -
        (estimatedTooltipHeight + arrowHeight + paddingToTarget);

      if (tooltipY < py) {
        tooltipY = py + paddingToTarget + arrowHeight;
      }

      const tooltipHalfWidth = 80 / 2;
      if (tooltipX - tooltipHalfWidth < px) {
        tooltipX = px + tooltipHalfWidth + chartCardPadding;
      } else if (tooltipX + tooltipHalfWidth > px + width) {
        tooltipX = px + width - tooltipHalfWidth - chartCardPadding;
      }
      setActiveBarTooltip({
        x: tooltipX,
        y: tooltipY,
        pointLabel: dataPoint.label,
        value: dataPoint.value.toFixed(1),
        unit: getUnitForTab(activeTab),
        fullDate: selectedPeriod === 'Day' ? currentChartDate : dataPoint.date,
        sessionStartTime:
          selectedPeriod === 'Day' && activeTab === 'Usage Hours'
            ? dataPoint.label
            : null,
        sessionEndTime:
          selectedPeriod === 'Day' && activeTab === 'Usage Hours'
            ? (() => {
                const startMinutes = dataPoint.positionInMinutes;
                const durationHours = dataPoint.value;
                const endMinutes = startMinutes + durationHours * 60;
                if (endMinutes >= 24 * 60) {
                  const nextDayMinutes = endMinutes - 24 * 60;
                  const endHour = Math.floor(nextDayMinutes / 60);
                  const endMin = Math.floor(nextDayMinutes % 60);
                  return `${String(endHour).padStart(2, '0')}:${String(
                    endMin,
                  ).padStart(2, '0')}`;
                } else {
                  const endHour = Math.floor(endMinutes / 60);
                  const endMin = Math.floor(endMinutes % 60);
                  return `${String(endHour).padStart(2, '0')}:${String(
                    endMin,
                  ).padStart(2, '0')}`;
                }
              })()
            : null,
        crossesMidnight:
          selectedPeriod === 'Day' && activeTab === 'Usage Hours'
            ? dataPoint.positionInMinutes + dataPoint.value * 60 >= 24 * 60
            : false,
      });
    });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerCont}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.topNavContainer(screenData)}
        >
          <TouchableOpacity
            style={[
              styles.topNavItem,
              activeTab === 'Usage Hours' && styles.topNavItemActive,
            ]}
            onPress={() => handleTabChange('Usage Hours')}
          >
            <Image
              source={require('../../assets/images/Clock.png')}
              style={{
                width: 24,
                height: 24,
                tintColor: activeTab === 'Usage Hours' ? '#d2d7ff' : '#fff',
              }}
            />
            <Text
              style={[
                styles.commonText,
                activeTab === 'Usage Hours' && styles.activeCommonText,
              ]}
            >
              Usage Hours
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.topNavItem,
              activeTab === 'Mask Seal' && styles.topNavItemActive,
            ]}
            onPress={() => handleTabChange('Mask Seal')}
          >
            <Image
              source={require('../../assets/images/GoodMaskSeal.png')}
              style={{
                width: 24,
                height: 24,
                tintColor: activeTab === 'Mask Seal' ? '#d2d7ff' : '#fff',
              }}
            />
            <Text
              style={[
                styles.commonText,
                activeTab === 'Mask Seal' && styles.activeCommonText,
              ]}
            >
              Mask Seal
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.topNavItem,
              activeTab === 'Events' && styles.topNavItemActive,
            ]}
            onPress={() => handleTabChange('Events')}
          >
            <Image
              source={require('../../assets/images/Events.png')}
              style={{
                width: 24,
                height: 24,
                tintColor: activeTab === 'Events' ? '#d2d7ff' : '#fff',
              }}
            />
            <Text
              style={[
                styles.commonText,
                activeTab === 'Events' && styles.activeCommonText,
              ]}
            >
              Events
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.topNavItem,
              activeTab === 'Mask On/Off' && styles.topNavItemActive,
            ]}
            onPress={() => handleTabChange('Mask On/Off')}
          >
            <Image
              source={require('../../assets/images/MaskOnOff.png')}
              style={{
                width: 24,
                height: 24,
                tintColor: activeTab === 'Mask On/Off' ? '#d2d7ff' : '#fff',
              }}
            />
            <Text
              style={[
                styles.commonText,
                activeTab === 'Mask On/Off' && styles.activeCommonText,
              ]}
            >
              Mask On/Off
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.topNavItem,
              activeTab === 'Total CPAP Score' && styles.topNavItemActive,
            ]}
            onPress={() => handleTabChange('Total CPAP Score')}
          >
            <Image
              source={require('../../assets/images/TotalCPAPScore.png')}
              style={{
                width: 24,
                height: 24,
                tintColor:
                  activeTab === 'Total CPAP Score' ? '#d2d7ff' : '#fff',
              }}
            />
            <Text
              style={[
                styles.commonText,
                activeTab === 'Total CPAP Score' && styles.activeCommonText,
              ]}
            >
              Total CPAP Score
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <View style={styles.periodTabsContainer}>
        <TouchableOpacity
          style={[
            styles.periodTab,
            selectedPeriod === 'Day' && styles.periodTabActive,
          ]}
          onPress={() => {
            setSelectedPeriod('Day');
            setCurrentChartDate(lastSelectedDateRef.current);
            setActiveBarTooltip(null);
          }}
        >
          <Text
            style={[
              styles.periodTabText,
              selectedPeriod === 'Day' && styles.periodTabTextActive,
            ]}
          >
            Day
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.periodTab,
            selectedPeriod === 'Week' && styles.periodTabActive,
          ]}
          onPress={() => {
            setSelectedPeriod('Week');
            setCurrentChartDate(lastSelectedDateRef.current);
            setActiveBarTooltip(null);
          }}
        >
          <Text
            style={[
              styles.periodTabText,
              selectedPeriod === 'Week' && styles.periodTabTextActive,
            ]}
          >
            Week
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.periodTab,
            selectedPeriod === 'Month' && styles.periodTabActive,
          ]}
          onPress={() => {
            setSelectedPeriod('Month');
            setCurrentChartDate(lastSelectedDateRef.current);
            setActiveBarTooltip(null);
          }}
        >
          <Text
            style={[
              styles.periodTabText,
              selectedPeriod === 'Month' && styles.periodTabTextActive,
            ]}
          >
            Month
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.chartDateNavigation}>
        <TouchableOpacity onPress={() => handleDateChange('prev')}>
          <FeatherIcon name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.chartDateText}>{getChartDateDisplay()}</Text>
        <TouchableOpacity
          onPress={() => handleDateChange('next')}
          disabled={isCurrentViewTodayOrFuture()}
        >
          <FeatherIcon
            name="chevron-right"
            size={24}
            color={isCurrentViewTodayOrFuture() ? '#505860' : '#fff'}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <View style={styles.chartCard(screenData)} ref={chartContainerRef}>
          {loading ? (
            <View style={styles.chartOverlay}>
              <ActivityIndicator size="large" color="#d2d7ff" />
            </View>
          ) : !hasChartDataToShow ? (
            <View style={styles.chartOverlay}>
              <Text style={styles.noDataText}>No Data Available</Text>
            </View>
          ) : (
            <>
              <View
                style={[
                  styles.chartContent,
                  selectedPeriod === 'Day' &&
                    activeTab === 'Usage Hours' &&
                    styles.chartContentNoYAxis(screenData),
                ]}
              >
                <View style={styles.barsContainer(screenData)}>
                  {selectedPeriod === 'Day'
                    ? activeTab !== 'Usage Hours'
                      ? chartData.map((data, index) => {
                          const barValue = data.value;
                          const totalMinutesInDay = 24 * 60;
                          const leftPosition =
                            (data.positionInMinutes / totalMinutesInDay) * 100;
                          const showBar = barValue > 0;

                          return (
                            <TouchableOpacity
                              key={index}
                              style={[
                                styles.chartBarContainer,
                                { left: `${leftPosition}%` },
                              ]}
                              onPress={event =>
                                handleBarPress(data, event, index)
                              }
                              activeOpacity={0.7}
                            >
                              {showBar && (
                                <View
                                  style={[
                                    styles.bar,
                                    activeTab === 'Usage Hours' &&
                                    selectedPeriod === 'Day'
                                      ? styles.horizontalBar
                                      : {
                                          height:
                                            (barValue / yAxisMax) *
                                            (activeTab === 'Events'
                                              ? 295
                                              : 110),
                                        },
                                  ]}
                                />
                              )}
                            </TouchableOpacity>
                          );
                        })
                      : chartData.map((data, index) => {
                          const sessionDurationHours = data.value;
                          const sessionStartMinutes = data.positionInMinutes;
                          const totalMinutesInDay = 24 * 60;
                          const startPercentage =
                            (sessionStartMinutes / totalMinutesInDay) * 100;
                          const durationPercentage =
                            (sessionDurationHours / 24) * 99;
                          const showBar = sessionDurationHours > 0;
                          return (
                            <TouchableOpacity
                              key={index}
                              style={[
                                styles.chartBarContainer,
                                activeTab === 'Usage Hours' &&
                                selectedPeriod === 'Day'
                                  ? {
                                      position: 'absolute',
                                      height: 10,
                                      left: `${
                                        screenData.width > screenData.height
                                          ? startPercentage - 0.4
                                          : startPercentage + 2
                                      }%`,
                                      width: `${
                                        screenData.width > screenData.height
                                          ? durationPercentage
                                          : durationPercentage + 0.8
                                      }%`,
                                      bottom:
                                        screenData.width > screenData.height
                                          ? -43
                                          : -18,
                                    }
                                  : {},
                              ]}
                              onPress={event =>
                                handleBarPress(data, event, index)
                              }
                              activeOpacity={0.7}
                            >
                              {showBar && (
                                <View
                                  style={[
                                    styles.bar,
                                    activeTab === 'Usage Hours' &&
                                    selectedPeriod === 'Day'
                                      ? {
                                          backgroundColor: '#53a3ff',
                                          flex: 1,
                                        }
                                      : {
                                          height:
                                            (sessionDurationHours / yAxisMax) *
                                            (activeTab === 'Events'
                                              ? 295
                                              : 110),
                                        },
                                  ]}
                                />
                              )}
                            </TouchableOpacity>
                          );
                        })
                    : selectedPeriod === 'Week'
                    ? chartData.map((data, index) => {
                        const isThisPeriodInView = currentChartDate.isSame(
                          today,
                          'isoWeek',
                        );
                        const isCurrentDayInPeriod =
                          isThisPeriodInView &&
                          data.date &&
                          data.date.isSame(today, 'day');

                        const barValue = data.value;
                        return (
                          <TouchableOpacity
                            key={index}
                            style={styles.weeklyChartBarContainer}
                            onPress={event =>
                              handleBarPress(data, event, index)
                            }
                            activeOpacity={0.7}
                          >
                            <View
                              style={[
                                styles.bar,
                                {
                                  height:
                                    (barValue / yAxisMax) *
                                    (activeTab === 'Events' ? 295 : 114),
                                  backgroundColor:
                                    isThisPeriodInView && isCurrentDayInPeriod
                                      ? '#d2d7ff'
                                      : '#53a3ff',
                                },
                              ]}
                            />
                          </TouchableOpacity>
                        );
                      })
                    : chartData.map((data, index) => {
                        const isThisPeriodInView = currentChartDate.isSame(
                          today,
                          'month',
                        );
                        const isCurrentDayInPeriod =
                          isThisPeriodInView &&
                          data.date &&
                          data.date.isSame(today, 'day');

                        const barValue = data.value;
                        return (
                          <TouchableOpacity
                            key={index}
                            style={styles.monthlyChartBarContainer}
                            onPress={event =>
                              handleBarPress(data, event, index)
                            }
                            activeOpacity={0.7}
                          >
                            <View
                              style={[
                                styles.bar,
                                {
                                  height:
                                    (barValue / yAxisMax) *
                                    (activeTab === 'Events' ? 295 : 114),
                                  backgroundColor:
                                    isThisPeriodInView && isCurrentDayInPeriod
                                      ? '#d2d7ff'
                                      : '#53a3ff',
                                },
                              ]}
                            />
                          </TouchableOpacity>
                        );
                      })}
                </View>

                {selectedPeriod === 'Day' ? (
                  activeTab !== 'Usage Hours' ? (
                    <View
                      style={[
                        styles.xAxisLabels(screenData),
                        selectedPeriod === 'Day' &&
                          activeTab === 'Usage Hours' &&
                          styles.xAxisLabelUsageHrs(screenData),
                      ]}
                    >
                      {screenData.width > screenData.height
                        ? Array.from({ length: 24 }, (_, i) => i)
                            .filter(hour => hour % 2 !== 0)
                            .map((hour, i) => (
                              <Text
                                key={i}
                                style={[
                                  styles.xAxisLabel,
                                  {
                                    left: `${(hour / 23) * 99 + -1}%`,
                                    transform: [
                                      {
                                        translateX:
                                          hour === 0
                                            ? 0
                                            : hour === 23
                                            ? -25
                                            : -15,
                                      },
                                    ],
                                    paddingLeft: 4,
                                  },
                                ]}
                              >
                                {String(hour).padStart(2, '0')}:00
                              </Text>
                            ))
                        : [0, 6, 12, 18, 23].map((hour, i) => (
                            <Text
                              key={i}
                              style={[
                                styles.xAxisLabel,
                                {
                                  left: `${(hour / 23) * 98}%`,
                                  transform: [
                                    {
                                      translateX:
                                        hour === 0
                                          ? 0
                                          : hour === 23
                                          ? -30
                                          : -15,
                                    },
                                  ],
                                  paddingLeft: 4,
                                },
                              ]}
                            >
                              {String(hour).padStart(2, '0')}:00
                            </Text>
                          ))}
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.xAxisLabels(screenData),
                        selectedPeriod === 'Day' &&
                          activeTab === 'Usage Hours' &&
                          styles.xAxisLabelUsageHrs(screenData),
                      ]}
                    >
                      {screenData.width > screenData.height
                        ? Array.from({ length: 24 }, (_, i) => i).map(
                            (hour, i) => (
                              <Text
                                key={i}
                                style={[
                                  styles.xAxisLabel,
                                  {
                                    left: `${(hour / 24) * 99 + -1}%`,
                                    transform: [
                                      {
                                        translateX: 10,
                                      },
                                    ],
                                    paddingLeft: 1,
                                  },
                                ]}
                              >
                                {String(hour).padStart(2, '0')}
                              </Text>
                            ),
                          )
                        : Array.from({ length: 24 }, (_, i) => i).map(
                            (hour, i) => (
                              <Text
                                key={i}
                                style={[
                                  styles.xAxisLabel,
                                  {
                                    left: `${(hour / 24) * 97}%`,
                                    bottom: 8,
                                    paddingLeft: 3,
                                  },
                                ]}
                              >
                                {String(hour).padStart(2, '0')}
                              </Text>
                            ),
                          )}
                    </View>
                  )
                ) : selectedPeriod === 'Week' ? (
                  <View style={styles.xAxisLabelsWeekly}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(
                      (day, index) => {
                        const dayDate = currentChartDate
                          .clone()
                          .startOf('isoWeek')
                          .add(index, 'days');
                        const isActiveDay =
                          currentChartDate.isSame(today, 'isoWeek') &&
                          dayDate.isSame(today, 'day');
                        return (
                          <Text
                            key={index}
                            style={[
                              styles.xAxisLabelWeekly,
                              isActiveDay && styles.xAxisLabelWeeklyActive,
                            ]}
                          >
                            {day}
                          </Text>
                        );
                      },
                    )}
                  </View>
                ) : (
                  <View style={styles.xAxisLabelsMonthly}>
                    {chartData.map((data, index) => {
                      const dayNum = index + 1;
                      const isActiveDay =
                        currentChartDate.isSame(today, 'month') &&
                        data.date &&
                        data.date.isSame(today, 'day');
                      if (
                        dayNum % 2 !== 0 ||
                        !(screenData.width < screenData.height)
                      ) {
                        return (
                          <Text
                            key={index}
                            style={[
                              styles.xAxisLabelMonthly,
                              {
                                left: `${
                                  (index /
                                    (chartData.length -
                                      (screenData.width < screenData.height
                                        ? -0.45
                                        : 0.3))) *
                                  100
                                }%`,
                                width: 15,
                                textAlign: 'right',
                                marginRight: 0,
                              },
                              isActiveDay && styles.xAxisLabelMonthlyActive,
                            ]}
                          >
                            {dayNum}
                          </Text>
                        );
                      }
                      return null;
                    })}
                  </View>
                )}
              </View>
              {!(selectedPeriod === 'Day' && activeTab === 'Usage Hours') && (
                <View
                  style={[
                    activeTab === 'Usage Hours' &&
                      selectedPeriod !== 'Day' &&
                      styles.yAxisLabelsUsageHours(screenData),
                    activeTab === 'Mask Seal' &&
                      styles.yAxisLabelsMaskSeal(screenData),
                    activeTab === 'Events' &&
                      styles.yAxisLabelssEvents(screenData),
                    activeTab === 'Mask On/Off' &&
                      styles.yAxisLabelsMaskOnOff(screenData),
                    activeTab === 'Total CPAP Score' &&
                      styles.yAxisLabelsTotalCPAPScore(screenData),
                  ]}
                >
                  {yAxisLabels
                    .map((label, index) => (
                      <Text key={index} style={styles.yAxisLabel}>
                        {String(label)}
                      </Text>
                    ))
                    .reverse()}
                </View>
              )}
            </>
          )}

          {hasChartDataToShow && (
            <View style={styles.legendContainer}>
              <View style={styles.legendRowXAxis}>
                <View style={styles.legendBoxXAxis} />
                {selectedPeriod === 'Day' && activeTab === 'Usage Hours' ? (
                  <Text style={styles.legendText}>Times of Day (hrs)</Text>
                ) : (
                  <Text style={styles.legendText}>{legendData.xAxis}</Text>
                )}
              </View>
              {((selectedPeriod === 'Day' && activeTab !== 'Usage Hours') ||
                selectedPeriod !== 'Day') && (
                <View style={styles.legendRowYAxis}>
                  <View style={styles.legendBoxYAxis} />
                  <Text style={styles.legendText}>{legendData.yAxis}</Text>
                </View>
              )}
            </View>
          )}

          {hasChartDataToShow && (
            <>
              <View style={styles.legendBoxXAxisOne(screenData)} />
              {((selectedPeriod === 'Day' && activeTab !== 'Usage Hours') ||
                selectedPeriod !== 'Day') && (
                <View style={styles.legendBoxYAxisTwo(screenData)} />
              )}
            </>
          )}
        </View>

        {activeBarTooltip && (
          <View
            style={[
              styles.tooltipContainer,
              {
                left: activeBarTooltip.x,
                top: screenData.width > screenData.height ? 80 : 85,
              },
            ]}
          >
            <View style={styles.tooltipArrow} />
            {activeBarTooltip.fullDate && (
              <Text style={styles.tooltipDateText}>
                {activeBarTooltip.fullDate.format('MMM DD, YYYY')}
              </Text>
            )}
            {selectedPeriod === 'Day' && activeTab === 'Usage Hours' ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.tooltipText}>
                  {`${activeBarTooltip.sessionStartTime} - ${activeBarTooltip.sessionEndTime}`}
                </Text>
                {activeBarTooltip.crossesMidnight && (
                  <Text
                    style={[styles.tooltipText, { fontSize: 8, color: '#ccc' }]}
                  >
                    (crosses midnight)
                  </Text>
                )}
              </View>
            ) : selectedPeriod === 'Day' ? (
              <Text style={styles.tooltipText}>
                {activeBarTooltip.pointLabel}
              </Text>
            ) : null}
            <Text
              style={styles.tooltipValueText}
            >{`${activeBarTooltip.value} ${activeBarTooltip.unit}`}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.downloadButton,
            isDownloading && styles.downloadButtonDisabled,
          ]}
          onPress={handleDownloadPress}
          disabled={isDownloading}
        >
          <FeatherIcon
            name={isDownloading ? 'clock' : 'download'}
            size={24}
            color={isDownloading ? '#999' : '#fff'}
          />
          <Text
            style={[
              styles.downloadButtonText,
              isDownloading && styles.downloadButtonTextDisabled,
            ]}
          >
            {isDownloading ? 'Generating...' : 'Download Report'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#242e39',
  },
  headerCont: {
    backgroundColor: '#3a434d',
    paddingTop: Platform.OS === 'ios' ? 50 : 23,
    marginBottom: 31,
  },
  topNavContainer: screenData => ({
    flexDirection: 'row',
    justifyContent:
      screenData.width > screenData.height ? 'space-between' : 'space-around',
    paddingHorizontal: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#505860',
    width: screenData.width > screenData.height ? '100%' : 'auto',
  }),
  topNavItem: {
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginTop: 3,
    marginHorizontal: 15,
    marginBottom: -2,
  },
  topNavItemActive: {
    borderBottomColor: '#d2d7ff',
  },
  commonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
  },
  activeCommonText: {
    color: '#d2d7ff',
  },
  periodTabsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#48515a',
    borderRadius: 10,
    marginHorizontal: 20,

    marginBottom: 20,
    padding: 5,
    height: 60,
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#6f757d',
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  periodTab: {
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 12,
    marginHorizontal: 3,
    width: 80,
  },
  periodTabActive: {
    backgroundColor: '#5866ce',
  },
  periodTabText: {
    fontWeight: '600',
    color: '#fff',
    fontSize: 14,
  },

  periodTabTextActive: {
    fontWeight: '600',
    color: '#fff',
    fontSize: 14,
  },
  chartDateNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
    marginTop: 20,
  },
  chartDateText: {
    fontWeight: '600',
    color: '#fff',
    fontSize: 14,
  },
  scrollViewContent: {
    alignItems: 'center',
    paddingBottom: 20,
    paddingTop: 20,
  },
  chartCard: screenData => ({
    backgroundColor: '#434b55',
    borderRadius: 16,
    overflow: 'hidden',
    padding: 20,
    marginHorizontal: 20,
    flexDirection: 'row',
    marginBottom: 20,
    justifyContent: 'space-between',
    alignItems: 'center',
    borderStyle: 'solid',
    borderWidth: 3,
    borderColor: 'transparent',
    position: 'relative',
    width: screenData.width * 0.93,
    height:
      screenData.width > screenData.height ? screenData.height * 0.6 : 260,
  }),

  yAxisLabels: screenData => ({
    justifyContent: 'space-between',
    paddingLeft: 10,
    height: '100%',
    paddingTop: 10,
    paddingBottom: 20,
    paddingTop: 0,
    paddingBottom: 0,
    position: 'absolute',
    right: 6,
    bottom: 42,
    height:
      screenData.width > screenData.height ? screenData.height * 0.28 : 127,
  }),
  yAxisLabelsUsageHours: screenData => ({
    justifyContent: 'space-between',
    paddingLeft: 10,
    height: '100%',
    paddingTop: 10,
    paddingBottom: 20,
    paddingTop: 0,
    paddingBottom: 0,
    position: 'absolute',
    right: 6,
    bottom: 42,
    height:
      screenData.width > screenData.height ? screenData.height * 0.28 : 133,
    borderStyle: 'solid',
  }),

  yAxisLabelsMaskSeal: screenData => ({
    justifyContent: 'space-between',
    paddingLeft: 10,
    height: '100%',
    paddingTop: 10,
    paddingBottom: 20,
    paddingTop: 0,
    paddingBottom: 0,
    position: 'absolute',
    right: 6,
    bottom: 42,
    height:
      screenData.width > screenData.height ? screenData.height * 0.28 : 133,
    borderStyle: 'solid',
  }),

  yAxisLabelssEvents: screenData => ({
    justifyContent: 'space-between',
    paddingLeft: 10,
    height: '100%',
    paddingTop: 10,
    paddingBottom: 20,
    paddingTop: 0,
    paddingBottom: 0,
    position: 'absolute',
    right: 6,
    bottom: 42,
    height:
      screenData.width > screenData.height ? screenData.height * 0.28 : 133,
    borderStyle: 'solid',
  }),

  yAxisLabelsMaskOnOff: screenData => ({
    justifyContent: 'space-between',
    paddingLeft: 10,
    height: '100%',
    paddingTop: 10,
    paddingBottom: 20,
    paddingTop: 0,
    paddingBottom: 0,
    position: 'absolute',
    right: 6,
    bottom: 42,
    height:
      screenData.width > screenData.height ? screenData.height * 0.28 : 129,
    borderStyle: 'solid',
  }),

  yAxisLabelsTotalCPAPScore: screenData => ({
    justifyContent: 'space-between',
    paddingLeft: 10,
    height: '100%',
    paddingTop: 10,
    paddingBottom: 20,
    paddingTop: 0,
    paddingBottom: 0,
    position: 'absolute',
    right: 6,
    bottom: 42,
    height:
      screenData.width > screenData.height ? screenData.height * 0.28 : 133,
    borderStyle: 'solid',
  }),

  yAxisLabel: {
    color: '#a1a9b3',

    fontSize: 8,
    fontWeight: '400',
    fontFamily: 'Inter',
    textAlign: 'center',
  },
  chartContent: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    position: 'relative',
    bottom: 30,
  },
  chartContentNoYAxis: screenData => ({
    height:
      screenData.width > screenData.height ? screenData.height * 0.3 : 150,
    justifyContent: 'center',
  }),

  barsContainer: screenData => ({
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',

    height:
      screenData.width > screenData.height
        ? screenData.height * 0.25
        : VERTICAL_BAR_PLOT_HEIGHT,
    width: '100%',
    position: 'relative',
    paddingHorizontal: 5,
  }),

  chartBarContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 8,
  },
  weeklyChartBarContainer: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 15,
    marginHorizontal: 2,
    position: 'relative',
  },
  monthlyChartBarContainer: {
    alignItems: 'center',

    justifyContent: 'flex-end',
    width: 8,
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
    transform: [{ translateY: 22 }],
  },
  xAxisLabels: screenData => ({
    flexDirection: 'row',
    marginTop: 10,
    paddingHorizontal: screenData.width > screenData.height ? 30 : 0,
    width: '105%',
    position: 'absolute',
    bottom: 0,
    height: 20,
    left: -2.5,
    position: 'absolute',
    bottom: -35,
  }),

  xAxisLabelUsageHrs: screenData => ({
    bottom: screenData.width > screenData.height ? -78 : -68,
    left: 0,
    paddingHorizontal: screenData.width > screenData.height ? 30 : 5,
  }),

  xAxisLabel: {
    color: '#a1a9b3',
    fontSize: 8,
    fontWeight: '400',
    fontFamily: 'Inter',
    textAlign: 'center',
    position: 'absolute',
  },
  xAxisLabelsWeekly: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
    paddingLeft: 5,
    width: '100%',
    position: 'absolute',
    bottom: -35,
    height: 20,
  },
  xAxisLabelWeekly: {
    color: '#a1a9b3',
    fontSize: 10,
    fontWeight: '400',
    fontFamily: 'Inter',
    textAlign: 'center',
    flex: 1,
  },
  xAxisLabelWeeklyActive: {
    color: '#fff',
    fontWeight: '600',
  },
  xAxisLabelsMonthly: {
    flexDirection: 'row',
    marginTop: 10,
    paddingHorizontal: 0,
    width: '100%',
    position: 'absolute',
    bottom: -35,
    height: 20,
    gap: 0,
  },
  xAxisLabelMonthly: {
    color: '#a1a9b3',
    fontSize: 6,
    fontWeight: '400',
    fontFamily: 'Inter',
    textAlign: 'center',
    position: 'absolute',
    borderStyle: 'solid',
    padding: 0,
  },
  xAxisLabelMonthlyActive: {},
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 71,
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#fff',
    height: 55,
    width: 230,
    justifyContent: 'center',
    marginTop: 100,
  },
  downloadButtonText: {
    fontWeight: '600',
    color: '#fff',
    fontSize: 14,
    marginLeft: 10,
  },

  chartOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(67, 75, 85, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    zIndex: 5,
  },
  noDataText: {
    color: '#d2d7ff',
    fontSize: 16,
    fontWeight: '600',
  },

  loadingText: {
    color: '#d2d7ff',
    marginTop: 10,
    fontSize: 14,
  },

  tooltipContainer: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    minWidth: 80,
    transform: [{ translateX: -40 }],
  },

  tooltipArrow: {
    position: 'absolute',
    bottom: -10,
    left: '50%',
    transform: [
      {
        translateX: -8,
      },
    ],
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 0,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(0, 0, 0, 0.7)',
  },

  tooltipDateText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  tooltipText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  tooltipValueText: {
    color: '#fff',
    fontSize: 10,
  },
  chartOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(67, 75, 85, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    zIndex: 5,
  },
  noDataText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  legendContainer: {
    position: 'absolute',
    top: 8,
    left: 16,
    flexDirection: 'column',
    width: '100%',
    borderStyle: 'solid',
    borderWidth: 0,
    gap: 9,
    justifyContent: 'flex-start',
  },

  legendRowXAxis: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  legendRowYAxis: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  legendBoxXAxis: {
    width: 16,
    height: 16,
    backgroundColor: '#53a3ff',
    borderRadius: 3,
    marginRight: 8,
  },

  legendBoxYAxis: {
    width: 16,
    height: 16,
    backgroundColor: '#d2d7ff',
    borderRadius: 3,
    marginRight: 8,
  },

  legendBoxXAxisOne: screenData => ({
    width: 16,
    height: 16,
    backgroundColor: '#53a3ff',
    borderRadius: 3,
    position: 'absolute',
    left: 2,
    bottom: screenData.width > screenData.height ? 20 : 20,
  }),

  legendBoxYAxisTwo: screenData => ({
    width: 16,
    height: 16,
    backgroundColor: '#d2d7ff',
    borderRadius: 3,
    position: 'absolute',
    right: screenData.width > screenData.height ? 5 : 5,
    top: 20,
  }),

  legendText: {
    color: '#fff',
    fontSize: 9,
    textAlign: 'center',
    fontWeight: '500',
  },

  yAxisLabelsRight: {
    justifyContent: 'space-between',
    height: '100%',
    position: 'absolute',
    right: -17,
    paddingRight: 0,
    transform: [{ translateY: 10 }],
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
  downloadButtonDisabled: {
    backgroundColor: '#555',
    borderColor: '#666',
  },
  downloadButtonTextDisabled: {
    color: '#999',
  },
});

export default HistoryScreen;
