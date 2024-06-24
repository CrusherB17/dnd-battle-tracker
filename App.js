import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MonstersScreen from './screens/MonstersScreen';

export default function App() {
  return (
    <View style={styles.container}>
      <Text>This will be a DnD battle tracker</Text>
      <Text>Hello</Text>
      <View>
        <Text>Charisma</Text>
      </View>
      <MonstersScreen />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
