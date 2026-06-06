import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://fsrknhittjbqtbersqjd.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzcmtuaGl0dGpicXRiZXJzcWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MzA1ODAsImV4cCI6MjA5NjMwNjU4MH0.LxY1k1AfCTQpTxeVx-9RppYh4ESVP6kyNR8U3Y2Ng00'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
