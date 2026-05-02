// api/places.js
// Vercel Serverless Function
// Google Places API プロキシ（CORS対応）

export default async function handler(req, res) {
  // CORS設定（GitHub PagesのURLのみ許可）
  res.setHeader('Access-Control-Allow-Origin', 'https://ytsurusawa.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { lat, lng, radius = 2000, type } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat, lng は必須です' });
  }

  const GKEY = process.env.GOOGLE_PLACES_KEY;
  if (!GKEY) {
    return res.status(500).json({ error: 'APIキーが設定されていません' });
  }

  try {
    // 検索する施設タイプ
    // キーワード検索でベビー設備のある施設を幅広く取得
    const keywords = [
      'ショッピングモール', 'イオン', 'ららぽーと', '駅', '病院',
      '区役所', '市役所', '公園', 'アウトレット', 'イトーヨーカドー'
    ];

    const allResults = [];
    const seen = new Set();

    // まずキーワードなしで周辺の主要施設を取得
    const baseTypes = ['shopping_mall', 'train_station', 'hospital', 'city_hall', 'park'];

    await Promise.allSettled(baseTypes.map(async t => {
      const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
      url.searchParams.set('location', `${lat},${lng}`);
      url.searchParams.set('radius', radius);
      url.searchParams.set('type', t);
      url.searchParams.set('language', 'ja');
      url.searchParams.set('key', GKEY);

      const r = await fetch(url.toString());
      const json = await r.json();
      (json.results || []).forEach(p => {
        if (!seen.has(p.place_id)) {
          seen.add(p.place_id);
          allResults.push(p);
        }
      });
    }));

    // キーワード検索でさらに施設を追加
    if (allResults.length < 5) {
      await Promise.allSettled(keywords.slice(0, 3).map(async kw => {
        const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
        url.searchParams.set('location', `${lat},${lng}`);
        url.searchParams.set('radius', radius);
        url.searchParams.set('keyword', kw);
        url.searchParams.set('language', 'ja');
        url.searchParams.set('key', GKEY);

        const r = await fetch(url.toString());
        const json = await r.json();
        (json.results || []).forEach(p => {
          if (!seen.has(p.place_id)) {
            seen.add(p.place_id);
            allResults.push(p);
          }
        });
      }));
    }

    return res.status(200).json({ results: allResults });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
