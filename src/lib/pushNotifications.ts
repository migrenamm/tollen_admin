import { supabase } from './supabase';

export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  orderId?: string
): Promise<void> {
  try {
    const { data } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (!data?.token) return;

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: data.token,
        title,
        body,
        sound: 'default',
        data: orderId ? { orderId } : {},
      }),
    });
  } catch {
    // Don't block the status update if notification fails
  }
}
