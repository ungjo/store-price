import { SafeAreaProvider } from 'react-native-safe-area-context';
import { sampleProducts } from './src/data/sample-products';
import { ShoppingScreen } from './src/screens/shopping-screen';

export default function App() {
  return (
    <SafeAreaProvider>
      <ShoppingScreen products={sampleProducts} sourceLabel="자체 예시 상품" />
    </SafeAreaProvider>
  );
}
