import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// TODO: Implement eBay Browse API call once API credentials are available
// eBay developer account: developer.ebay.com
// Endpoint: GET https://api.ebay.com/buy/browse/v1/item_summary/search
//   params: q="{card name} {set} {condition}", filter=buyingOptions:{AUCTION|FIXED_PRICE},completedItems:true

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FetchPriceRequest {
  card_id: string;
  condition: string;
  variant?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { card_id, condition, variant = 'standard' }: FetchPriceRequest = await req.json();

    if (!card_id || !condition) {
      return new Response(JSON.stringify({ error: 'card_id and condition are required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Check cache first
    const { data: cached } = await supabase
      .from('price_cache')
      .select('*')
      .eq('card_id', card_id)
      .eq('condition', condition)
      .eq('variant', variant)
      .gt('expires_at', new Date().toISOString())
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single();

    if (cached) {
      return new Response(JSON.stringify({ price: cached, cached: true }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Fetch card details for search query construction
    const { data: card, error: cardError } = await supabase
      .from('cards')
      .select('*')
      .eq('id', card_id)
      .single();

    if (cardError || !card) {
      return new Response(JSON.stringify({ error: 'Card not found' }), {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // TODO: Route to the correct pricing function based on card.game
    // - pokemon, onepiece: fetchEbayPrice(card, condition)
    // - mtg: fetchScryfallPrice(card, condition)
    // - yugioh: fetchYGOProDeckPrice(card, condition) || fetchEbayPrice(card, condition)
    const price = await fetchPlaceholderPrice(card, condition);

    // Cache the result
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 6);

    await supabase.from('price_cache').upsert({
      card_id,
      variant,
      condition,
      market_price: price.market_price,
      low_price: price.low_price,
      mid_price: price.mid_price,
      high_price: price.high_price,
      sale_count: price.sale_count,
      source: price.source,
      fetched_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    });

    return new Response(JSON.stringify({ price, cached: false }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('fetch-price error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

// Placeholder — replace with real eBay API call
async function fetchPlaceholderPrice(_card: unknown, _condition: string) {
  return {
    market_price: 0,
    low_price: 0,
    mid_price: 0,
    high_price: 0,
    sale_count: 0,
    source: 'manual' as const,
  };
}
