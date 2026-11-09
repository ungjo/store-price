import { StatusBar } from 'expo-status-bar';
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { sampleProducts } from './src/data/sample-products';

// 원 단위 정수 가격에 천 단위 구분 기호를 붙입니다. 원래 가격 값은 바꾸지 않습니다.
const won = new Intl.NumberFormat('ko-KR');

export default function App() {
  const { width, fontScale } = useWindowDimensions();
  // 좁은 화면이나 큰 글자 설정에서는 상품을 한 줄에 하나씩 보여 읽기 쉽게 합니다.
  const columns = width >= 360 && fontScale <= 1.4 ? 2 : 1;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        {/* 열 수가 바뀌면 key도 바꿔 FlatList를 새로 만들어 열 변경 오류를 피합니다. */}
        <FlatList
          key={columns}
          data={sampleProducts}
          numColumns={columns}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.content}
          columnWrapperStyle={columns === 2 ? styles.row : undefined}
          ListHeaderComponent={
            <View>
              <View style={styles.brand}>
                <Text style={styles.brandIcon} accessible={false}>🌱</Text>
                <Text style={styles.brandName}>꼬마 시장</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>시장놀이</Text>
                </View>
              </View>

              <View style={styles.welcome}>
                <Text style={styles.eyebrow}>어서 오세요!</Text>
                <Text style={styles.title} accessibilityRole="header">
                  오늘은 무엇을{'\n'}사 볼까요?
                </Text>
                <Text style={styles.description}>
                  알록달록 우리 가게에서{'\n'}물건과 가격을 살펴봐요.
                </Text>
                <View style={styles.awning} accessible={false}>
                  {Array.from({ length: 10 }, (_, index) => (
                    <View
                      key={index}
                      style={[styles.stripe, index % 2 === 0 && styles.greenStripe]}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>연습용 예시 가격이에요</Text>
                <Text style={styles.noticeText}>
                  놀이를 위해 만든 가격이에요.{'\n'}실제 이마트 판매 가격이 아니에요.
                </Text>
              </View>

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle} accessibilityRole="header">우리 가게 물건</Text>
                <Text style={styles.count}>{sampleProducts.length}가지</Text>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={styles.product}
              accessible
              accessibilityLabel={item.name + ', ' + item.unit + ', 연습용 가격 ' + won.format(item.priceKrw) + '원'}
            >
              <View style={[styles.productPicture, { backgroundColor: item.color }]}>
                <Text style={styles.emoji}>{item.emoji}</Text>
              </View>
              <Text style={styles.productName}>{item.name}</Text>
              <Text style={styles.unit}>{item.unit}</Text>
              <Text style={styles.price}>{won.format(item.priceKrw)}원</Text>
            </View>
          )}
          ListFooterComponent={
            <View style={styles.footer}>
              <Text style={styles.footerTitle}>함께 이야기해요</Text>
              <Text style={styles.footerText}>
                어떤 물건이 가장 저렴할까요?{'\n'}가족이나 친구와 가격을 읽어 보세요.
              </Text>
            </View>
          }
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAF8F0' },
  list: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
  content: { padding: 20, paddingBottom: 36 },
  row: { gap: 14 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' },
  brandIcon: { fontSize: 25 },
  brandName: { fontSize: 22, fontWeight: '800', color: '#234F40' },
  badge: { backgroundColor: '#E6EEDC', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontSize: 13, fontWeight: '700', color: '#36543A' },
  welcome: { backgroundColor: '#E9EEDC', borderRadius: 24, overflow: 'hidden', paddingTop: 26 },
  eyebrow: { color: '#416A45', fontSize: 16, fontWeight: '700', paddingHorizontal: 24 },
  title: { color: '#204839', fontSize: 34, fontWeight: '800', lineHeight: 45, paddingHorizontal: 24, marginTop: 8 },
  description: { color: '#46614D', fontSize: 17, lineHeight: 27, paddingHorizontal: 24, marginTop: 12, marginBottom: 26 },
  awning: { flexDirection: 'row', height: 18 },
  stripe: { flex: 1, backgroundColor: '#F3D28A', borderBottomLeftRadius: 7, borderBottomRightRadius: 7 },
  greenStripe: { backgroundColor: '#6D8D69' },
  notice: { marginTop: 18, borderWidth: 1, borderColor: '#E4D8B5', borderRadius: 16, padding: 16, backgroundColor: '#FFF9E8' },
  noticeTitle: { color: '#765522', fontWeight: '700', fontSize: 16 },
  noticeText: { color: '#705C3B', fontSize: 14, lineHeight: 22, marginTop: 6 },
  sectionHeading: { marginTop: 28, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  sectionTitle: { fontSize: 21, fontWeight: '800', color: '#293D31' },
  count: { fontSize: 15, color: '#596B5B' },
  product: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECEDE3', borderRadius: 20, padding: 14, marginBottom: 14 },
  productPicture: { borderRadius: 14, minHeight: 110, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 54 },
  productName: { fontSize: 19, fontWeight: '700', color: '#293D31', marginTop: 14 },
  unit: { fontSize: 14, color: '#627064', marginTop: 5 },
  price: { fontSize: 22, fontWeight: '800', color: '#255B42', marginTop: 10 },
  footer: { borderRadius: 18, padding: 20, backgroundColor: '#EAF0E5', marginTop: 10 },
  footerTitle: { fontSize: 17, fontWeight: '700', color: '#315239' },
  footerText: { fontSize: 15, lineHeight: 25, color: '#4E6653', marginTop: 8 },
});
