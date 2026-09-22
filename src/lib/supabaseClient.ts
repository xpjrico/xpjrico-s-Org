import { supabase, isSupabaseConfigured as isConfigured } from './supabase';

export const getSupabaseClient = (): any => {
  return isConfigured ? supabase : null;
};

export const isSupabaseConfigured = (): boolean => {
  return isConfigured;
};


