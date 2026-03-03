import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/utils';

interface SupportChat {
  id: string;
  user_id: string;
  order_id: string | null;
  status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  profiles: { full_name: string | null; phone: string | null };
  orders: { order_number: number; status: string; created_at: string } | null;
  lastMessage?: { content: string; is_admin: boolean; created_at: string } | null;
}

interface Message {
  id: string;
  chat_id: string;
  sender_id: string | null;
  content: string;
  is_admin: boolean;
  created_at: string;
}

const ORDER_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending:   { label: '⏳ Pending',    cls: 'bg-yellow-100 text-yellow-700' },
  confirmed: { label: '✅ Confirmed',  cls: 'bg-blue-100 text-blue-700' },
  picked_up: { label: '🚗 Picked Up', cls: 'bg-indigo-100 text-indigo-700' },
  cleaning:  { label: '🧺 Cleaning',   cls: 'bg-purple-100 text-purple-700' },
  ready:     { label: '✨ Ready',      cls: 'bg-teal-100 text-teal-700' },
  delivered: { label: '✅ Delivered',  cls: 'bg-green-100 text-green-700' },
  cancelled: { label: '❌ Cancelled',  cls: 'bg-red-100 text-red-700' },
};

export default function Support() {
  const { profile: adminProfile } = useAuth();
  const [chats, setChats] = useState<SupportChat[]>([]);
  const [selectedChat, setSelectedChat] = useState<SupportChat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadChats(); }, []);

  useEffect(() => {
    if (!selectedChat) return;
    loadMessages(selectedChat.id);
    loadCustomerOrders(selectedChat.user_id);

    // Realtime: listen for new messages in selected chat
    const channel = supabase
      .channel(`admin-support-${selectedChat.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'support_messages',
        filter: `chat_id=eq.${selectedChat.id}`,
      }, payload => {
        setMessages(prev => [...prev, payload.new as Message]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedChat?.id]);

  async function loadChats() {
    setLoading(true);
    const { data } = await supabase
      .from('support_chats')
      .select(`
        *,
        profiles!user_id(full_name, phone),
        orders(order_number, status, created_at)
      `)
      .order('updated_at', { ascending: false });

    if (!data) { setLoading(false); return; }

    // Fetch last message for each chat
    const withLastMsg = await Promise.all(
      data.map(async chat => {
        const { data: msgs } = await supabase
          .from('support_messages')
          .select('content, is_admin, created_at')
          .eq('chat_id', chat.id)
          .order('created_at', { ascending: false })
          .limit(1);
        return { ...chat, lastMessage: msgs?.[0] ?? null };
      })
    );

    setChats(withLastMsg as SupportChat[]);
    setLoading(false);
  }

  async function loadMessages(chatId: string) {
    setLoadingMsgs(true);
    const { data } = await supabase
      .from('support_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    setMessages((data ?? []) as Message[]);
    setLoadingMsgs(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 100);
  }

  async function loadCustomerOrders(userId: string) {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, status, created_at, type, speed, total')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    setCustomerOrders(data ?? []);
  }

  async function sendReply() {
    if (!replyText.trim() || !selectedChat || !adminProfile?.id || sending) return;
    const content = replyText.trim();
    setReplyText('');
    setSending(true);
    await supabase.from('support_messages').insert({
      chat_id: selectedChat.id,
      sender_id: adminProfile.id,
      content,
      is_admin: true,
    });
    await supabase.from('support_chats')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', selectedChat.id);
    setSending(false);
    // Refresh chat list to update last message preview
    loadChats();
  }

  async function toggleChatStatus(chat: SupportChat) {
    const newStatus = chat.status === 'open' ? 'closed' : 'open';
    await supabase.from('support_chats').update({ status: newStatus }).eq('id', chat.id);
    setChats(prev => prev.map(c => c.id === chat.id ? { ...c, status: newStatus } : c));
    if (selectedChat?.id === chat.id) setSelectedChat(prev => prev ? { ...prev, status: newStatus } : null);
  }

  const hasUnread = (chat: SupportChat) =>
    chat.lastMessage && !chat.lastMessage.is_admin;

  return (
    <div className="flex h-full">
      {/* ── Chat list ── */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Support Chats</h2>
          <button
            onClick={loadChats}
            className="text-xs text-gray-400 hover:text-primary"
          >
            🔄
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : chats.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No support chats yet</div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {chats.map(chat => {
              const isSelected = selectedChat?.id === chat.id;
              const unread = hasUnread(chat);
              const orderNum = chat.orders ? `#TOLL-${String(chat.orders.order_number).padStart(4, '0')}` : '—';
              return (
                <button
                  key={chat.id}
                  onClick={() => setSelectedChat(chat)}
                  className={`w-full text-left px-4 py-3.5 transition-colors hover:bg-gray-50 ${isSelected ? 'bg-primary/5 border-r-2 border-primary' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {unread && <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />}
                        <p className={`text-sm font-semibold text-gray-900 truncate ${unread ? 'font-bold' : ''}`}>
                          {chat.profiles?.full_name ?? chat.profiles?.phone ?? 'Unknown'}
                        </p>
                      </div>
                      <p className="text-xs text-primary font-medium mt-0.5">{orderNum}</p>
                      {chat.lastMessage && (
                        <p className={`text-xs mt-1 truncate ${unread ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                          {chat.lastMessage.is_admin ? '↩ ' : ''}{chat.lastMessage.content}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${chat.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {chat.status === 'open' ? 'Open' : 'Closed'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(chat.updated_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Main area ── */}
      {!selectedChat ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="text-5xl mb-3">💬</div>
            <p className="font-medium">Select a chat to view the conversation</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Chat column */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Chat header */}
            <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900">
                  {selectedChat.profiles?.full_name ?? selectedChat.profiles?.phone ?? 'Unknown'}
                </p>
                <p className="text-xs text-primary font-semibold">
                  {selectedChat.orders
                    ? `#TOLL-${String(selectedChat.orders.order_number).padStart(4, '0')} · ${ORDER_STATUS_LABEL[selectedChat.orders.status]?.label ?? selectedChat.orders.status}`
                    : 'No order'}
                </p>
              </div>
              <button
                onClick={() => toggleChatStatus(selectedChat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  selectedChat.status === 'open'
                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                    : 'bg-green-50 text-green-600 hover:bg-green-100'
                }`}
              >
                {selectedChat.status === 'open' ? '🔒 Close Chat' : '🔓 Reopen Chat'}
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-gray-50">
              {loadingMsgs ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">No messages yet</div>
              ) : (
                messages.map(msg => {
                  const isAdmin = msg.is_admin;
                  const time = new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                        isAdmin
                          ? 'bg-primary text-white rounded-br-sm'
                          : 'bg-white text-gray-800 shadow-sm rounded-bl-sm'
                      }`}>
                        {!isAdmin && (
                          <p className="text-xs text-primary font-semibold mb-1">
                            {selectedChat.profiles?.full_name ?? 'Customer'}
                          </p>
                        )}
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                        <p className={`text-xs mt-1 ${isAdmin ? 'text-white/60 text-right' : 'text-gray-400'}`}>
                          {time}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Reply input */}
            <div className="px-4 py-3 border-t border-gray-200 bg-white flex gap-2">
              {selectedChat.status === 'closed' ? (
                <div className="flex-1 text-center text-sm text-gray-400 py-2">
                  This chat is closed. Reopen it to reply.
                </div>
              ) : (
                <>
                  <textarea
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
                    rows={2}
                    placeholder="Type your reply..."
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                  />
                  <button
                    onClick={sendReply}
                    disabled={!replyText.trim() || sending}
                    className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 self-end"
                  >
                    {sending ? '...' : '↑ Send'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── Customer orders panel ── */}
          <div className="w-64 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">All Customer Orders</p>
              <p className="text-sm font-semibold text-gray-700 mt-0.5">
                {selectedChat.profiles?.full_name ?? selectedChat.profiles?.phone ?? 'Unknown'}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {customerOrders.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No orders</p>
              ) : customerOrders.map(order => {
                const tNum = `#TOLL-${String(order.order_number).padStart(4, '0')}`;
                const statusInfo = ORDER_STATUS_LABEL[order.status];
                const isCurrentOrder = order.id === selectedChat.order_id;
                return (
                  <div key={order.id} className={`rounded-xl p-3 border ${isCurrentOrder ? 'border-primary bg-primary/5' : 'border-gray-100 bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${isCurrentOrder ? 'text-primary' : 'text-gray-700'}`}>
                        {tNum} {isCurrentOrder && '← this chat'}
                      </span>
                    </div>
                    {statusInfo && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusInfo.cls}`}>
                        {statusInfo.label}
                      </span>
                    )}
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-xs text-gray-400">{formatDate(order.created_at)}</span>
                      {order.total > 0 && (
                        <span className="text-xs font-bold text-gray-700">{Number(order.total).toFixed(0)} SAR</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
