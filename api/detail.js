// api/detail.js
// 施設詳細 + クチコミ取得

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://ytsurusawa.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { place_id } = req.query;
  if (!place_id) return res.status(400).json({ error: 'place_id は必須です' });

  const GKEY = process.env.GOOGLE_PLACES_KEY;
  if (!GKEY) return res.status(500).json({ error: 'APIキーが設定されていません' });

  try {
    const fields = [
      'place_id', 'name', 'vicinity', 'formatted_address',
      'geometry', 'opening_hours', 'rating', 'user_ratings_total',
      'reviews', 'types', 'wheelchair_accessible_entrance',
      'photos', 'website', 'formatted_phone_number'
    ].join(',');

    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', place_id);
    url.searchParams.set('fields', fields);
    url.searchParams.set('language', 'ja');
    url.searchParams.set('key', GKEY);

    const r = await fetch(url.toString());
    const json = await r.json();
    const p = json.result;
    if (!p) return res.status(404).json({ error: '施設が見つかりません' });

    // クチコミからベビー設備を解析
    const reviews = (p.reviews || []).map(rv => rv.text).filter(Boolean);
    const babyInfo = analyzeReviews(p.name, reviews, p);

    return res.status(200).json({ result: p, babyInfo });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// キーワード解析でベビー設備を判定
function analyzeReviews(name, reviews, place) {
  const text = reviews.join(' ').toLowerCase();
  const types = place.types || [];

  const KW_DIAPER  = ['おむつ','オムツ','diaper','changing','ベビーシート','赤ちゃん','ベビールーム','乳幼児','ベビー休憩'];
  const KW_NURSING = ['授乳','nursing','哺乳','mother room','ベビールーム','授乳室','授乳スペース'];
  const KW_BARRIER = ['バリアフリー','車椅子','wheelchair','多目的','ユニバーサル','accessible','エレベーター'];
  const KW_OSTO    = ['オストメイト','ostomate','ストーマ'];

  const hasDiaper  = KW_DIAPER.some(k  => text.includes(k.toLowerCase()));
  const hasNursing = KW_NURSING.some(k => text.includes(k.toLowerCase()));
  const hasBarrier = KW_BARRIER.some(k => text.includes(k.toLowerCase()))
                     || place.wheelchair_accessible_entrance;
  const hasOsto    = KW_OSTO.some(k    => text.includes(k.toLowerCase()));

  // 施設タイプから推定（ショッピングモール・駅は高確率でベビー設備あり）
  const isMall    = types.some(t => ['shopping_mall','department_store'].includes(t));
  const isStation = types.some(t => ['train_station','subway_station','transit_station'].includes(t));
  const isHosp    = types.some(t => ['hospital'].includes(t));

  const tags = [];
  if (hasDiaper || isMall)  tags.push('diaper');
  if (hasNursing || isMall) tags.push('nursing');
  if (hasBarrier || isStation || isHosp) tags.push('barrier');
  if (hasOsto) tags.push('ostomate');
  if (!tags.length) tags.push('barrier');

  const feats = [];
  if (hasDiaper)  feats.push('🍼 クチコミにおむつ替えの記載あり');
  if (hasNursing) feats.push('🤱 クチコミに授乳室の記載あり');
  if (hasBarrier) feats.push('♿ バリアフリー対応');
  if (hasOsto)    feats.push('🏥 オストメイト設備の記載あり');
  if (isMall)     feats.push('🏬 大型商業施設（ベビー設備の可能性が高い）');
  if (isStation)  feats.push('🚃 駅施設（多目的トイレが多い）');

  const hits = [hasDiaper, hasNursing, hasBarrier, hasOsto].filter(Boolean).length;

  return {
    tags,
    feats,
    hasDiaper,
    hasNursing,
    hasBarrier,
    hasOsto,
    confidence: hits >= 2 ? 'high' : hits === 1 ? 'mid' : isMall || isStation ? 'mid' : 'low',
    reviewCount: reviews.length,
  };
}
