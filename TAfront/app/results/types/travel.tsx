export type FlightOption = {
  id: string;
  carrier_code: string;
  departure_time: string;
  arrival_time: string;
  stops: number;
  price_total: number | string | null;
};

export type HotelOption = {
  name: string;
  night_price: number | string | null;
  overall_rating: number | null;
  reviews_count: number | null;
  link: string | null;
  distance_km?: number | null;
};

export type ChatBackendState = {
  last_agent?: "flight" | "hotel" | "both";
  has_flights: boolean;
  has_hotels: boolean;
  weather_info?: {
    avg_temp_c: number;
    condition: string;
    packing_note: string;
  } | null;
};