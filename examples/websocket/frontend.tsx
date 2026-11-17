'use client';

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { SocketClient } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

type User = {
  id: string;
  username: string;
}

type Message = {
  id: string;
  user: User;
  text: string;
  ts: number;
}

type Props = {
  wsUrl: string;
  token: string;
  username: string;
}

export default function ChatClient({ wsUrl, token, username }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    const socket = io(wsUrl, { auth: { token, username } });
    socket.on('message', (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
    });
    return () => socket.disconnect();
  }, [wsUrl, token, username]);

  function send() {
    if (!text.trim()) return;
    const socket = io(wsUrl, { auth: { token, username } });
    socket.emit('message', { text });
    setText('');
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Live Chat</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-72 w-full rounded-md border p-2">
          {messages.map((m) => (
            <div key={m.id} className="text-sm">
              <b>{m.user.username}:</b> {m.text}
            </div>
          ))}
        </ScrollArea>
        <div className="mt-2 flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Type a message"
          />
          <Button onClick={send}>Send</Button>
        </div>
      </CardContent>
    </Card>
  );
}