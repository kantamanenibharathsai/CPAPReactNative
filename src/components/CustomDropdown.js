import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Animated,
  Dimensions,
  Pressable,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Portal } from 'react-native-portalize';

const { height: screenHeight } = Dimensions.get('window');

const CustomDropdown = ({
  label,
  placeholder,
  items,
  value,
  onValueChange,
  containerStyle,
  dropdownStyle,
  itemTextStyle,
  selectedItemTextStyle,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const animation = useRef(new Animated.Value(0)).current;
  const headerRef = useRef(null);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  });

  const openDropdown = useCallback(() => {
    headerRef.current.measureInWindow((x, y, width, height) => {
      setDropdownPosition({
        top: y + height,
        left: x,
        width: width,
        height: height,
      });
      setIsOpen(true);
      Animated.timing(animation, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }, [animation]);

  const closeDropdown = useCallback(() => {
    Animated.timing(animation, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setIsOpen(false));
  }, [animation]);

  const handleSelect = itemValue => {
    onValueChange(itemValue);
    closeDropdown();
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.dropdownItem}
      onPress={() => handleSelect(item.value)}
    >
      <Text
        style={[
          styles.dropdownItemText,
          itemTextStyle,
          value === item.value &&
            (selectedItemTextStyle || styles.selectedItemText),
        ]}
      >
        {item.label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        ref={headerRef}
        style={[styles.dropdownHeader, dropdownStyle]}
        onPress={openDropdown}
      >
        <Text style={value ? styles.selectedText : styles.placeholderText}>
          {value
            ? items.find(item => item.value === value)?.label
            : placeholder}
        </Text>
        <Ionicons
          name={isOpen ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={20}
          color="#fff"
        />
      </TouchableOpacity>
      {isOpen && (
        <Portal>
          <Pressable style={styles.portalOverlay} onPress={closeDropdown}>
            <Animated.View
              style={[
                styles.dropdownList,
                {
                  top: dropdownPosition.top,
                  left: dropdownPosition.left,
                  width: dropdownPosition.width,
                  opacity: animation,
                  transform: [
                    {
                      scaleY: animation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.9, 1],
                      }),
                    },
                  ],
                },
              ]}
              onStartShouldSetResponder={() => true}
              onResponderRelease={() => {}}
            >
              <FlatList
                data={items}
                keyExtractor={item => item.value.toString()}
                renderItem={renderItem}
              />
            </Animated.View>
          </Pressable>
        </Portal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    color: '#fff',
    marginBottom:8,
    fontSize: 14,
     marginTop: 9
  },
  dropdownHeader: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderColor: '#444',
    borderWidth: 1,
  },
  placeholderText: {
    color: '#aaa',
  },
  selectedText: {
    color: '#fff',
  },
  portalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dropdownList: {
    position: 'absolute',
    backgroundColor: '#1B2430',
    borderRadius: 8,
    borderColor: '#555',
    borderWidth: 1,
    maxHeight: screenHeight * 0.4,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  dropdownItemText: {
    color: '#fff',
    fontSize: 16,
  },
  selectedItemText: {
    fontWeight: 'bold',
    color: '#7A86E0',
  },
});

export default CustomDropdown;
