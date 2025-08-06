import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Video from 'react-native-video';

const tabs = ['Device Setup', 'How to Use', 'In General'];

const COLORS = {
  background: '#1B2430',
  secondaryBackground: '#2B3643',
  primaryText: '#fff',
  secondaryText: '#aaa',
  mutedText: '#ccc',
  primaryButton: '#7A86E0',
};

const SIZES = {
  fontSize13: 13,
  fontSize14: 14,
  fontSize15: 15,
  fontSize16: 16,
};

const SPACING = {
  paddingContainer: 25,
  paddingTop: 28,
  marginBottom16: 16,
  marginBottom20: 20,
  marginBottom12: 12,
  marginTop4: 4,
  paddingVertical8: 8,
  paddingHorizontal14: 14,
  paddingBottom50: 50,
  gap10: 10,
  paddingCard: 12,
};

const BORDER_RADIUS = {
  tabButton: 20,
  card: 12,
};

const COMMON_STYLES = {
  boldFont: {
    fontWeight: 'bold',
  },
  textWhite: {
    color: COLORS.primaryText,
  },
  textMuted: {
    color: COLORS.mutedText,
  },
  cardImage: {
    width: '100%',
    height: 160,
  },
};

const LibraryDeviceSetUp = () => {
  const [activeTab, setActiveTab] = useState('Device Setup');

  const renderVideoCard = () => (
    <>
      <Video
        source={require('../../assets/samplevideo.mp4')}
        style={styles.cardImage}
        resizeMode="cover"
        paused={true}
        controls={true}
      />
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>Using your device</Text>
        <Text style={styles.cardSubtitle}>Learn how to use your device</Text>
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.description}>
        <Text style={COMMON_STYLES.boldFont}>imeds CPAP’s</Text> Library is a
        tailored collection of how to instructions and videos - along with other
        support materials - all identified just for you. They were chosen to
        help you on your journey as you begin using your machine and mask as
        part of your sleep therapy
      </Text>
      <View style={styles.tabRow}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tabButton,
              activeTab === tab && styles.activeTabButton,
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.activeTabText,
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: SPACING.paddingBottom50 }}
      >
        {activeTab === 'Device Setup' && (
          <View>
            <Text style={styles.sectionTitle}>imeds AUTO CPAP</Text>
            {renderVideoCard()}
            {renderVideoCard()}
          </View>
        )}

        {activeTab === 'How to Use' && (
          <View>
            <Text style={styles.sectionTitle}>imeds AUTO CPAP</Text>
            {renderVideoCard()}
            {renderVideoCard()}
          </View>
        )}

        {activeTab === 'In General' && (
          <View>
            <Text style={styles.sectionTitle}>imeds AUTO CPAP</Text>
            {renderVideoCard()}
            {renderVideoCard()}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default LibraryDeviceSetUp;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.paddingContainer,
    paddingTop: SPACING.paddingTop,
  },
  description: {
    color: COLORS.primaryText,
    fontSize: SIZES.fontSize14,
    marginBottom: SPACING.marginBottom16,
  },
  tabRow: {
    flexDirection: 'row',
    marginBottom: SPACING.marginBottom20,
    gap: SPACING.gap10,
  },
  tabButton: {
    paddingVertical: SPACING.paddingVertical8,
    paddingHorizontal: SPACING.paddingHorizontal14,
    backgroundColor: COLORS.secondaryBackground,
    borderRadius: BORDER_RADIUS.tabButton,
  },
  activeTabButton: {
    backgroundColor: COLORS.primaryButton,
  },
  tabText: {
    color: COLORS.secondaryText,
    fontSize: SIZES.fontSize13,
  },
  activeTabText: {
    color: COLORS.primaryText,
    ...COMMON_STYLES.boldFont,
  },
  sectionTitle: {
    color: COLORS.primaryText,
    fontSize: SIZES.fontSize16,
    ...COMMON_STYLES.boldFont,
    marginBottom: SPACING.marginBottom12,
  },
  card: {
    backgroundColor: COLORS.secondaryBackground,
    borderRadius: BORDER_RADIUS.card,
    overflow: 'hidden',
    marginBottom: SPACING.marginBottom16,
  },
  cardImage: {
    ...COMMON_STYLES.cardImage,
  },
  cardContent: {
    padding: SPACING.paddingCard,
  },
  cardTitle: {
    color: COLORS.primaryText,
    fontSize: SIZES.fontSize15,
    fontWeight: '600',
  },
  cardSubtitle: {
    color: COLORS.mutedText,
    fontSize: SIZES.fontSize13,
    marginTop: SPACING.marginTop4,
  },
  placeholder: {
    color: COLORS.mutedText,
    fontSize: SIZES.fontSize14,
    marginTop: SPACING.marginBottom20,
  },
});
