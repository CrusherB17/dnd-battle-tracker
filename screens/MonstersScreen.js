import { useEffect, useState } from "react";
import { View, Text, FlatList } from "react-native"


const MonstersScreen = () => {
  const [monsters, setMonsters] = useState([])

  useEffect(() => {
    getMonsters();
  }, []);

  const getMonsters = () => {
    
    const URL = 'https://www.dnd5eapi.co/api/monsters'
    
    fetch(URL)
      .then(response => {
        return response.json()
      })
      .then(data => {
        setMonsters(data.results);
      })
  };
  console.log(monsters)

  return (
    <View>
      <Text>Monsters</Text>
      <Text>More</Text>
      <FlatList
        data={monsters}
        renderItem={({ item }) => (
          <View>
            <Text>{item.name}</Text>

          </View>
        )}
      />
    </View>
  )
}

export default MonstersScreen
