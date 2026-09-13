export type Outcome = "YES" | "NO";
export type Operator = "above" | "below";
export type AlertStatus = "active" | "triggered" | "disabled";

export interface Market {
  id: string;
  name: string;
  description?: string;
  category?: string;
  yesCoin: string;
  noCoin: string;
  yesPrice: number | null;
  noPrice: number | null;
  closesAt?: string | null;
}

export interface Alert {
  id: string;
  user_id: string;
  market_id: string;
  market_name: string;
  outcome: Outcome;
  operator: Operator;
  threshold: number;
  status: AlertStatus;
  last_observed_price: number | null;
  triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  telegram_user_id: number | null;
  telegram_chat_id: number | null;
  telegram_username: string | null;
  telegram_connected_at: string | null;
  created_at: string;
}
